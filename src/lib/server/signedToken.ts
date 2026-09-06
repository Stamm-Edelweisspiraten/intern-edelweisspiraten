import crypto from "node:crypto";
import { env } from "$env/dynamic/private";

/**
 * Kurzlebige, signierte Tokens fuer zustandslose Zwischenschritte -- derzeit
 * nur die Bestaetigung des Einladungscodes im Join-Ablauf.
 *
 * Die Anmeldesitzung nutzt dieses Verfahren NICHT mehr: sie liegt jetzt
 * server-seitig und ist dadurch widerrufbar (siehe auth/session.ts).
 */

const encoder = new TextEncoder();

function secret(): string {
    const value = env.SESSION_SECRET;
    if (!value) throw new Error("SESSION_SECRET ist nicht konfiguriert");
    return value;
}

function sign(data: string): string {
    return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export interface SignedPayload {
    /** Zweck des Tokens, damit es nicht kontextfremd verwendet werden kann. */
    purpose: string;
    memberId?: string;
    exp: number;
}

export function createSignedToken(
    payload: Omit<SignedPayload, "exp">,
    maxAgeSeconds: number
): string {
    const body = Buffer.from(
        JSON.stringify({ ...payload, exp: Date.now() + maxAgeSeconds * 1000 })
    ).toString("base64url");

    return `${body}.${sign(body)}`;
}

export function verifySignedToken(
    token: string | undefined,
    expectedPurpose: string
): SignedPayload | null {
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const expected = encoder.encode(sign(body));
    const provided = encoder.encode(signature);

    if (expected.length !== provided.length) return null;
    if (!crypto.timingSafeEqual(expected, provided)) return null;

    let payload: SignedPayload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    } catch {
        return null;
    }

    if (!payload.exp || Date.now() > payload.exp) return null;
    if (payload.purpose !== expectedPurpose) return null;

    return payload;
}

export const INVITE_PURPOSE = "join-invite";
export const INVITE_MAX_AGE_SECONDS = 30 * 60;
