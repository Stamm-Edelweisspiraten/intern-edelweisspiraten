/**
 * E-Mail-Vorlagen fuer das Zuruecksetzen des Passworts und fuer Einladungen.
 * Bewusst als Tabellenlayout mit Inline-Styles, damit die Darstellung auch in
 * aelteren Mail-Programmen stimmt.
 *
 * Der Name der Organisation wird uebergeben statt fest eingetragen -- sonst
 * traegt jede Mail den Namen eines fremden Stamms.
 */

const FALLBACK_ORGANIZATION = "Internes Portal";

function layout(title: string, body: string, organization: string): string {
    return `<!DOCTYPE html>
<html lang="de" style="margin:0;padding:0;">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f7;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0"
                       style="background:#ffffff;border-radius:16px;padding:40px;
                              box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;">
                    <tr>
                        <td style="color:#111827;font-size:22px;font-weight:bold;padding-bottom:16px;">
                            ${title}
                        </td>
                    </tr>
                    ${body}
                    <tr>
                        <td style="padding-top:32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
                            ${escapeHtml(organization)} &middot; Interner Bereich<br />
                            Diese Nachricht wurde automatisch erzeugt.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function button(url: string, label: string): string {
    return `<tr>
        <td style="padding:24px 0;">
            <a href="${url}"
               style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;
                      padding:14px 24px;border-radius:12px;font-weight:bold;font-size:15px;">
                ${label}
            </a>
        </td>
    </tr>
    <tr>
        <td style="color:#6b7280;font-size:12px;line-height:1.6;word-break:break-all;">
            Falls die Schaltfläche nicht funktioniert, kopiere diesen Link in die Adresszeile:<br />
            <span style="color:#2563eb;">${url}</span>
        </td>
    </tr>`;
}

export function passwordResetTemplate(
    name: string,
    url: string,
    validHours: number,
    organization = FALLBACK_ORGANIZATION
): string {
    return layout(
        "Passwort zurücksetzen",
        `<tr>
            <td style="color:#374151;font-size:15px;line-height:1.7;">
                Hallo ${escapeHtml(name)},<br /><br />
                für deinen Zugang zum internen Bereich wurde das Zurücksetzen des Passworts
                angefordert. Über die folgende Schaltfläche kannst du ein neues Passwort
                vergeben. Der Link ist ${validHours} Stunden gültig.
            </td>
        </tr>
        ${button(url, "Neues Passwort festlegen")}
        <tr>
            <td style="color:#374151;font-size:14px;line-height:1.7;padding-top:16px;">
                Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.
                Dein bisheriges Passwort bleibt dann unverändert gültig.
            </td>
        </tr>`,
        organization
    );
}

export function inviteTemplate(
    name: string,
    url: string,
    validDays: number,
    organization = FALLBACK_ORGANIZATION
): string {
    return layout(
        "Zugang aktivieren",
        `<tr>
            <td style="color:#374151;font-size:15px;line-height:1.7;">
                Hallo ${escapeHtml(name)},<br /><br />
                für dich wurde ein Zugang zum internen Bereich von
                ${escapeHtml(organization)} eingerichtet. Lege über die folgende
                Schaltfläche dein Passwort fest.
                Der Link ist ${validDays} Tage gültig.
            </td>
        </tr>
        ${button(url, "Zugang aktivieren")}`,
        organization
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
