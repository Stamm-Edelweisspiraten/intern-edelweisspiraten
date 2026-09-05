import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { requirePermission, requireAnyPermission } from "$lib/server/permissionGuard";
import { deleteUser, disableMfa, getUser, unlockUser, updateUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { getAllGroups } from "$lib/server/groupService";
import { listRoles } from "$lib/server/roleService";
import { isGroupScopable } from "$lib/permissions";
import { listSessionsForUser, revokeAllForUser, revokeSessionById } from "$lib/server/auth/session";
import { issueToken } from "$lib/server/auth/passwordReset";
import { sendEmail } from "$lib/server/emailService";
import { passwordResetTemplate } from "$lib/server/emailTemplates/passwordReset";
import { getOrganizationSettings } from "$lib/server/settingsService";
import { isUuid } from "$lib/server/db/ids";
import { matchesPermission } from "$lib/permissions/match";
import { formatDateTime, fullName } from "$lib/format";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "user.view");

    const user = await getUser(event.params.id);
    if (!user) throw error(404, "Benutzer nicht gefunden");

    const [members, groups, roles, sessions] = await Promise.all([
        getAllMembers(),
        getAllGroups(),
        listRoles(),
        listSessionsForUser(user.id)
    ]);

    return {
        canImpersonate: matchesPermission(event.locals.permissions, "user.impersonate"),
        canEdit: matchesPermission(event.locals.permissions, "user.edit"),
        canDelete: matchesPermission(event.locals.permissions, "user.delete"),
        isSelf: event.locals.user?.id === user.id,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            type: user.type,
            status: user.status,
            roleIds: user.roleIds,
            /** Zuweisungen samt Gruppenbezug; groupId null = stammesweit. */
            roleAssignments: user.roleAssignments,
            memberIds: user.memberIds,
            mfaEnabled: user.mfaEnabled,
            lockedUntil: user.lockedUntil ? formatDateTime(user.lockedUntil) : null,
            failedLoginAttempts: user.failedLoginAttempts,
            lastLoginAt: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null,
            createdAt: formatDateTime(user.createdAt)
        },
        roles: roles.map((role) => ({
            id: role.id,
            name: role.name,
            key: role.key,
            description: role.description ?? "",
            /**
             * Nur Rollen, die mindestens ein gruppenbezogenes Recht tragen,
             * bekommen die Gruppenauswahl. Eine Rolle mit finance.manage
             * "fuer die Meute Panther" waere sinnlos.
             */
            groupScopable: (role.permissions ?? []).some(isGroupScopable)
        })),
        groups: groups.map((group) => ({ id: group.id, name: group.name, type: group.type })),
        members: members.map((m) => ({
            id: m.id,
            name: fullName(m)
        })),
        sessions: sessions.map((session) => ({
            id: session.id,
            device: session.device ?? "Unbekanntes Gerät",
            ip: session.ip ?? "-",
            lastSeenAt: formatDateTime(session.lastSeenAt),
            createdAt: formatDateTime(session.createdAt),
            isCurrent: session.id === event.locals.session?.id
        }))
    };
};

export const actions: Actions = {
    update: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();
        const type = String(form.get("type") ?? "parent") === "child" ? "child" : "parent";
        const status = String(form.get("status") ?? "active");

        if (!name || !email.includes("@")) {
            return fail(400, { error: "Name und eine gültige E-Mail-Adresse sind erforderlich." });
        }

        const result = await updateUser(event.params.id, {
            name,
            email,
            type,
            status: status === "disabled" ? "disabled" : status === "invited" ? "invited" : "active"
        });

        if (!result.ok) return fail(400, { error: result.error });
        return { success: "Die Angaben wurden gespeichert." };
    },

    /**
     * Rollen zuweisen -- stammesweit und/oder je Gruppe.
     *
     * Das Formular schickt je Rolle ein Kaestchen "stammesweit" (Feld
     * `roles`) und die ausgewaehlten Gruppen (Feld `groups_<roleId>`). Beides
     * ist zugleich moeglich; stammesweit schliesst die Gruppen ohnehin ein,
     * die Zeilen stoeren aber nicht.
     */
    roles: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const orgWide = form.getAll("roles").map(String).filter(isUuid);

        const assignments = orgWide.map((roleId) => ({ roleId, groupId: null as string | null }));

        for (const [field, value] of form.entries()) {
            if (!field.startsWith("groups_")) continue;
            const roleId = field.slice("groups_".length);
            const groupId = String(value);
            if (!isUuid(roleId) || !isUuid(groupId)) continue;
            assignments.push({ roleId, groupId });
        }

        const result = await updateUser(event.params.id, { roleAssignments: assignments });
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die Rollen wurden gespeichert." };
    },

    members: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const memberIds = form.getAll("members").map(String).filter(Boolean);

        const result = await updateUser(event.params.id, { memberIds });
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Die verknüpften Mitglieder wurden gespeichert." };
    },

    /** Schickt einen Link zum Setzen eines neuen Passworts. */
    resetPassword: async (event) => {
        requirePermission(event, "user.edit");

        const user = await getUser(event.params.id);
        if (!user) return fail(404, { error: "Benutzer nicht gefunden." });

        try {
            const { token } = await issueToken(user.id, "reset");
            const base = env.PUBLIC_APP_URL || event.url.origin;
            const organization = await getOrganizationSettings();

            await sendEmail({
                to: user.email,
                subject: `Passwort zurücksetzen – ${organization.name}`,
                html: passwordResetTemplate(
                    user.name,
                    `${base}/password/reset/${token}`,
                    2,
                    organization.name
                )
            });
        } catch (err) {
            console.error("Passwort-Mail konnte nicht versendet werden:", err);
            return fail(500, { error: "Die E-Mail konnte nicht versendet werden." });
        }

        return { success: "Ein Link zum Zurücksetzen wurde versendet." };
    },

    /** Entfernt die Zwei-Faktor-Einrichtung, z.B. bei Geräteverlust. */
    resetMfa: async (event) => {
        requireAnyPermission(event, ["user.edit", "user.mfa.reset"]);

        if (!isUuid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await disableMfa(event.params.id);

        return { success: "Die Zwei-Faktor-Authentifizierung wurde zurückgesetzt." };
    },

    /** Hebt eine Kontosperre nach zu vielen Fehlversuchen auf. */
    unlock: async (event) => {
        requirePermission(event, "user.edit");

        if (!isUuid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await unlockUser(event.params.id);

        return { success: "Die Sperre wurde aufgehoben." };
    },

    revokeSession: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const sessionId = String(form.get("sessionId") ?? "");

        if (!isUuid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await revokeSessionById(sessionId, event.params.id);
        return { success: "Die Sitzung wurde beendet." };
    },

    revokeAllSessions: async (event) => {
        requirePermission(event, "user.edit");

        if (!isUuid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        const count = await revokeAllForUser(event.params.id);
        return { success: `${count} Sitzungen wurden beendet.` };
    },

    delete: async (event) => {
        requirePermission(event, "user.delete");

        if (event.locals.user?.id === event.params.id) {
            return fail(400, { error: "Der eigene Zugang kann nicht gelöscht werden." });
        }

        await deleteUser(event.params.id);
        throw redirect(303, "/intern/admin/user?hinweis=geloescht");
    }
};
