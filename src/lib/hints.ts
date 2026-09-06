import type { Tone } from "$lib/components/ui/types";

/**
 * Rueckmeldungen, die eine Weiterleitung ueberleben.
 *
 * Eine Form-Action, die mit `redirect(303, ...)` endet, verliert `form` --
 * SvelteKit setzt es auf `null`. Der Erfolg einer Aktion war deshalb an
 * mehreren Stellen unsichtbar: die Zugangsverwaltung leitete nach dem Anlegen
 * mit `?hinweis=eingeladen` weiter, aber keine Seite hat den Parameter je
 * gelesen. Fuer den Aufrufer sah ein erfolgreich angelegter Zugang damit
 * genauso aus wie ein fehlgeschlagener.
 *
 * Darum hier eine gemeinsame Zuordnung; Seiten rendern daraus einen `Alert`.
 * Die Schluessel sind ASCII (sie stehen in der Adresse), die Texte sind
 * Deutsch mit Umlauten.
 */

export interface Hint {
    tone: Tone;
    message: string;
}

const HINTS: Record<string, Hint> = {
    abgemeldet: { tone: "success", message: "Du wurdest abgemeldet." },
    angelegt: { tone: "success", message: "Der Eintrag wurde angelegt." },
    eingeladen: {
        tone: "success",
        message: "Der Zugang wurde angelegt und die Einladung versendet."
    },
    "mail-fehlgeschlagen": {
        tone: "warning",
        message:
            "Der Zugang wurde angelegt, die Einladung konnte aber nicht versendet werden. " +
            "Prüfe die E-Mail-Einstellungen und sende die Einladung erneut."
    },
    "smtp-fehlt": {
        tone: "warning",
        message:
            "Es ist kein E-Mail-Versand eingerichtet. Der Zugang wurde angelegt; " +
            "die Einladung muss nach der Einrichtung erneut gesendet werden."
    },
    geloescht: { tone: "success", message: "Der Eintrag wurde gelöscht." },
    ersteinrichtung: {
        tone: "info",
        message: "Die Einrichtung ist abgeschlossen. Richte jetzt die Zwei-Faktor-Anmeldung ein."
    },
    "passwort-geaendert": { tone: "success", message: "Das Passwort wurde geändert." },
    "zu-viele-versuche": {
        tone: "danger",
        message: "Zu viele Versuche. Bitte später erneut probieren."
    },
    nachbestellung: { tone: "info", message: "Die Nachbestellung wurde vorgemerkt." }
};

/** Liefert die Rueckmeldung zu `?hinweis=...`, oder null. */
export function readHint(value: string | null | undefined): Hint | null {
    if (!value) return null;
    return HINTS[value] ?? null;
}
