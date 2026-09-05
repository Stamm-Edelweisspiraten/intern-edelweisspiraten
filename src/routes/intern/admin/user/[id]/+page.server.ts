import { error, fail, redirect } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { requirePermission, requireAnyPermission } from "$lib/server/permissionGuard";
import { getUser, updateUser, deleteUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";
import { listRoles } from "$lib/server/roleService";
import { users } from "$lib/server/db/collections";
import { listSessionsForUser, revokeAllForUser, revokeSessionById } from "$lib/server/auth/session";
import { issueToken } from "$lib/server/auth/passwordReset";
import { sendEmail } from "$lib/server/emailService";
import { passwordResetTemplate } from "$lib/server/emailTemplates/passwordReset";
import { matchesPermission } from "$lib/permissions/match";
import { formatDateTime, fullName } from "$lib/format";

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "user.view");

    const user = await getUser(event.params.id);
    if (!user) throw error(404, "Benutzer nicht gefunden");

    const [members, roles, sessions] = await Promise.all([
        getAllMembers(),
        listRoles(),
        listSessionsForUser(user._id!)
    ]);

    return {
        canImpersonate: matchesPermission(event.locals.permissions, "user.impersonate"),
        canEdit: matchesPermission(event.locals.permissions, "user.edit"),
        canDelete: matchesPermission(event.locals.permissions, "user.delete"),
        isSelf: event.locals.user?.id === user._id!.toString(),
        user: {
            id: user._id!.toString(),
            name: user.name,
            email: user.email,
            type: user.type,
            status: user.status,
            roleIds: (user.roleIds ?? []).map((id) => id.toString()),
            memberIds: (user.memberIds ?? []).map(String),
            mfaEnabled: user.mfa?.enabled === true,
            lockedUntil: user.lockedUntil ? formatDateTime(user.lockedUntil) : null,
            failedLoginAttempts: user.failedLoginAttempts ?? 0,
            lastLoginAt: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null,
            createdAt: formatDateTime(user.createdAt)
        },
        roles: roles.map((role) => ({
            id: role._id!.toString(),
            name: role.name,
            key: role.key,
            description: role.description ?? ""
        })),
        members: members.map((m) => ({
            id: String(m._id),
            name: fullName(m as { firstname?: string; lastname?: string })
        })),
        sessions: sessions.map((session) => ({
            id: session._id!.toString(),
            device: session.device ?? "Unbekanntes Gerät",
            ip: session.ip ?? "-",
            lastSeenAt: formatDateTime(session.lastSeenAt),
            createdAt: formatDateTime(session.createdAt),
            isCurrent: session._id!.toString() === event.locals.session?.id
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

    roles: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const roleIds = form
            .getAll("roles")
            .map(String)
            .filter((id) => ObjectId.isValid(id))
            .map((id) => new ObjectId(id));

        const result = await updateUser(event.params.id, { roleIds });
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
        if (!user?._id) return fail(404, { error: "Benutzer nicht gefunden." });

        try {
            const { token } = await issueToken(user._id, "reset");
            const base = env.PUBLIC_APP_URL || event.url.origin;
            await sendEmail({
                to: user.email,
                subject: "Passwort zurücksetzen - Edelweisspiraten Intern",
                html: passwordResetTemplate(user.name, `${base}/password/reset/${token}`, 2)
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

        if (!ObjectId.isValid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await users().updateOne(
            { _id: new ObjectId(event.params.id) },
            { $set: { mfa: { enabled: false }, updatedAt: new Date() } }
        );

        return { success: "Die Zwei-Faktor-Authentifizierung wurde zurückgesetzt." };
    },

    /** Hebt eine Kontosperre nach zu vielen Fehlversuchen auf. */
    unlock: async (event) => {
        requirePermission(event, "user.edit");

        if (!ObjectId.isValid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await users().updateOne(
            { _id: new ObjectId(event.params.id) },
            { $set: { failedLoginAttempts: 0, lockedUntil: null } }
        );

        return { success: "Die Sperre wurde aufgehoben." };
    },

    revokeSession: async (event) => {
        requirePermission(event, "user.edit");

        const form = await event.request.formData();
        const sessionId = String(form.get("sessionId") ?? "");

        if (!ObjectId.isValid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        await revokeSessionById(sessionId, new ObjectId(event.params.id));
        return { success: "Die Sitzung wurde beendet." };
    },

    revokeAllSessions: async (event) => {
        requirePermission(event, "user.edit");

        if (!ObjectId.isValid(event.params.id)) {
            return fail(400, { error: "Ungültige Kennung." });
        }

        const count = await revokeAllForUser(new ObjectId(event.params.id));
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
