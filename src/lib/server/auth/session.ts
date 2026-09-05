import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { sessions, type SessionDoc } from "$lib/server/db/collections";

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
    userId: ObjectId;
    ip?: string | null;
    userAgent?: string | null;
    /** false, solange der zweite Faktor noch aussteht. */
    mfaSatisfied: boolean;
}

export async function createSession(
    cookies: Cookies,
    input: CreateSessionInput
): Promise<{ token: string; session: SessionDoc }> {
    const token = newToken();
    const now = new Date();

    const doc: SessionDoc = {
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
        mfaSatisfied: input.mfaSatisfied,
        impersonation: null
    };

    await sessions().insertOne(doc);
    cookies.set(SESSION_COOKIE, token, cookieOptions(SLIDING_MAX_AGE_SECONDS));

    return { token, session: doc };
}

/** Liest und validiert die Sitzung zum Cookie. */
export async function readSession(token: string | undefined): Promise<SessionDoc | null> {
    if (!token) return null;

    const session = await sessions().findOne({
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    });

    return session ?? null;
}

/**
 * Verlaengert die Sitzung gleitend -- hoechstens alle 15 Minuten und nie
 * ueber absoluteExpiresAt hinaus.
 */
export async function touchSession(session: SessionDoc, cookies: Cookies): Promise<void> {
    const now = new Date();
    if (now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;

    const slidingEnd = new Date(now.getTime() + SLIDING_MAX_AGE_SECONDS * 1000);
    const expiresAt =
        slidingEnd > session.absoluteExpiresAt ? session.absoluteExpiresAt : slidingEnd;

    await sessions().updateOne(
        { tokenHash: session.tokenHash },
        { $set: { lastSeenAt: now, expiresAt } }
    );

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
export async function rotateToken(session: SessionDoc, cookies: Cookies): Promise<string> {
    const token = newToken();
    await sessions().updateOne(
        { tokenHash: session.tokenHash },
        { $set: { tokenHash: hashToken(token) } }
    );

    const remaining = Math.max(
        60,
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
    );
    cookies.set(SESSION_COOKIE, token, cookieOptions(remaining));
    return token;
}

/** Markiert den zweiten Faktor als erledigt. */
export async function markMfaSatisfied(session: SessionDoc, cookies: Cookies): Promise<void> {
    await sessions().updateOne(
        { tokenHash: session.tokenHash },
        { $set: { mfaSatisfied: true } }
    );
    session.mfaSatisfied = true;
    await rotateToken(session, cookies);
}

export async function revokeSession(token: string | undefined, cookies: Cookies): Promise<void> {
    if (token) {
        await sessions().updateOne(
            { tokenHash: hashToken(token) },
            { $set: { revokedAt: new Date() } }
        );
    }
    cookies.delete(SESSION_COOKIE, { path: "/" });
}

export async function revokeSessionById(id: string, userId: ObjectId): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await sessions().updateOne(
        { _id: new ObjectId(id), userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount > 0;
}

/** "Überall abmelden" -- optional mit Ausnahme der aktuellen Sitzung. */
export async function revokeAllForUser(
    userId: ObjectId,
    exceptTokenHash?: string
): Promise<number> {
    const filter: Record<string, unknown> = { userId, revokedAt: null };
    if (exceptTokenHash) filter.tokenHash = { $ne: exceptTokenHash };

    const result = await sessions().updateMany(filter, { $set: { revokedAt: new Date() } });
    return result.modifiedCount;
}

/** Aktive Sitzungen eines Benutzers fuer die Geraeteliste im Profil. */
export async function listSessionsForUser(userId: ObjectId) {
    return sessions()
        .find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
        .sort({ lastSeenAt: -1 })
        .toArray();
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
    session: SessionDoc,
    cookies: Cookies,
    target: ObjectId,
    original: { id: ObjectId; name: string; email: string }
): Promise<void> {
    const expiresAt = new Date(Date.now() + IMPERSONATION_MAX_AGE_SECONDS * 1000);

    await sessions().updateOne(
        { tokenHash: session.tokenHash },
        {
            $set: {
                userId: target,
                expiresAt,
                impersonation: {
                    originalUserId: original.id,
                    originalUserName: original.name,
                    originalUserEmail: original.email,
                    startedAt: new Date()
                }
            }
        }
    );

    session.userId = target;
    session.expiresAt = expiresAt;
    await rotateToken(session, cookies);
}

export async function stopImpersonation(
    session: SessionDoc,
    cookies: Cookies
): Promise<boolean> {
    if (!session.impersonation) return false;

    const expiresAt = new Date(Date.now() + SLIDING_MAX_AGE_SECONDS * 1000);
    await sessions().updateOne(
        { tokenHash: session.tokenHash },
        {
            $set: {
                userId: session.impersonation.originalUserId,
                expiresAt,
                impersonation: null
            }
        }
    );

    session.userId = session.impersonation.originalUserId;
    session.expiresAt = expiresAt;
    session.impersonation = null;
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
