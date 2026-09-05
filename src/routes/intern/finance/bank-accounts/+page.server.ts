import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    createBankAccount,
    deleteBankAccount,
    listBankAccounts,
    updateBankAccount
} from "$lib/server/finance/bankAccountService";
import { isValidIban } from "$lib/server/settingsService";
import { parseEuro } from "$lib/money";
import { matchesPermission } from "$lib/permissions/match";

/** Kassen- und Bankkonten. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    return {
        accounts: await listBankAccounts(),
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

function readIban(form: FormData): { ok: boolean; value: string; error?: string } {
    const raw = String(form.get("iban") ?? "").trim();
    if (!raw) return { ok: true, value: "" };
    if (!isValidIban(raw)) {
        return { ok: false, value: raw, error: "Die IBAN ist nicht gültig." };
    }
    return { ok: true, value: raw };
}

export const actions: Actions = {
    create: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        if (!name) return fail(400, { error: "Bitte einen Namen angeben." });

        const iban = readIban(form);
        if (!iban.ok) return fail(400, { error: iban.error });

        const opening = parseEuro(String(form.get("openingBalance") ?? "0"));
        if (opening === null) {
            return fail(400, { error: "Der Anfangsbestand ist kein gültiger Betrag." });
        }

        const result = await createBankAccount({
            name,
            accountHolder: String(form.get("accountHolder") ?? ""),
            iban: iban.value,
            bic: String(form.get("bic") ?? ""),
            bankName: String(form.get("bankName") ?? ""),
            isCash: form.get("isCash") === "on",
            openingBalance: opening
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: `Das Konto „${name}“ wurde angelegt.` };
    },

    update: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const iban = readIban(form);
        if (!iban.ok) return fail(400, { error: iban.error });

        const opening = parseEuro(String(form.get("openingBalance") ?? "0"));
        if (opening === null) {
            return fail(400, { error: "Der Anfangsbestand ist kein gültiger Betrag." });
        }

        const result = await updateBankAccount(String(form.get("id") ?? ""), {
            name: String(form.get("name") ?? ""),
            accountHolder: String(form.get("accountHolder") ?? ""),
            iban: iban.value,
            bic: String(form.get("bic") ?? ""),
            bankName: String(form.get("bankName") ?? ""),
            openingBalance: opening
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Das Konto wurde gespeichert." };
    },

    toggle: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await updateBankAccount(String(form.get("id") ?? ""), {
            active: String(form.get("active")) === "true"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Status des Kontos wurde geändert." };
    },

    delete: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await deleteBankAccount(String(form.get("id") ?? ""));

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Das Konto wurde gelöscht." };
    }
};
