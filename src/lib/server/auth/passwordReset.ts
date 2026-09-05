import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import { passwordResetTokens, users, type UserDoc } from "$lib/server/db/collections";

/**
 * Zuruecksetzen des Passworts und Einladungen zur Erstvergabe.
 *
 * Gespeichert wird ausschliesslich der Hash des Tokens; der Rohwert steht
 * nur in der versendeten E-Mail.
 */

export type ResetPurpose = "reset" | "invite";

/** Ein Link zum Zuruecksetzen gilt zwei Stunden, eine Einladung 14 Tage. */
const TTL_SECONDS: Record<ResetPurpose, number> = {
    reset: 2 * 60 * 60,
    invite: 14 * 24 * 60 * 60
};

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssuedToken {
    token: string;
    expiresAt: Date;
}

export async function issueToken(
    userId: ObjectId,
    purpose: ResetPurpose = "reset"
): Promise<IssuedToken> {
    // Aeltere, noch offene Tokens desselben Zwecks werden entwertet.
    await passwordResetTokens().deleteMany({ userId, usedAt: null });

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_SECONDS[purpose] * 1000);

    await passwordResetTokens().insertOne({
        tokenHash: hashToken(token),
        userId,
        createdAt: new Date(),
        expiresAt,
        usedAt: null
    });

    return { token, expiresAt };
}

export interface TokenLookup {
    valid: boolean;
    user?: UserDoc;
    tokenHash?: string;
}

export async function lookupToken(token: string): Promise<TokenLookup> {
    if (!token) return { valid: false };

    const tokenHash = hashToken(token);
    const entry = await passwordResetTokens().findOne({
        tokenHash,
        usedAt: null,
        expiresAt: { $gt: new Date() }
    });

    if (!entry) return { valid: false };

    const user = await users().findOne({ _id: entry.userId });
    if (!user) return { valid: false };

    return { valid: true, user, tokenHash };
}

/** Entwertet das Token. Erst danach darf das Passwort gesetzt werden. */
export async function consumeToken(tokenHash: string): Promise<boolean> {
    const result = await passwordResetTokens().updateOne(
        { tokenHash, usedAt: null },
        { $set: { usedAt: new Date() } }
    );
    return result.modifiedCount > 0;
}

export function emailHash(email: string): string {
    return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}
