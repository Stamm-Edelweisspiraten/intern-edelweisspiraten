import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { requireGroupsWithPermission } from "$lib/server/permissionGuard";
import { getMembersByIds, inviteCodeState, type Member } from "$lib/server/memberService";
import { csvDocument } from "$lib/server/csv";
import { downloadHeaders } from "$lib/server/http/download";
import { formatDate } from "$lib/format";

/**
 * Einladungslinks mehrerer Mitglieder als EINE Datei.
 *
 * Bewusst ein `+server.ts` und keine Form-Action: eine Action antwortet mit
 * einem ActionResult, sie kann keine Datei ausliefern. Die Mitgliederliste
 * schickt deshalb ein gewoehnliches `<form method="post">` mit versteckten
 * Feldern hierher -- das funktioniert auch ohne JavaScript.
 *
 * Der Link selbst (`/join/<uuid>`) ist KEIN Geheimnis; das Geheimnis ist der
 * sechsstellige Code daneben, der nach INVITE_CODE_TTL_DAYS ablaeuft. Fehlt
 * ein Code, bleibt die Linkspalte deshalb leer statt einen Link auszugeben,
 * mit dem sich niemand anmelden kann.
 */

type Format = "csv" | "json" | "txt";

const FORMATS: Record<Format, { contentType: string; extension: string }> = {
    csv: { contentType: "text/csv; charset=utf-8", extension: "csv" },
    json: { contentType: "application/json; charset=utf-8", extension: "json" },
    txt: { contentType: "text/plain; charset=utf-8", extension: "txt" }
};

const COLUMNS = ["name", "email", "invitation_link", "code", "status", "expires_at"] as const;

interface Row {
    name: string;
    email: string;
    invitation_link: string;
    code: string;
    status: "gueltig" | "abgelaufen" | "fehlt";
    expires_at: string;
}

function toRow(member: Member, baseUrl: string): Row {
    const status = inviteCodeState(member);

    return {
        name: [member.firstname, member.lastname].filter(Boolean).join(" ").trim(),
        email: member.emails.find((entry) => entry.email)?.email ?? "",
        // Ohne Code ist der Link unbrauchbar -- dann lieber gar keiner.
        invitation_link: status === "fehlt" ? "" : `${baseUrl}/join/${member.id}`,
        code: member.inviteCode ?? "",
        status,
        expires_at: member.inviteCodeExpiresAt ?? ""
    };
}

function asCsv(rows: Row[]): string {
    return csvDocument([
        [...COLUMNS],
        ...rows.map((row) => [
            row.name,
            row.email,
            row.invitation_link,
            row.code,
            row.status,
            row.expires_at ? formatDate(row.expires_at, "") : ""
        ])
    ]);
}

function asJson(rows: Row[]): string {
    // Im JSON bleibt der Zeitstempel maschinenlesbar (ISO 8601); die
    // Textformate zeigen ihn deutsch.
    return `${JSON.stringify({ generatedAt: new Date().toISOString(), members: rows }, null, 4)}\n`;
}

function asText(rows: Row[]): string {
    const LABELS: Record<Row["status"], string> = {
        gueltig: "gültig bis",
        abgelaufen: "abgelaufen am",
        fehlt: "kein Code hinterlegt"
    };

    return rows
        .map((row) => {
            const lines = [row.name];
            if (row.email) lines.push(`E-Mail: ${row.email}`);
            if (row.invitation_link) lines.push(`Link:   ${row.invitation_link}`);

            if (row.status === "fehlt") {
                lines.push(`Code:   – (${LABELS.fehlt})`);
            } else {
                const until = row.expires_at ? ` (${LABELS[row.status]} ${formatDate(row.expires_at)})` : "";
                lines.push(`Code:   ${row.code}${until}`);
            }

            return lines.join("\n");
        })
        .join("\n\n")
        .concat("\n");
}

export const POST: RequestHandler = async (event) => {
    // null = stammesweit, [] wirft. Danach zaehlt der Gruppenbezug je Mitglied.
    const allowed = requireGroupsWithPermission(event, "members.view");

    const form = await event.request.formData();

    const ids = Array.from(new Set(form.getAll("ids").map(String).map((id) => id.trim()).filter(Boolean)));
    if (ids.length === 0) throw error(400, "Keine Mitglieder ausgewählt");

    const requested = String(form.get("format") ?? "csv").toLowerCase();
    const format: Format = requested === "json" || requested === "txt" ? requested : "csv";

    const members = await getMembersByIds(ids);

    // Eine unbekannte Kennung wird nicht stillschweigend uebergangen: sonst
    // fehlt am Ende ein Mitglied in der Datei, ohne dass es jemand merkt.
    if (members.length !== ids.length) {
        throw error(404, "Nicht alle ausgewählten Mitglieder wurden gefunden");
    }

    /*
     * Jede Kennung gegen den erlaubten Bereich pruefen -- und abweisen, statt
     * still zu filtern. Genau derselbe Fehler steckte frueher im
     * E-Mail-Verfasser: dort ging die Nachricht ohne Hinweis an weniger
     * Empfaenger als ausgewaehlt.
     */
    if (allowed !== null) {
        const outside = members.filter(
            (member) => !member.groups.some((groupId) => allowed.includes(groupId))
        );
        if (outside.length > 0) {
            throw error(403, "Keine Berechtigung für diese Mitglieder");
        }
    }

    const baseUrl = (env.PUBLIC_APP_URL || event.url.origin).replace(/\/+$/, "");
    const rows = members.map((member) => toRow(member, baseUrl));

    const body =
        format === "csv" ? asCsv(rows) : format === "json" ? asJson(rows) : asText(rows);

    const today = new Date().toISOString().slice(0, 10);

    return new Response(body, {
        headers: downloadHeaders({
            contentType: FORMATS[format].contentType,
            filename: `einladungslinks-${today}.${FORMATS[format].extension}`,
            forceDownload: true
        })
    });
};
