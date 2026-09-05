import { eq, lt, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { loginAttempts } from "$lib/server/db/schema";

/**
 * Zaehler gegen automatisiertes Durchprobieren.
 *
 * Bisher gab es keinerlei Begrenzung: weder beim Login noch bei der Eingabe
 * des sechsstelligen Einladungscodes, der damit in kurzer Zeit vollstaendig
 * durchprobierbar war.
 *
 * Aufgeraeumt wird ueber cleanupRateLimits(); in MongoDB uebernahm das ein
 * TTL-Index auf expiresAt.
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
    mfa: (sessionId: string) => `mfa:${sessionId}`,
    apiToken: (tokenId: string) => `api:${tokenId}`
};

async function readEntry(key: string) {
    const [entry] = await db
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.key, key))
        .limit(1);
    return entry ?? null;
}

/**
 * Prueft, ohne zu zaehlen. Fuer Vorabpruefungen, bevor ueberhaupt Arbeit
 * verrichtet wird.
 */
export async function checkRateLimit(
    key: string,
    options: RateLimitOptions
): Promise<RateLimitResult> {
    const entry = await readEntry(key);
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

    /*
     * Datumswerte werden als ISO-Zeichenkette mit ausdruecklicher
     * Typumwandlung eingesetzt. Ein rohes Date-Objekt in einem sql-Template
     * laeuft an der Typzuordnung von Drizzle vorbei und erreicht den Treiber
     * unserialisiert -- der lehnt es ab.
     */
    const nowIso = sql`${now.toISOString()}::timestamptz`;
    const expiresIso = sql`${expiresAt.toISOString()}::timestamptz`;

    /**
     * Ein einziger Schreibvorgang statt Lesen-dann-Schreiben: bei
     * abgelaufenem Fenster beginnt der Zaehler wieder bei 1, sonst zaehlt er
     * hoch. Die alte Fassung las erst und schrieb dann -- zwei gleichzeitige
     * Fehlversuche konnten sich so gegenseitig ueberschreiben.
     */
    const [entry] = await db
        .insert(loginAttempts)
        .values({ key, count: 1, firstAt: now, lastAt: now, expiresAt })
        .onConflictDoUpdate({
            target: loginAttempts.key,
            set: {
                count: sql`case when ${loginAttempts.expiresAt} <= ${nowIso} then 1 else ${loginAttempts.count} + 1 end`,
                firstAt: sql`case when ${loginAttempts.expiresAt} <= ${nowIso} then ${nowIso} else ${loginAttempts.firstAt} end`,
                lastAt: now,
                expiresAt: sql`case when ${loginAttempts.expiresAt} <= ${nowIso} then ${expiresIso} else ${loginAttempts.expiresAt} end`
            }
        })
        .returning();

    const remaining = Math.max(0, options.limit - entry.count);
    return {
        allowed: remaining > 0,
        remaining,
        retryAfterSeconds:
            remaining > 0 ? 0 : Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 1000)
    };
}

/** Loescht den Zaehler, z.B. nach erfolgreicher Anmeldung. */
export async function clearRateLimit(key: string): Promise<void> {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

/** Entfernt abgelaufene Zaehler. Ersetzt den frueheren TTL-Index. */
export async function cleanupRateLimits(): Promise<number> {
    const rows = await db
        .delete(loginAttempts)
        .where(lt(loginAttempts.expiresAt, new Date()))
        .returning({ key: loginAttempts.key });
    return rows.length;
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
    mfa: { limit: 5, windowSeconds: 10 * 60 },
    /** Anfragen je API-Token. */
    api: { limit: 600, windowSeconds: 60 }
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
