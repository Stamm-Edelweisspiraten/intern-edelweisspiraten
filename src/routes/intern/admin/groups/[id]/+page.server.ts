import type { Actions, PageServerLoad } from "./$types";
import { getGroup, updateGroup } from "$lib/server/groupService";
import { requirePermission } from "$lib/server/permissionGuard";
import { getGroupAccess } from "$lib/server/permissionService";
import { labelFor } from "$lib/permissions/labels";

/**
 * Eine Gruppe im Adminbereich.
 *
 * Neu daneben: die Uebersicht "Wer hat hier welche Rechte". Seit Rollen je
 * Gruppe vergeben werden koennen -- direkt an einen Zugang oder ueber ein Amt
 * mit Gruppenbezug -- war sonst nirgends ablesbar, wer in einer Gruppe was
 * darf.
 */
export const load: PageServerLoad = async (event) => {
    requirePermission(event, "groups.view");

    const group = await getGroup(event.params.id);

    if (!group) {
        return { group: null, scope: null, access: [] };
    }

    const access = await getGroupAccess(group.id);

    return {
        group,
        scope: event.url.searchParams.get("scope"), // "edit" oder null
        access: access.map((entry) => ({
            ...entry,
            // Fuer die Anzeige: deutsche Beschriftungen statt roher Schluessel.
            labels: entry.permissions.map((permission) => labelFor(permission))
        }))
    };
};

export const actions: Actions = {
    update: async (event) => {
        requirePermission(event, "groups.edit");

        const form = await event.request.formData();

        await updateGroup(event.params.id, {
            name: String(form.get("name") ?? ""),
            type: form.get("type") as "sippe" | "meute",
            meeting_time: String(form.get("meeting_time") ?? ""),
            description: String(form.get("description") ?? ""),
            replyTo: form.get("replyTo")?.toString() ?? ""
        });

        return { success: true };
    }
};
