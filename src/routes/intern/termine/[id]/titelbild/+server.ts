import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { groupsWithPermission, requirePermission } from "$lib/server/permissionGuard";
import { getEvent } from "$lib/server/eventService";
import { readFile, signedUrlFor } from "$lib/server/fileStore";
import { downloadHeaders } from "$lib/server/http/download";

/**
 * Das Titelbild eines Termins.
 *
 * Warum eine eigene Route und nicht die signierte Adresse direkt im HTML?
 * Weil eine signierte Adresse ein Ausweis auf Zeit ist: steht sie im
 * Seitenquelltext, wandert sie in Lesezeichen, Verläufe und weitergeleitete
 * Screenshots und umgeht dabei jede Rechteprüfung. Hier wird stattdessen bei
 * jedem Abruf geprüft -- und zwar mit derselben Sichtbarkeitsregel wie die
 * Terminseite selbst (`getEvent` liefert `null`, wenn der Termin nicht
 * angezeigt werden dürfte).
 *
 * Anders als bei Mitgliedsunterlagen ist ein Zwischenspeicher hier erwünscht:
 * das Bild steht im Kopf der Detailseite und als Vorschau in der Liste, also
 * mehrfach je Seitenaufruf. `downloadHeaders` setzt sonst `private,
 * no-store`, weshalb `cacheControl` ausdrücklich mitgegeben wird -- `private`
 * bleibt, ein gemeinsamer Zwischenspeicher darf es nicht aufbewahren.
 */
export const GET: RequestHandler = async (event) => {
    requirePermission(event, "events.view");

    const manageGroups = groupsWithPermission(event, "events.manage");

    const entry = await getEvent(
        event.params.id,
        { id: event.locals.user?.id, memberIds: event.locals.user?.memberIds ?? [] },
        { manageAll: manageGroups === null, manageGroups }
    );

    if (!entry?.coverFileId) throw error(404, "Titelbild nicht gefunden");

    /**
     * Liegt die Datei im Objektspeicher, geht der Inhalt an diesem Server
     * vorbei. KEIN `throw redirect`: der trägt keine eigenen Kopfzeilen, und
     * die Weiterleitung selbst soll kurz zwischengespeichert werden dürfen --
     * kürzer als das Bild, weil die Signatur abläuft.
     */
    const signed = await signedUrlFor(entry.coverFileId);
    if (signed) {
        return new Response(null, {
            status: 302,
            headers: { Location: signed, "Cache-Control": "private, max-age=60" }
        });
    }

    const stored = await readFile(entry.coverFileId);
    if (!stored) throw error(404, "Titelbild nicht gefunden");

    return new Response(new Uint8Array(stored.content), {
        status: 200,
        headers: downloadHeaders({
            contentType: stored.contentType,
            filename: stored.filename,
            length: stored.content.byteLength,
            cacheControl: "private, max-age=300"
        })
    });
};
