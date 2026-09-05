import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { calendarTokens } from "$lib/server/db/schema";
import type { EventEntry } from "$lib/server/eventService";

/**
 * Kalenderabonnement (iCal).
 *
 * Ein Kalenderprogramm kann sich nicht anmelden -- es ruft in festen
 * Abständen eine Adresse ab. Das Token in dieser Adresse ersetzt deshalb die
 * Anmeldung.
 *
 * Gespeichert wird nur der sha256-Abdruck, wie bei den Sitzungen: ein
 * Lesezugriff auf die Datenbank ergibt damit kein benutzbares Abonnement. Das
 * Token selbst ist genau einmal sichtbar, nämlich beim Erzeugen.
 */

function hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createCalendarToken(
    userId: string,
    label = "Kalender"
): Promise<{ token: string; id: string } | null> {
    if (!isUuid(userId)) return null;

    // 32 Byte, base64url -- lang genug, dass Raten aussichtslos ist.
    const token = crypto.randomBytes(32).toString("base64url");

    const [row] = await db
        .insert(calendarTokens)
        .values({ userId, tokenHash: hash(token), label })
        .returning({ id: calendarTokens.id });

    return { token, id: row.id };
}

/** Löst ein Token auf und vermerkt die Nutzung. */
export async function resolveCalendarToken(token: string): Promise<string | null> {
    if (!token) return null;

    const [row] = await db
        .select({ id: calendarTokens.id, userId: calendarTokens.userId })
        .from(calendarTokens)
        .where(eq(calendarTokens.tokenHash, hash(token)))
        .limit(1);

    if (!row) return null;

    /**
     * Der Zeitstempel wird nicht abgewartet: der Kalenderabruf soll nicht
     * daran hängen, und ein verlorener Vermerk ist folgenlos.
     */
    void db
        .update(calendarTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(calendarTokens.id, row.id))
        .catch((err) => console.warn("Kalender-Zeitstempel nicht gespeichert:", err));

    return row.userId;
}

export async function listCalendarTokens(userId: string) {
    if (!isUuid(userId)) return [];
    return db
        .select({
            id: calendarTokens.id,
            label: calendarTokens.label,
            lastUsedAt: calendarTokens.lastUsedAt,
            createdAt: calendarTokens.createdAt
        })
        .from(calendarTokens)
        .where(eq(calendarTokens.userId, userId))
        .orderBy(desc(calendarTokens.createdAt));
}

/** Widerruft ein Abonnement; das Kalenderprogramm bekommt danach 401. */
export async function revokeCalendarToken(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id) || !isUuid(userId)) return false;
    const rows = await db
        .delete(calendarTokens)
        .where(and(eq(calendarTokens.id, id), eq(calendarTokens.userId, userId)))
        .returning({ id: calendarTokens.id });
    return rows.length > 0;
}

// ---------------------------------------------------------------------------
// iCalendar
// ---------------------------------------------------------------------------

/**
 * Zeilen dürfen laut RFC 5545 höchstens 75 Oktette lang sein; längere werden
 * umbrochen, wobei die Folgezeile mit einem Leerzeichen beginnt.
 *
 * Gezählt werden Oktette, nicht Zeichen: ein Umlaut belegt in UTF-8 zwei. Ein
 * Umbruch mitten in einem Zeichen würde die Datei unlesbar machen, deshalb
 * wird byteweise gemessen und nur an Zeichengrenzen getrennt.
 */
function fold(line: string): string {
    const parts: string[] = [];
    let current = "";
    let bytes = 0;
    let limit = 75;

    for (const char of line) {
        const size = Buffer.byteLength(char, "utf8");
        if (bytes + size > limit) {
            parts.push(current);
            current = "";
            bytes = 0;
            // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt.
            limit = 74;
        }
        current += char;
        bytes += size;
    }

    parts.push(current);
    return parts.join("\r\n ");
}

/** Maskiert die Sonderzeichen eines TEXT-Werts. */
function escapeText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

function stampUtc(date: Date): string {
    return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export interface CalendarOptions {
    /** Erscheint als Kalendername im Programm. */
    name: string;
    /** Basis-Adresse für die Verweise auf die Terminseite. */
    baseUrl: string;
    /** Stabile Kennung der Installation, für die UIDs. */
    domain: string;
}

/**
 * Erzeugt den iCalendar-Text.
 *
 * Enthält nur die übergebenen Termine -- die Auswahl trifft der Aufrufer über
 * `listEvents` mit dem Benutzer des Tokens. Ein fremdes Token liefert deshalb
 * andere Termine.
 */
export function buildCalendar(events: EventEntry[], options: CalendarOptions): string {
    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Internes Portal//Termine//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeText(options.name)}`,
        // Ohne diese Angabe fragen manche Programme im Minutentakt nach.
        "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
        "X-PUBLISHED-TTL:PT2H"
    ];

    for (const event of events) {
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${event.id}@${options.domain}`);
        lines.push(`DTSTAMP:${stampUtc(event.createdAt)}`);

        if (event.allDay) {
            /**
             * Bei ganztägigen Terminen ist DTEND ausschließend: ein eintägiger
             * Termin endet am Folgetag. Ohne diesen Zuschlag zeigen die
             * Programme ihn gar nicht oder als Termin ohne Dauer an.
             */
            const end = event.endsAt ?? event.startsAt;
            const exclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.startsAt)}`);
            lines.push(`DTEND;VALUE=DATE:${dateOnly(exclusive)}`);
        } else {
            lines.push(`DTSTART:${stampUtc(event.startsAt)}`);
            if (event.endsAt) lines.push(`DTEND:${stampUtc(event.endsAt)}`);
        }

        lines.push(`SUMMARY:${escapeText(event.title)}`);
        if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
        if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);

        lines.push(`URL:${options.baseUrl}/intern/termine/${event.id}`);

        // Eine Absage bleibt im Kalender stehen, aber durchgestrichen.
        lines.push(`STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);

        lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    // RFC 5545 verlangt CRLF und einen abschließenden Zeilenumbruch.
    return `${lines.map(fold).join("\r\n")}\r\n`;
}
