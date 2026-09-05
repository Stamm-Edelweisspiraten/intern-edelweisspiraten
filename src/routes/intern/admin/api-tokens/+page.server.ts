import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import {
    createApiToken,
    deleteApiToken,
    listApiTokens,
    revokeApiToken
} from "$lib/server/api/tokens";
import { getAllDefinedPermissions } from "$lib/server/permissionService";

/**
 * Zugangstoken der REST-API.
 *
 * Der Klartext wird genau einmal angezeigt -- danach steht in der Datenbank
 * nur noch sein Hash. Wer ihn verliert, legt ein neues Token an.
 */

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    return {
        tokens: await listApiTokens(),
        permissions: getAllDefinedPermissions()
    };
};

export const actions: Actions = {
    create: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const scopes = form.getAll("scopes").map(String);
        const expiresValue = String(form.get("expiresAt") ?? "");

        if (!name) return fail(400, { error: "Bitte eine Bezeichnung angeben." });

        const expiresAt = expiresValue ? new Date(expiresValue) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
            return fail(400, { error: "Bitte ein gültiges Ablaufdatum angeben." });
        }
        if (expiresAt && expiresAt <= new Date()) {
            return fail(400, { error: "Das Ablaufdatum liegt in der Vergangenheit." });
        }

        const result = await createApiToken({
            name,
            scopes,
            expiresAt,
            createdBy: event.locals.user?.id ?? null,
            createdByName: event.locals.user?.name ?? event.locals.user?.email
        });

        if (!result.ok) return fail(400, { error: result.error });

        return {
            success: "Das Token wurde erzeugt. Es wird nur jetzt angezeigt.",
            token: result.token
        };
    },

    revoke: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const ok = await revokeApiToken(String(form.get("id") ?? ""));

        if (!ok) return fail(404, { error: "Das Token wurde nicht gefunden." });
        return { success: "Das Token wurde widerrufen." };
    },

    delete: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const ok = await deleteApiToken(String(form.get("id") ?? ""));

        if (!ok) return fail(404, { error: "Das Token wurde nicht gefunden." });
        return { success: "Das Token wurde gelöscht." };
    }
};
