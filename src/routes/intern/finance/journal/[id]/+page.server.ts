import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requirePermission } from "$lib/server/permissionGuard";
import { getEntry, reverseEntry } from "$lib/server/finance/journalService";
import { getFiscalYear } from "$lib/server/finance/yearService";
import { matchesPermission } from "$lib/permissions/match";

/** Einzelner Buchungssatz mit allen Zeilen. */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "finance.view");

    const entry = await getEntry(event.params.id);
    if (!entry) throw error(404, "Buchungssatz nicht gefunden");

    const [year, reversal, original] = await Promise.all([
        getFiscalYear(entry.fiscalYearId),
        entry.reversedById ? getEntry(entry.reversedById) : Promise.resolve(null),
        entry.reversesId ? getEntry(entry.reversesId) : Promise.resolve(null)
    ]);

    return {
        entry,
        year,
        reversal: reversal ? { id: reversal.id, entryNo: reversal.entryNo } : null,
        original: original ? { id: original.id, entryNo: original.entryNo } : null,
        canManage: matchesPermission(event.locals.permissions, "finance.manage")
    };
};

export const actions: Actions = {
    reverse: async (event) => {
        requirePermission(event, "finance.manage");

        const form = await event.request.formData();
        const result = await reverseEntry(
            event.params.id,
            event.locals.user?.email ?? "system",
            String(form.get("reason") ?? "")
        );

        if (!result.ok) return fail(400, { error: result.error });
        return { success: `Storno unter ${result.entryNo} gebucht.` };
    }
};
