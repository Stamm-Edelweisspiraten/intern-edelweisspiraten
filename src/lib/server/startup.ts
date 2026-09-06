import { dev } from "$app/environment";
import { cleanupSessions } from "$lib/server/auth/session";
import { cleanupRateLimits } from "$lib/server/auth/rateLimit";
import { cleanupResetTokens } from "$lib/server/auth/passwordReset";
import { runDueSchedules } from "$lib/server/finance/recurringService";

/**
 * Aufraeumen und wiederkehrende Buchungen.
 *
 * MongoDB erledigte das Aufraeumen ueber TTL-Indizes auf expiresAt.
 * PostgreSQL kennt so etwas nicht, deshalb laeuft es beim Start und danach
 * stuendlich. Die Arbeit ist gering: es sind Loeschungen auf indizierten
 * Spalten.
 *
 * Fehler beenden den Start ausdruecklich NICHT -- eine nicht erreichbare
 * Datenbank soll dazu fuehren, dass die Anwendung startet und Fehlermeldungen
 * zeigt, statt gar nicht hochzukommen.
 */

const INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export async function runMaintenance(): Promise<void> {
    try {
        const [sessions, limits, tokens] = await Promise.all([
            cleanupSessions(),
            cleanupRateLimits(),
            cleanupResetTokens()
        ]);

        if (sessions + limits + tokens > 0) {
            console.info(
                `Aufgeraeumt: ${sessions} Sitzungen, ${limits} Zaehler, ${tokens} Tokens.`
            );
        }
    } catch (err) {
        console.error("Aufraeumen fehlgeschlagen:", err);
    }

    try {
        const result = await runDueSchedules();
        if (result.executed > 0) {
            console.info(`${result.executed} wiederkehrende Buchung(en) ausgefuehrt.`);
        }
        for (const error of result.errors) {
            console.warn("Wiederkehrende Buchung:", error);
        }
    } catch (err) {
        console.error("Wiederkehrende Buchungen fehlgeschlagen:", err);
    }
}

export function startMaintenance(): void {
    // Im Entwicklungsmodus wird das Modul bei jedem HMR-Durchlauf neu
    // ausgewertet; ohne diese Sperre liefen mehrere Zeitgeber nebeneinander.
    const cache = globalThis as { _maintenanceStarted?: boolean };
    if (cache._maintenanceStarted) return;
    cache._maintenanceStarted = true;

    void runMaintenance();

    timer = setInterval(() => void runMaintenance(), INTERVAL_MS);
    // Der Zeitgeber darf den Prozess nicht am Beenden hindern.
    timer.unref?.();

    if (dev) console.info("Wartungslauf gestartet (stuendlich).");
}
