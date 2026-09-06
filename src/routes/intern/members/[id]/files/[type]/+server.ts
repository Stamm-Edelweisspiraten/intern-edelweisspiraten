import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMember } from "$lib/server/memberService";
import { requirePermissionForAnyGroup } from "$lib/server/permissionGuard";
import { getMemberFile, signedUrlFor } from "$lib/server/fileStore";
import { downloadHeaders } from "$lib/server/http/download";

/**
 * Einwilligung und Aufnahmeantrag eines Mitglieds.
 *
 * Verlangte vorher members.view STAMMESWEIT -- eine Gruppenleitung kam
 * dadurch nicht an die Unterlagen der eigenen Mitglieder, obwohl sie deren
 * Datensatz sonst vollstaendig sieht. Jetzt zaehlt die Zustaendigkeit fuer
 * die Gruppen des Mitglieds.
 *
 * Zwei Dinge sind hier nachgezogen worden:
 *
 *   1. Der Dateiname stand UNGEFILTERT in `Content-Disposition`. Ein Name mit
 *      Anfuehrungszeichen oder Zeilenumbruch schleuste damit weitere
 *      Kopfzeilen ein. Jetzt baut `downloadHeaders()` den Satz -- dieselbe
 *      Funktion wie in allen anderen Dateirouten, samt `nosniff`.
 *   2. Der Objektspeicher wurde nicht genutzt: Mitgliedsunterlagen liefen
 *      immer durch diesen Server, auch wenn sie oben lagen. Jetzt wird wie in
 *      /intern/dateien auf eine kurzlebige Adresse weitergeleitet.
 */
export const GET: RequestHandler = async (event) => {
    const memberId = event.params.id;
    const type = event.params.type;

    if (!["consent", "application"].includes(type)) {
        throw error(400, "Ungültiger Dateityp");
    }

    const member = await getMember(memberId);
    if (!member) throw error(404, "Mitglied nicht gefunden");

    requirePermissionForAnyGroup(event, "members.view", member.groups);

    const meta = type === "consent" ? member.consentFile : member.applicationFile;
    if (!meta?.id) throw error(404, "Datei nicht gefunden");

    const forceDownload = event.url.searchParams.get("download") === "1";

    if (!forceDownload) {
        const signed = await signedUrlFor(meta.id, { filename: meta.filename });
        if (signed) throw redirect(302, signed);
    }

    const stored = await getMemberFile(meta.id);
    if (!stored) throw error(404, "Datei nicht gefunden");

    // Buffer ist kein gueltiger BodyInit; die Ansicht darauf schon.
    return new Response(new Uint8Array(stored.content), {
        status: 200,
        headers: downloadHeaders({
            contentType: meta.contentType || stored.file.contentType,
            filename: meta.filename || stored.file.filename,
            length: stored.content.byteLength,
            forceDownload,
            // Mitgliedsunterlagen gehoeren nicht in einen Zwischenspeicher.
            cacheControl: "private, no-store"
        })
    });
};
