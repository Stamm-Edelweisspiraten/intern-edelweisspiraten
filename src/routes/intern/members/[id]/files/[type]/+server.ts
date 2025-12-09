import { error } from "@sveltejs/kit";
import { getMember } from "$lib/server/memberService";
import { hasPermission } from "$lib/server/permissionService";
import { getMemberFile } from "$lib/server/fileStore";

export async function GET({ params, locals }) {
    if (!hasPermission(locals.permissions ?? [], "members.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const memberId = params.id;
    const type = params.type;

    if (!["consent", "application"].includes(type)) {
        throw error(400, "Ungültiger Dateityp");
    }

    const member = await getMember(memberId);
    if (!member) throw error(404, "Mitglied nicht gefunden");

    const meta = type === "consent" ? member.consentFile : member.applicationFile;
    if (!meta?.id) throw error(404, "Datei nicht gefunden");

    const stored = await getMemberFile(meta.id);
    if (!stored) throw error(404, "Datei nicht gefunden");

    const headers = new Headers({
        "Content-Type": meta.contentType ?? stored.file.contentType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${meta.filename}"`,
    });

    if (meta.size) {
        headers.set("Content-Length", meta.size.toString());
    }

    return new Response(stored.stream as any, {
        status: 200,
        headers
    });
}
