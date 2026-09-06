import crypto from "node:crypto";
import { and, desc, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { apiTokens } from "$lib/server/db/schema";
import { ALL_PERMISSIONS } from "$lib/permissions";

/**
 * Zugangstoken der REST-API.
 *
 * Gleiches Muster wie bei Sitzungen: gespeichert wird nur der sha256-Hash,
 * der Klartext wird genau einmal beim Anlegen angezeigt. Wer die Datenbank
 * lesen kann, kann damit keine API-Anfrage stellen.
 *
 * Scopes sind dieselben Berechtigungsschluessel wie im Portal -- es gibt
 * bewusst kein zweites Berechtigungsmodell, das auseinanderlaufen koennte.
 */

export const TOKEN_PREFIX = "ep_";

export interface ApiTokenView {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    createdByName: string;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    /** Abgelaufen oder widerrufen. */
    inactive: boolean;
}

type TokenRow = typeof apiTokens.$inferSelect;

function toView(row: TokenRow): ApiTokenView {
    const expired = row.expiresAt !== null && row.expiresAt <= new Date();
    return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes: row.scopes,
        createdByName: row.createdByName ?? "",
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        inactive: row.revokedAt !== null || expired
    };
}

export function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function listApiTokens(): Promise<ApiTokenView[]> {
    const rows = await db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
    return rows.map(toView);
}

export interface CreateTokenInput {
    name: string;
    scopes: string[];
    expiresAt?: Date | null;
    createdBy?: string | null;
    createdByName?: string;
}

export interface CreateTokenResult {
    ok: boolean;
    error?: string;
    /** Klartext -- wird nur genau hier zurueckgegeben. */
    token?: string;
    view?: ApiTokenView;
}

export async function createApiToken(input: CreateTokenInput): Promise<CreateTokenResult> {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Bitte eine Bezeichnung angeben." };

    const scopes = normalizeScopes(input.scopes);
    if (scopes.length === 0) {
        return { ok: false, error: "Bitte mindestens eine Berechtigung auswählen." };
    }

    // 32 Byte Zufall reichen; base64url macht das Token kopierbar.
    const secret = crypto.randomBytes(32).toString("base64url");
    const token = `${TOKEN_PREFIX}${secret}`;

    const [row] = await db
        .insert(apiTokens)
        .values({
            name,
            tokenHash: hashToken(token),
            // Nur der Anfang wird gespeichert, damit man das Token in der
            // Liste wiedererkennt, ohne es rekonstruieren zu koennen.
            prefix: token.slice(0, 11),
            scopes,
            expiresAt: input.expiresAt ?? null,
            createdBy: isUuid(input.createdBy) ? input.createdBy : null,
            createdByName: input.createdByName ?? null
        })
        .returning();

    return { ok: true, token, view: toView(row) };
}

/**
 * Verwirft unbekannte Schluessel.
 *
 * Ein Token mit einem Tippfehler im Scope waere sonst still wirkungslos --
 * oder, schlimmer, jemand vergibt "finance" statt "finance.view" und wundert
 * sich, dass nichts geht.
 */
function normalizeScopes(scopes: string[]): string[] {
    const allowed = new Set<string>(ALL_PERMISSIONS);
    return Array.from(
        new Set(scopes.map((scope) => scope.trim()).filter((scope) => allowed.has(scope)))
    ).sort();
}

export async function revokeApiToken(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
        .returning({ id: apiTokens.id });
    return rows.length > 0;
}

export async function deleteApiToken(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .delete(apiTokens)
        .where(eq(apiTokens.id, id))
        .returning({ id: apiTokens.id });
    return rows.length > 0;
}

export interface ResolvedToken {
    id: string;
    name: string;
    scopes: string[];
}

/**
 * Loest ein Token aus dem Authorization-Header auf.
 *
 * Widerrufene und abgelaufene Tokens werden von der Abfrage selbst
 * ausgeschlossen -- die Pruefung darf nicht im Anwendungscode stehen, wo sie
 * jemand vergessen kann.
 */
export async function resolveApiToken(raw: string | null): Promise<ResolvedToken | null> {
    if (!raw) return null;

    const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
    if (!token.startsWith(TOKEN_PREFIX)) return null;

    const [row] = await db
        .select()
        .from(apiTokens)
        .where(
            and(
                eq(apiTokens.tokenHash, hashToken(token)),
                isNull(apiTokens.revokedAt),
                or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date()))
            )
        )
        .limit(1);

    if (!row) return null;

    // lastUsedAt wird nicht abgewartet: die Antwortzeit soll nicht an einem
    // Protokollschreibvorgang haengen.
    void db
        .update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, row.id))
        .catch(() => {});

    return { id: row.id, name: row.name, scopes: row.scopes };
}
