import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { requirePermission } from "$lib/server/permissionGuard";
import { isUuid } from "$lib/server/db/ids";
import { createUser } from "$lib/server/userService";
import { listRoles } from "$lib/server/roleService";
import { issueToken } from "$lib/server/auth/passwordReset";
import { SmtpNotConfiguredError, sendEmail } from "$lib/server/emailService";
import { inviteTemplate } from "$lib/server/emailTemplates/passwordReset";

/**
 * Neuen Zugang anlegen.
 *
 * Vorher wurden die Gruppen des externen Anbieters ueber dessen API geladen
 * und der Benutzer dort mit einem zufaelligen Passwort erzeugt, das im
 * Klartext an den Aufrufer zurueckging. Jetzt entsteht ein eingeladener
 * Zugang ohne Passwort; die Vergabe erfolgt ueber einen Aktivierungslink.
 *
 * Der Ausgang wird ueber `?hinweis=` weitergereicht, weil ein 303 das
 * `form`-Objekt verwirft. Drei Faelle sind zu unterscheiden:
 *
 *   eingeladen          -- angelegt UND versendet
 *   mail-fehlgeschlagen -- angelegt, Versand gescheitert
 *   smtp-fehlt          -- angelegt, es ist gar kein Versand eingerichtet
 *
 * Ohne diese Unterscheidung sah der Erfolgsfall genauso aus wie der Fehler:
 * die Liste zeigte keine Rueckmeldung, der zweite Versuch scheiterte an der
 * bereits vergebenen Adresse und wirkte wie ein Fehler des Anlegens.
 */

export const load: PageServerLoad = async (event) => {
    requirePermission(event, "user.create");

    const roles = await listRoles();
    return {
        roles: roles.map((role) => ({
            id: role.id,
            key: role.key,
            name: role.name,
            description: role.description ?? ""
        }))
    };
};

export const actions: Actions = {
    createUser: async (event) => {
        requirePermission(event, "user.create");

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();
        const type = String(form.get("type") ?? "parent") === "child" ? "child" : "parent";
        const roleIds = form.getAll("roles").map(String).filter(isUuid);

        const values = { name, email };

        if (!name) return fail(400, { error: "Bitte einen Namen angeben.", ...values });
        if (!email.includes("@")) {
            return fail(400, { error: "Bitte eine gültige E-Mail-Adresse angeben.", ...values });
        }

        const result = await createUser({ name, email, type, roleIds, status: "invited" });

        if (!result.ok || !result.user) {
            // Die doppelte Adresse ist der haeufigste Fall und kommt als
            // 23505 aus der Datenbank -- 409 statt 400.
            const duplicate = (result.error ?? "").includes("existiert bereits");
            return fail(duplicate ? 409 : 400, {
                error: result.error ?? "Der Zugang konnte nicht angelegt werden.",
                ...values
            });
        }

        const created = result.user;

        // Aktivierungslink verschicken; ein Fehlschlag darf die Anlage nicht
        // rueckgaengig machen -- der Link laesst sich spaeter erneut senden.
        try {
            const { token } = await issueToken(created.id, "invite");
            const base = env.PUBLIC_APP_URL || event.url.origin;
            await sendEmail({
                to: created.email,
                subject: "Dein Zugang zum internen Bereich",
                html: inviteTemplate(created.name, `${base}/password/reset/${token}`, 14)
            });
        } catch (err) {
            // Kein Postausgang eingerichtet ist etwas anderes als ein
            // gescheiterter Versand -- das eine behebt ein Administrator,
            // beim anderen genuegt ein zweiter Versuch.
            if (err instanceof SmtpNotConfiguredError) {
                throw redirect(303, `/intern/admin/user/${created.id}?hinweis=smtp-fehlt`);
            }
            console.error("Einladungsmail konnte nicht versendet werden:", err);
            throw redirect(303, `/intern/admin/user/${created.id}?hinweis=mail-fehlgeschlagen`);
        }

        throw redirect(303, "/intern/admin/user?hinweis=eingeladen");
    }
};
