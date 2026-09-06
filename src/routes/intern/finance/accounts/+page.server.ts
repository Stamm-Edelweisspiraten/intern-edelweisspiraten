import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import {
    accountBalances,
    createAccount,
    deleteAccount,
    listAccounts,
    updateAccount
} from "$lib/server/finance/accountService";
import { ensureChartOfAccounts, hasChartOfAccounts } from "$lib/server/finance/chartOfAccounts";
import { listCategories } from "$lib/server/finance/categoryService";
import { matchesPermission } from "$lib/permissions/match";
import type { AccountSphere, AccountType } from "$lib/server/finance/types";

/** Kontenplan: Sachkonten und die Zuordnung der Buchungsarten. */

const TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
const SPHERES: AccountSphere[] = [
    "ideell",
    "vermoegensverwaltung",
    "zweckbetrieb",
    "wirtschaftlich",
    "neutral"
];

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const [accounts, balances, categories, seeded] = await Promise.all([
        listAccounts(),
        accountBalances(),
        listCategories(),
        hasChartOfAccounts()
    ]);

    return {
        accounts: accounts.map((account) => ({
            ...account,
            balance: balances.get(account.id) ?? 0
        })),
        categories,
        seeded,
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    /** Legt den mitgelieferten Vereins-Kontenrahmen an. */
    seed: async (event) => {
        requirePermission(event, "finance.manage");

        const result = await ensureChartOfAccounts();
        return {
            success:
                result.accounts === 0 && result.categories === 0
                    ? "Der Kontenrahmen war bereits vollständig angelegt."
                    : `${result.accounts} Konten und ${result.categories} Buchungsarten wurden angelegt.`
        };
    },

    create: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const type = String(form.get("type") ?? "");
        const sphere = String(form.get("sphere") ?? "ideell");

        if (!TYPES.includes(type as AccountType)) {
            return fail(400, { error: "Bitte eine gültige Kontoart wählen." });
        }

        const result = await createAccount(
            {
                number: String(form.get("number") ?? ""),
                name: String(form.get("name") ?? ""),
                type: type as AccountType,
                sphere: SPHERES.includes(sphere as AccountSphere)
                    ? (sphere as AccountSphere)
                    : "ideell",
                description: String(form.get("description") ?? "")
            },
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: `Das Konto ${result.account?.number} wurde angelegt.` };
    },

    update: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const id = String(form.get("id") ?? "");
        const sphere = String(form.get("sphere") ?? "");

        const result = await updateAccount(
            id,
            {
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                sphere: SPHERES.includes(sphere as AccountSphere)
                    ? (sphere as AccountSphere)
                    : undefined
            },
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Das Konto wurde gespeichert." };
    },

    toggle: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await updateAccount(
            String(form.get("id") ?? ""),
            { active: String(form.get("active")) === "true" },
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Der Status des Kontos wurde geändert." };
    },

    delete: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await deleteAccount(
            String(form.get("id") ?? ""),
            event.locals.user?.email ?? "system"
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Das Konto wurde gelöscht." };
    }
};
