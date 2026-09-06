import crypto from "node:crypto";
import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { sessions } from "$lib/server/db/schema";

/**
 * Server-seitige Sitzungen.
 *
 * Vorher enthielt das Cookie die vollstaendige Identitaet (E-Mail, Name,
 * Gruppen), war HMAC-signiert und sieben Tage gueltig -- und damit bis zum
 * Ablauf nicht widerrufbar. Rechteentzug, "ueberall abmelden" und eine
 * Geraeteliste waren so nicht moeglich.
 *
 * Jetzt steht im Cookie nur noch ein zufaelliges Token; gespeichert wird
 * dessen sha256-Hash. Ein reiner Lesezugriff auf die Datenbank erlaubt damit
 * keine Sitzungsuebernahme.
 */

export type Session = typeof sessions.$inferSelect;

export const SESSION_COOKIE = "ep_session";

/** Gleitende Gueltigkeit. */
const SLIDING_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
/** Harte Obergrenze, die die gleitende Verlaengerung nicht ueberschreitet. */
const ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** Impersonation laeuft bewusst deutlich frueher ab. */
const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60;
/** lastSeenAt wird nur in diesem Abstand geschrieben, nicht bei jedem Request. */
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

/**
 * Cookie-Optionen. `secure` haengt am Entwicklungsmodus -- bisher war es
 * unbedingt true, wodurch eine Anmeldung ueber http://localhost gar nicht
 * funktionieren konnte.
 */
function cookieOptions(maxAge: number) {
    return {
        path: "/",
        httpOnly: true,
        sameSite: "lax" as const,
        secure: !dev,
        maxAge
    };
}

export interface CreateSessionInput {
    userId: string;
    ip?: string | null;
    userAgent?: string | null;
    /** false, solange der zweite Faktor noch aussteht. */
    mfaSatisfied: boolean;
}

export async function createSession(
    cookies: Cookies,
    input: CreateSessionInput
): Promise<{ token: string; session: Session }> {
    const token = newToken();
    const now = new Date();

    const [session] = await db
        .insert(sessions)
        .values({
            tokenHash: hashToken(token),
            userId: input.userId,
            createdAt: now,
            lastSeenAt: now,
            expiresAt: new Date(now.getTime() + SLIDING_MAX_AGE_SECONDS * 1000),
            absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MAX_AGE_SECONDS * 1000),
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            device: describeDevice(input.userAgent),
            revokedAt: null,
            mfaSatisfied: input.mfaSatisfied
        })
        .returning();

    cookies.set(SESSION_COOKIE, token, cookieOptions(SLIDING_MAX_AGE_SECONDS));
    return { token, session };
}

/** Liest und validiert die Sitzung zum Cookie. */
export async function readSession(token: string | undefined): Promise<Session | null> {
    if (!token) return null;

    const [session] = await db
        .select()
        .from(sessions)
        .where(
            and(
                eq(sessions.tokenHash, hashToken(token)),
                isNull(sessions.revokedAt),
                gt(sessions.expiresAt, new Date())
            )
        )
        .limit(1);

    return session ?? null;
}

/**
 * Verlaengert die Sitzung gleitend -- hoechstens alle 15 Minuten und nie
 * ueber absoluteExpiresAt hinaus.
 */
export async function touchSession(session: Session, cookies: Cookies): Promise<void> {
    const now = new Date();
    if (now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;

    const slidingEnd = new Date(now.getTime() + SLIDING_MAX_AGE_SECONDS * 1000);
    const expiresAt =
        slidingEnd > session.absoluteExpiresAt ? session.absoluteExpiresAt : slidingEnd;

    await db
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt })
        .where(eq(sessions.id, session.id));

    const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
    if (remaining > 0) {
        const token = cookies.get(SESSION_COOKIE);
        if (token) cookies.set(SESSION_COOKIE, token, cookieOptions(remaining));
    }
}

/**
 * Tauscht das Token einer bestehenden Sitzung aus. Wird nach jeder
 * Rechteaenderung aufgerufen: Passwortwechsel, 2FA-Bestaetigung, Start und
 * Ende einer Impersonation.
 */
export async function rotateToken(session: Session, cookies: Cookies): Promise<string> {
    const token = newToken();
    const tokenHash = hashToken(token);

    await db.update(sessions).set({ tokenHash }).where(eq(sessions.id, session.id));
    session.tokenHash = tokenHash;

    const remaining = Math.max(60, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
    cookies.set(SESSION_COOKIE, token, cookieOptions(remaining));
    return token;
}

/** Markiert den zweiten Faktor als erledigt. */
export async function markMfaSatisfied(session: Session, cookies: Cookies): Promise<void> {
    await db.update(sessions).set({ mfaSatisfied: true }).where(eq(sessions.id, session.id));
    session.mfaSatisfied = true;
    await rotateToken(session, cookies);
}

export async function revokeSession(token: string | undefined, cookies: Cookies): Promise<void> {
    if (token) {
        await db
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.tokenHash, hashToken(token)));
    }
    cookies.delete(SESSION_COOKIE, { path: "/" });
}

