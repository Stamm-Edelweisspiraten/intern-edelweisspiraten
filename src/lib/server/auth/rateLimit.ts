import { loginAttempts } from "$lib/server/db/collections";

/**
 * Zaehler gegen automatisiertes Durchprobieren.
 *
 * Bisher gab es keinerlei Begrenzung: weder beim Login noch bei der Eingabe
 * des sechsstelligen Einladungscodes, der damit in kurzer Zeit vollstaendig
 * durchprobierbar war.
 *
 * Aufgeraeumt wird ausschliesslich ueber den TTL-Index auf expiresAt.
 */

export interface RateLimitResult {
    allowed: boolean;
    /** Verbleibende Versuche im aktuellen Fenster. */
    remaining: number;
    /** Sekunden bis zur naechsten erlaubten Anfrage. */
    retryAfterSeconds: number;
}

export interface RateLimitOptions {
    /** Erlaubte Fehlversuche innerhalb des Fensters. */
    limit: number;
    /** Laenge des Zeitfensters in Sekunden. */
    windowSeconds: number;
}

/** Schluessel-Erzeuger, damit die Namensgebung einheitlich bleibt. */
export const rateLimitKey = {
    ip: (ip: string) => `ip:${ip}`,
    user: (userId: string) => `user:${userId}`,
    reset: (emailHash: string) => `reset:${emailHash}`,
    invite: (memberId: string, ip: string) => `invite:${memberId}:${ip}`,
    mfa: (sessionId: string) => `mfa:${sessionId}`
};

/**
 * Prueft, ohne zu zaehlen. Fuer Vorabpruefungen, bevor ueberhaupt Arbeit
 * verrichtet wird.
 */
export async function checkRateLimit(
    key: string,
    options: RateLimitOptions
): Promise<RateLimitResult> {
    const entry = await loginAttempts().findOne({ key });
    const now = new Date();

    if (!entry || entry.expiresAt <= now) {
        return { allowed: true, remaining: options.limit, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(0, options.limit - entry.count);
    return {
        allowed: remaining > 0,
        remaining,
        retryAfterSeconds:
            remaining > 0 ? 0 : Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 1000)
    };
}

/** Zaehlt einen Fehlversuch und meldet, ob weitere erlaubt sind. */
export async function registerFailure(
    key: string,
    options: RateLimitOptions
): Promise<RateLimitResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + options.windowSeconds * 1000);

    const existing = await loginAttempts().findOne({ key });

    // Abgelaufenes Fenster wird zurueckgesetzt statt weitergezaehlt.
    if (!existing || existing.expiresAt <= now) {
        await loginAttempts().updateOne(
            { key },
            { $set: { key, count: 1, firstAt: now, lastAt: now, expiresAt } },
            { upsert: true }
        );
        return {
            allowed: options.limit > 1,
            remaining: Math.max(0, options.limit - 1),
            retryAfterSeconds: 0
        };
    }

    const updated = await loginAttempts().findOneAndUpdate(
        { key },
        { $inc: { count: 1 }, $set: { lastAt: now } },
        { returnDocument: "after" }
    );

    const count = updated?.count ?? existing.count + 1;
    const remaining = Math.max(0, options.limit - count);

    return {
        allowed: remaining > 0,
        remaining,
        retryAfterSeconds:
            remaining > 0 ? 0 : Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000)
    };
}

/** Loescht den Zaehler, z.B. nach erfolgreicher Anmeldung. */
export async function clearRateLimit(key: string): Promise<void> {
    await loginAttempts().deleteOne({ key });
}

/** Voreinstellungen fuer die verschiedenen Angriffsflaechen. */
export const RATE_LIMITS = {
    /** Anmeldungen pro IP-Adresse. */
    loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
    /** Anmeldungen pro Konto, bevor die Kontosperre greift. */
    loginPerUser: { limit: 5, windowSeconds: 15 * 60 },
    /** Anforderungen zum Zuruecksetzen des Passworts. */
    passwordResetPerEmail: { limit: 3, windowSeconds: 60 * 60 },
    passwordResetPerIp: { limit: 10, windowSeconds: 60 * 60 },
    /** Eingabe des Einladungscodes. */
    invite: { limit: 5, windowSeconds: 10 * 60 },
    /** Eingabe des zweiten Faktors. */
    mfa: { limit: 5, windowSeconds: 10 * 60 }
} as const;

/**
 * Sperrdauer eines Kontos nach wiederholten Fehlversuchen: verdoppelt sich
 * ab dem Grenzwert und ist bei einer Stunde gedeckelt.
 */
export function lockoutDuration(failedAttempts: number, threshold = 5): number {
    if (failedAttempts < threshold) return 0;
    const minutes = Math.min(2 ** (failedAttempts - threshold), 60);
    return minutes * 60 * 1000;
}
