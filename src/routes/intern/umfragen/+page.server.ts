import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
    groupsWithPermission,
    requireGroupsWithPermission,
    requirePermission
} from "$lib/server/permissionGuard";
import {
    deleteSurvey,
    listSurveys,
    mayManageSurvey,
    setSurveyStatus
} from "$lib/server/surveyService";
import { sharesGrantGroupScope } from "$lib/server/shareService";

/**
 * Übersicht der Umfragen.
 *
 * Die Schaltflächen je Zeile kommen vom Server (`canManage`, `canResults`),
 * nicht aus `page.data.permissions`: die Rechte gelten stammesweit ODER für
 * einzelne Gruppen, und die Liste in `permissions` kennt nur den stammesweiten
 * Teil. Eine Meutenführung mit `surveys.manage` für ihre Meute stünde dort
 * nicht -- darf die auf ihre Meute freigegebene Umfrage aber verwalten.
 *
 * Angelegt wird hier NICHT mehr. Der Anlegen-Dialog erzeugte einen Entwurf,
 * dem die Fragen erst auf der Detailseite folgten; wer abbrach, ließ eine
 * leere Umfrage zurück. Das übernimmt jetzt der Assistent unter
 * `/intern/umfragen/neu`, der alles in einem Zug speichert.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "surveys.view");

    const manageGroups = groupsWithPermission(event, "surveys.manage");
    const resultGroups = groupsWithPermission(event, "surveys.results");
    const mayCreate = manageGroups === null || manageGroups.length > 0;

    const viewer = {
        id: event.locals.user?.id,
        memberIds: event.locals.user?.memberIds ?? []
    };

    const entries = await listSurveys(viewer, {
        manageAll: manageGroups === null,
        manageGroups
    });

    return {
        surveys: entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            description: entry.description,
            status: entry.status,
            audience: entry.audience,
            anonymous: entry.anonymous,
            multiplePerUser: entry.multiplePerUser,
            eventId: entry.eventId,
            eventTitle: entry.eventTitle,
            opensAt: entry.opensAt?.toISOString() ?? null,
            closesAt: entry.closesAt?.toISOString() ?? null,
            fieldCount: entry.fields.length,
            responseCount: entry.responseCount,
            shares: entry.shares,
            createdAt: entry.createdAt.toISOString(),
            canManage: sharesGrantGroupScope(entry.shares, manageGroups),
            canResults: sharesGrantGroupScope(entry.shares, resultGroups)
        })),
        mayCreate
    };
};

export const actions: Actions = {
    publish: async (event) => {
        const scope = requireGroupsWithPermission(event, "surveys.manage");

        const form = await event.request.formData();
        const id = String(form.get("surveyId") ?? "");
        if (!(await mayManageSurvey(id, scope))) throw error(403, "Keine Berechtigung");

        const result = await setSurveyStatus(id, "published");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Umfrage ist jetzt veröffentlicht." };
    },

    close: async (event) => {
        const scope = requireGroupsWithPermission(event, "surveys.manage");

        const form = await event.request.formData();
        const id = String(form.get("surveyId") ?? "");
        if (!(await mayManageSurvey(id, scope))) throw error(403, "Keine Berechtigung");

        const result = await setSurveyStatus(id, "closed");
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Umfrage nimmt keine Antworten mehr an." };
    },

    delete: async (event) => {
        const scope = requireGroupsWithPermission(event, "surveys.manage");

        const form = await event.request.formData();
        const id = String(form.get("surveyId") ?? "");
        if (!(await mayManageSurvey(id, scope))) throw error(403, "Keine Berechtigung");

        await deleteSurvey(id);
        return { success: "Die Umfrage wurde mit allen Antworten gelöscht." };
    }
};
