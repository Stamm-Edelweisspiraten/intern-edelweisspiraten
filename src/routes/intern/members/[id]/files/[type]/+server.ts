import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMember } from "$lib/server/memberService";
import { requirePermissionForAnyGroup } from "$lib/server/permissionGuard";
import { getMemberFile } from "$lib/server/fileStore";

/**
 * Einwilligung und Aufnahmeantrag eines Mitglieds.
 *
 * Verlangte vorher members.view STAMMESWEIT -- eine Gruppenleitung kam
 * dadurch nicht an die Unterlagen der eigenen Mitglieder, obwohl sie deren
 * Datensatz sonst vollstaendig sieht. Jetzt zaehlt die Zustaendigkeit fuer
 * die Gruppen des Mitglieds.
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

    const stored = await getMemberFile(meta.id);
    if (!stored) throw error(404, "Datei nicht gefunden");

    const headers = new Headers({
        "Content-Type": meta.contentType || stored.file.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${meta.filename}"`,
        "Content-Length": String(stored.content.byteLength),
        // Mitgliedsunterlagen gehoeren nicht in einen Zwischenspeicher.
        "Cache-Control": "no-store"
    });

    // Buffer ist kein gueltiger BodyInit; die Ansicht darauf schon.
    return new Response(new Uint8Array(stored.content), { status: 200, headers });
};
