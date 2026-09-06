import type { Actions, PageServerLoad } from "./$types";
import { getAllUsers, deleteUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { redirect, fail } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/permissionGuard";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "user.view");

    const users = await getAllUsers();
    const members = await getAllMembers();

    /**
     * Die Liste filtert NICHT: ein frisch angelegter Zugang steht auf
     * `invited` und muss unmittelbar nach dem Anlegen zu sehen sein. Der
     * Status wandert deshalb mit und wird als Abzeichen gezeigt -- ohne ihn
     * war ein eingeladener Zugang von einem aktiven nicht zu unterscheiden.
     */
    const normalized = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        memberIds: u.memberIds,
        createdAt: u.createdAt
    }));

    return {
        users: normalized,
        members: members.map((m) => ({
            id: m.id,
            name: `${m.firstname} ${m.lastname}`
        }))
    };
};

export const actions: Actions = {
    delete: async (event) => {
        // Jede Action sichert sich selbst ab -- der Guard im load laeuft bei
        // einer Form-Action gar nicht erst.
        requirePermission(event, "user.delete");

        const { request, locals } = event;

        const form = await request.formData();
        const id = form.get("id");

        // Vorher ein blankes `return`: die Seite lud neu und sah aus, als
        // waere geloescht worden.
        if (typeof id !== "string" || !id) {
            return fail(400, { error: "Es wurde kein Zugang angegeben." });
        }

        // Denselben Schutz wie auf der Detailseite: wer sich selbst loescht,
        // sperrt sich mitten in der Sitzung aus.
        if (locals.user?.id === id) {
            return fail(400, { error: "Der eigene Zugang kann nicht gelöscht werden." });
        }

        const removed = await deleteUser(id);
        if (!removed) return fail(404, { error: "Der Zugang wurde nicht gefunden." });

        throw redirect(303, "/intern/admin/user?hinweis=geloescht");
    }
};
