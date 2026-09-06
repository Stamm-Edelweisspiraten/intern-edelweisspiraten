import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getFinanceSettings, isValidIban, saveFinanceSettings } from "$lib/server/settingsService";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { matchesAnyPermission } from "$lib/permissions/match";
import { parseEuro } from "$lib/money";

/**
 * Einstellungen der Kasse: Beitragssaetze und Bankverbindung.
 *
 * Die Bankdaten sind neu -- der Beitragsbescheid als PDF war bereits fertig
 * umgesetzt und druckte einen Abschnitt "Bankverbindung", es gab aber
 * nirgends einen Ort, an dem IBAN, BIC oder Kontoinhaber hinterlegt werden
 * konnten. Entsprechend war das PDF an keine Route angeschlossen.
 */

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    return {
        finance: await getFinanceSettings(),
        canUpdate: matchesAnyPermission(event.locals.permissions, [
            "admin.view",
            "system.settings.update"
        ])
    };
};

export const actions: Actions = {
    updateFinance: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const contributions = { stamm: 0, gau: 0, landesmark: 0, bund: 0 };

        for (const field of ["stamm", "gau", "landesmark", "bund"] as const) {
            const value = parseEuro(String(form.get(`contrib_${field}`) ?? "0"));
            if (value === null || value < 0) {
                return fail(400, { error: `Der Beitrag "${field}" ist kein gültiger Betrag.` });
            }
            contributions[field] = value;
        }

        // Bestehende Bankdaten mitnehmen, wenn das Formular sie nicht sendet --
        // sonst wuerde ein Speichern der Beitragssaetze sie loeschen.
        const current = await getFinanceSettings();
        const iban = String(form.get("bank_iban") ?? current.bank.iban).replace(/\s+/g, "").toUpperCase();

        if (iban && !isValidIban(iban)) {
            return fail(400, { error: "Die IBAN ist nicht gültig." });
        }

        const bank = {
            accountHolder: String(form.get("bank_accountHolder") ?? current.bank.accountHolder),
            iban,
            bic: String(form.get("bank_bic") ?? current.bank.bic).replace(/\s+/g, "").toUpperCase(),
            bankName: String(form.get("bank_bankName") ?? current.bank.bankName),
            creditorId: String(form.get("bank_creditorId") ?? current.bank.creditorId)
        };

        try {
            await saveFinanceSettings(
                { contributions, bank },
                event.locals.user?.email ?? "system"
            );
            return { success: "Die Einstellungen wurden gespeichert." };
        } catch (err) {
            console.error("Einstellungen konnten nicht gespeichert werden:", err);
            return fail(500, { error: "Die Einstellungen konnten nicht gespeichert werden." });
        }
    }
};
