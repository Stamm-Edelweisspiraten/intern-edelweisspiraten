export function welcomeTemplate(name: string, password: string) {
    return `
<!DOCTYPE html>
<html lang="de" style="margin:0;padding:0;">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Willkommen</title>
</head>

<body style="margin:0;padding:0;background:#f5f6f7;font-family:Arial, sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f7;padding:40px 0;">
        <tr>
            <td align="center">

                <table width="600" cellpadding="0" cellspacing="0"
                       style="background:#ffffff;border-radius:16px;overflow:hidden;
                              box-shadow:0 4px 20px rgba(0,0,0,0.08);padding:40px;">
                    
                    <tr>
                        <td align="center" style="padding-bottom:20px;">
                            <img
                                src="https://edelweisspiraten-bremen.de/_app/immutable/assets/logo.968ba2ac.svg"
                                alt="Edelweißpiraten Logo"
                                width="80"
                                style="display:block;margin:0 auto;"
                            />
                        </td>
                    </tr>

                    <tr>
                        <td style="font-size:28px;font-weight:700;color:#111827;text-align:center;padding-bottom:20px;">
                            Willkommen, ${name}!
                        </td>
                    </tr>

                    <tr>
                        <td style="font-size:16px;line-height:1.6;color:#4b5563;padding-bottom:24px;text-align:center;">
                            Dein Benutzerkonto wurde erfolgreich erstellt.<br />
                            Hier sind deine Zugangsdaten:
                        </td>
                    </tr>

                    <!-- Password Box -->
                    <tr>
                        <td align="center" style="padding-bottom:20px;">
                            <div style="
                                display:inline-block;
                                background:#f3f4f6;
                                border-radius:8px;
                                padding:16px 24px;
                                font-size:18px;
                                font-weight:600;
                                color:#111827;
                                border:1px solid #e5e7eb;
                                font-family:monospace;
                            ">
                                Passwort: ${password}
                            </div>
                        </td>
                    </tr>

                    <!-- CTA -->
                    <tr>
                        <td align="center" style="padding-bottom:32px;">
                            <a href="https://edelweisspiraten-bremen.de/login"
                               style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;
                                      font-size:16px;font-weight:600;border-radius:8px;text-decoration:none;">
                                Jetzt einloggen
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td style="font-size:14px;line-height:1.6;color:#6b7280;text-align:center;padding-top:20px;">
                            Bitte ändere dein Passwort nach dem ersten Login.<br />
                            Diese E-Mail wurde automatisch generiert.
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
`;
}
