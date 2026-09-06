import crypto from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "$lib/server/db";
import { passwordResetTokens } from "$lib/server/db/schema";
import { getUser, type User } from "$lib/server/userService";

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
    userId: string,
    purpose: ResetPurpose = "reset"
): Promise<IssuedToken> {
    // Aeltere, noch offene Tokens desselben Benutzers werden entwertet.
    await db
        .delete(passwordResetTokens)
        .where(
            and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt))
        );

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL_SECONDS[purpose] * 1000);

    await db.insert(passwordResetTokens).values({
        tokenHash: hashToken(token),
        userId,
        expiresAt,
        usedAt: null
    });

    return { token, expiresAt };
}

export interface TokenLookup {
    valid: boolean;
    user?: User;
    tokenHash?: string;
}

export async function lookupToken(token: string): Promise<TokenLookup> {
    if (!token) return { valid: false };

    const tokenHash = hashToken(token);
    const [entry] = await db
        .select()
        .from(passwordResetTokens)
        .where(
            and(
                eq(passwordResetTokens.tokenHash, tokenHash),
                isNull(passwordResetTokens.usedAt),
                gt(passwordResetTokens.expiresAt, new Date())
            )
        )
        .limit(1);

    if (!entry) return { valid: false };

    const user = await getUser(entry.userId);
    if (!user) return { valid: false };

    return { valid: true, user, tokenHash };
}

/** Entwertet das Token. Erst danach darf das Passwort gesetzt werden. */
export async function consumeToken(tokenHash: string): Promise<boolean> {
    const rows = await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
            and(
                eq(passwordResetTokens.tokenHash, tokenHash),
                isNull(passwordResetTokens.usedAt)
            )
        )
        .returning({ id: passwordResetTokens.id });
    return rows.length > 0;
}

/** Entfernt abgelaufene Tokens. Ersetzt den frueheren TTL-Index. */
export async function cleanupResetTokens(): Promise<number> {
    const rows = await db
        .delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, new Date()))
        .returning({ id: passwordResetTokens.id });
    return rows.length;
}

export function emailHash(email: string): string {
    return crypto
        .createHash("sha256")
        .update(email.trim().toLowerCase())
        .digest("hex")
        .slice(0, 32);
}
