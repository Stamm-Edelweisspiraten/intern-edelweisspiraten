import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getFinanceSettings, saveFinanceSettings } from "$lib/server/settingsService";
import { hasPermission } from "$lib/server/permissionService";

const canView = (perms: string[]) =>
    hasPermission(perms, "admin.*") || hasPermission(perms, "system.settings.view");

const canUpdate = (perms: string[]) =>
    hasPermission(perms, "admin.*") || hasPermission(perms, "system.settings.update");

export const load: PageServerLoad = async ({ locals }) => {
    const perms = locals.permissions ?? [];
    if (!canView(perms)) {
        throw error(403, "Keine Berechtigung");
    }

    const finance = await getFinanceSettings();

    return {
        finance,
        canUpdate: canUpdate(perms)
    };
};

export const actions: Actions = {
    updateFinance: async ({ request, locals }) => {
        const perms = locals.permissions ?? [];
        if (!canUpdate(perms)) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();

        const toNumber = (val: FormDataEntryValue | null) => {
            const num = parseFloat((val ?? "").toString().replace(",", "."));
            return isNaN(num) ? 0 : num;
        };

        const finance = {
            contributions: {
                stamm: toNumber(form.get("contrib_stamm")),
                gau: toNumber(form.get("contrib_gau")),
                landesmark: toNumber(form.get("contrib_landesmark")),
                bund: toNumber(form.get("contrib_bund"))
            }
        };

        try {
            await saveFinanceSettings(finance, locals.user?.userinfo?.email ?? "system");
            return { success: true, finance };
        } catch (err: any) {
            return fail(500, { error: err?.message ?? "Speichern fehlgeschlagen." });
        }
    }
};
