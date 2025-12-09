import crypto from "node:crypto";
import { env } from "$env/dynamic/private";

const SESSION_SECRET = env.SESSION_SECRET;
if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured");
}

const encoder = new TextEncoder();

function sign(data: string) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

function encodePayload(payload: Record<string, any>) {
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(token: string) {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
}

export interface SessionPayload {
    email: string;
    name?: string;
    groups?: string[];
    sub?: string;
    exp: number;
    type?: "session" | "invite";
    memberId?: string;
}

export function createSignedSession(payload: Omit<SessionPayload, "exp">, maxAgeSeconds: number) {
    const exp = Date.now() + maxAgeSeconds * 1000;
    const body = encodePayload({ ...payload, exp });
    const signature = sign(body);
    return `${body}.${signature}`;
}

export function verifySignedSession(token: string | undefined): SessionPayload | null {
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const expected = sign(body);

    const expectedBytes = encoder.encode(expected);
    const signatureBytes = encoder.encode(signature);

    if (expectedBytes.length !== signatureBytes.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(expectedBytes, signatureBytes)) {
        return null;
    }

    const payload: SessionPayload = decodePayload(body);

    if (!payload.exp || Date.now() > payload.exp) {
        return null;
    }

    return payload;
}