export async function revokeSessionById(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id) || !isUuid(userId)) return false;
    const rows = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
    return rows.length > 0;
}

/** "Überall abmelden" -- optional mit Ausnahme der aktuellen Sitzung. */
export async function revokeAllForUser(
    userId: string,
    exceptTokenHash?: string
): Promise<number> {
    if (!isUuid(userId)) return 0;

    const condition = exceptTokenHash
        ? and(
              eq(sessions.userId, userId),
              isNull(sessions.revokedAt),
              ne(sessions.tokenHash, exceptTokenHash)
          )
        : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));

    const rows = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(condition)
        .returning({ id: sessions.id });
    return rows.length;
}

/** Aktive Sitzungen eines Benutzers fuer die Geraeteliste im Profil. */
export async function listSessionsForUser(userId: string): Promise<Session[]> {
    if (!isUuid(userId)) return [];
    return db
        .select()
        .from(sessions)
        .where(
            and(
                eq(sessions.userId, userId),
                isNull(sessions.revokedAt),
                gt(sessions.expiresAt, new Date())
            )
        )
        .orderBy(desc(sessions.lastSeenAt));
}

/**
 * Raeumt abgelaufene und laengst widerrufene Sitzungen weg.
 *
 * In MongoDB erledigte das ein TTL-Index auf expiresAt. PostgreSQL kennt so
 * etwas nicht, deshalb laeuft das beim Start und danach stuendlich.
 */
export async function cleanupSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
        .delete(sessions)
        .where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, cutoff)))
        .returning({ id: sessions.id });
    return rows.length;
}

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

/**
 * Wechselt die bestehende Sitzung auf einen anderen Benutzer.
 *
 * Vorher wurde dafuer ein voellig neues Sieben-Tage-Cookie ausgestellt, in
 * das die Gruppen-IDs des Zielbenutzers geschrieben wurden -- die
 * Berechtigungsaufloesung erwartete aber Gruppennamen, sodass ein
 * impersonierter Benutzer faktisch gar keine Rechte hatte. Da die Rechte
 * jetzt ueber die Rollen des effektiven Benutzers aufgeloest werden,
 * entfaellt dieses Problem.
 */
export async function startImpersonation(
    session: Session,
    cookies: Cookies,
    targetUserId: string,
    original: { id: string; name: string; email: string }
): Promise<void> {
    const expiresAt = new Date(Date.now() + IMPERSONATION_MAX_AGE_SECONDS * 1000);

    await db
        .update(sessions)
        .set({
            userId: targetUserId,
            expiresAt,
            impersonationUserId: original.id,
            impersonationUserName: original.name,
            impersonationUserEmail: original.email,
            impersonationStartedAt: new Date()
        })
        .where(eq(sessions.id, session.id));

    session.userId = targetUserId;
    session.expiresAt = expiresAt;
    await rotateToken(session, cookies);
}

export async function stopImpersonation(session: Session, cookies: Cookies): Promise<boolean> {
    if (!session.impersonationUserId) return false;

    const expiresAt = new Date(Date.now() + SLIDING_MAX_AGE_SECONDS * 1000);
    const originalUserId = session.impersonationUserId;

    await db
        .update(sessions)
        .set({
            userId: originalUserId,
            expiresAt,
            impersonationUserId: null,
            impersonationUserName: null,
            impersonationUserEmail: null,
            impersonationStartedAt: null
        })
        .where(eq(sessions.id, session.id));

    session.userId = originalUserId;
    session.expiresAt = expiresAt;
    session.impersonationUserId = null;
    session.impersonationUserName = null;
    session.impersonationUserEmail = null;
    session.impersonationStartedAt = null;
    await rotateToken(session, cookies);
    return true;
}

// ---------------------------------------------------------------------------
// Hilfsmittel
// ---------------------------------------------------------------------------

/** Grobe, gut lesbare Geraetebezeichnung fuer die Sitzungsliste. */
export function describeDevice(userAgent?: string | null): string | null {
    if (!userAgent) return null;

    const browser =
        /Edg\//.test(userAgent) ? "Edge"
        : /OPR\//.test(userAgent) ? "Opera"
        : /Firefox\//.test(userAgent) ? "Firefox"
        : /Chrome\//.test(userAgent) ? "Chrome"
        : /Safari\//.test(userAgent) ? "Safari"
        : "Browser";

    const os =
        /Windows/.test(userAgent) ? "Windows"
        : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
        : /Android/.test(userAgent) ? "Android"
        : /Mac OS X/.test(userAgent) ? "macOS"
        : /Linux/.test(userAgent) ? "Linux"
        : "unbekanntes System";

    return `${browser} auf ${os}`;
}

export { hashToken };
