import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { hasEncryptionKey } from "$lib/server/crypto";
import {
    getSmtpConfigView,
    resolveEncryption,
    saveSmtpConfig,
    smtpFromEnv
} from "$lib/server/email/settings";
import { describeSmtpError, resetMailTransport, sendTestMail, verifySmtp } from "$lib/server/emailService";

/**
 * Postausgang einrichten.
 *
 * Drei Vorgaenge: speichern, Verbindung pruefen, Testnachricht senden. Die
 * Pruefung meldet sich nur beim Server an und sendet nichts -- ein Zugang,
 * der zwar anmeldet, aber den Absender ablehnt, faellt erst bei der
 * Testnachricht auf. Deshalb gibt es beides.
 *
 * Das Passwort wird nie an die Seite geschickt. Bleibt das Feld leer, bleibt
 * das hinterlegte Passwort unveraendert.
 */

const GUARD = ["admin.view", "system.settings.update"] as const;

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    return {
        config: await getSmtpConfigView(),
        hasEncryptionKey: hasEncryptionKey(),
        fromEnv: smtpFromEnv(),
        // Vorbelegung der Testnachricht: die eigene Adresse ist die einzige,
        // in die der Pruefende auch hineinschauen kann.
        testAddress: event.locals.user?.email ?? ""
    };
};

export const actions: Actions = {
    save: async (event) => {
        requireAnyPermission(event, GUARD);

        const form = await event.request.formData();
        const actor = event.locals.user?.email ?? "system";
        const port = Number(String(form.get("port") ?? "").trim());

        const result = await saveSmtpConfig(
            {
                host: String(form.get("host") ?? "").trim(),
                port,
                user: String(form.get("user") ?? "").trim(),
                password: String(form.get("password") ?? ""),
                encryption: resolveEncryption(form.get("encryption"), port),
                fromEmail: String(form.get("fromEmail") ?? "").trim(),
                fromName: String(form.get("fromName") ?? "").trim(),
                replyTo: String(form.get("replyTo") ?? "").trim()
            },
            actor
        );

        if (!result.ok) return fail(400, { error: result.error });

        // Der zwischengespeicherte Transport traegt noch die alten Daten.
        resetMailTransport();

        return { success: "Die Einstellungen wurden gespeichert." };
    },

    test: async (event) => {
        requireAnyPermission(event, GUARD);

        const result = await verifySmtp();
        if (!result.ok) return fail(400, { error: result.error });

        return { success: "Verbindung erfolgreich: der Server ist erreichbar und nimmt die Anmeldung an." };
    },

    testmail: async (event) => {
        requireAnyPermission(event, GUARD);

        const form = await event.request.formData();
        const to = String(form.get("to") ?? "").trim();

        if (!to.includes("@")) {
            return fail(400, { error: "Bitte eine gültige Empfängeradresse angeben." });
        }

        try {
            const result = await sendTestMail(to);
            if (!result.ok) return fail(400, { error: result.error });
            return { success: `Die Testnachricht wurde an ${to} übergeben.` };
        } catch (err) {
            // sendTestMail faengt selbst; dieser Zweig deckt alles ab, was
            // schon beim Lesen der Einstellung schiefgeht.
            return fail(400, { error: describeSmtpError(err) });
        }
    }
};
