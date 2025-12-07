# Edelweisspiraten – Internes Portal

Modernes SvelteKit-Portal für Mitgliederverwaltung, Gruppen, Ämter und interne Kommunikation des Stamms Edelweisspiraten Bremen.

## Features
- **Authentifizierung & Sessions**: Login/Logout, Session-Handling mit Berechtigungen.
- **Mitgliederverwaltung**: Anlegen, Bearbeiten, Suchen; PDF-Einladungen; Mehrfach-E-Mail/Telefon.
- **Gruppen**: Übersicht, Details, Mail an Gruppen, PDF-Export der Mitglieder (Querformat, Tabelle).
- **Ämter**: Verwaltung mit Typen (Amt/Gruppenleiter), optionaler Gruppenbindung und E-Mail, Mehrfach-Mitglieder-Zuordnung.
- **Admin-Bereich**: Benutzer, Berechtigungen, Gruppen, Ämter.
- **Mailing**: E-Mail-Composer mit Quill, Anhänge, Reply-To-Auswahl (eigene Mail oder Amts-Mail), Mitglieder-/Gruppen-Selektor.
- **Responsives UI**: Offcanvas/Fullscreen-Menü mobil, Karten-Ansichten für Mitglieder, konsistente helle Farbwelt.

## Schnellstart
```bash
npm install
npm run dev
```
Standard: http://localhost:5173 (oder Port aus Logs).

## Umgebung
Erforderliche Variablen (siehe `.env`):
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
- SESSION_SECRET
- MongoDB-URL/DB (in `$lib/server/mongo`)
- OAuth/OpenID Einstellungen (Login)

## Wichtige Routen
- `/login`, `/logout`
- `/intern` (geschützt)
  - `/intern/dashboard`, `/intern/members`, `/intern/groups`, `/intern/email`
  - `/intern/groups/[id]/members.pdf` (Gruppen-PDF)
  - `/intern/members/[id]/invite.pdf` (Einladung)
  - `/intern/admin/*` (Benutzer, Berechtigungen, Gruppen, Ämter)

## Technologie
- SvelteKit, TypeScript, Tailwind-Basis
- MongoDB als Datenspeicher
- Nodemailer für Mailversand
- pdfkit für PDF-Erzeugung

## Entwicklung
- `npm run dev` – Startet Dev-Server
- `npm run build` – Produktionsbuild
- `npm run preview` – Preview des Builds

## Tests
Aktuell keine automatisierten Tests integriert. Bitte manuell Kernfunktionen prüfen:
- Login/Logout
- Mitglieder anlegen/bearbeiten, Einladungs-PDF
- Gruppen-Mail und PDF-Export
- Ämter anlegen/bearbeiten (Typ/Gruppe prüfen)
- Reply-To-Auswahl und Versand im Mail-Composer
