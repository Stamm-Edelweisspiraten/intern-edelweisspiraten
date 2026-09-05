import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, withTransaction, type Executor } from "$lib/server/db";
import { isUuid } from "$lib/server/db/ids";
import { articleSizes, articles, stockMovements } from "$lib/server/db/schema";
import { parseEuro, type Cents } from "$lib/money";

/**
 * Artikelverwaltung des Kämmerers.
 *
 * Bestandsregel, die bisher fehlte und deshalb garantiert auseinanderlief:
 * bei Artikeln MIT Größen ist `stock` ein abgeleiteter Wert (Summe der
 * Größenbestände) und wird nie direkt geschrieben; bei Artikeln OHNE Größen
 * ist `stock` maßgeblich.
 *
 * Neu ist die Tabelle stock_movements: jede Veränderung wird protokolliert.
 * Vorher war der Bestand nur eine Zahl -- nach einer Inventurkorrektur war
 * nicht mehr nachvollziehbar, was sie bewirkt hatte.
 */

export interface ArticleSizeInput {
    name: string;
    price: Cents;
    stock: number;
    minStock: number;
    orderUrl?: string;
}

export interface ArticleSizeView extends ArticleSizeInput {
    id: string;
    orderUrl: string;
}

export interface ArticleView {
    id: string;
    name: string;
    description: string;
    price: Cents;
    sizes: ArticleSizeView[];
    stock: number;
    minStock: number;
    active: boolean;
    orderUrl: string;
    /** true, wenn der Artikel Größen führt -- dann ist stock abgeleitet. */
    hasSizes: boolean;
}

type ArticleRow = typeof articles.$inferSelect;
type SizeRow = typeof articleSizes.$inferSelect;

function toArticleView(row: ArticleRow, sizeRows: SizeRow[]): ArticleView {
    const sizes = sizeRows.map((size) => ({
        id: size.id,
        name: size.name,
        price: size.price,
        stock: size.stock,
        minStock: size.minStock,
        orderUrl: size.orderUrl
    }));

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        sizes,
        stock: sizes.length > 0 ? sizes.reduce((sum, s) => sum + s.stock, 0) : row.stock,
        minStock: row.minStock,
        active: row.active,
        orderUrl: row.orderUrl,
        hasSizes: sizes.length > 0
    };
}

async function hydrate(rows: ArticleRow[]): Promise<ArticleView[]> {
    if (rows.length === 0) return [];

    const sizeRows = await db
        .select()
        .from(articleSizes)
        .where(
            inArray(
                articleSizes.articleId,
                rows.map((row) => row.id)
            )
        )
        .orderBy(asc(articleSizes.position));

    const byArticle = new Map<string, SizeRow[]>();
    for (const size of sizeRows) {
        const list = byArticle.get(size.articleId) ?? [];
        list.push(size);
        byArticle.set(size.articleId, list);
    }

    return rows.map((row) => toArticleView(row, byArticle.get(row.id) ?? []));
}

/**
 * Liest die Größen aus dem Formular. Akzeptiert JSON (so senden es beide
 * Formulare) sowie die ältere Schreibweise "S=10|5|https://…".
 */
export function parseSizes(raw: unknown): ArticleSizeInput[] {
    if (!raw) return [];

    if (Array.isArray(raw)) {
        return raw.map(normalizeSize).filter((size) => size.name.length > 0);
    }

    if (typeof raw !== "string") return [];

    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeSize).filter((size) => size.name.length > 0);
        }
    } catch {
        // Kein JSON -- unten als Textliste versuchen.
    }

    return trimmed
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [name, rest] = entry.split(/[:=]/).map((part) => part.trim());
            if (!name) return null;
            const [price, stock, orderUrl] = (rest ?? "").split("|").map((part) => part.trim());
            return normalizeSize({ name, price, stock, orderUrl });
        })
        .filter((size): size is ArticleSizeInput => size !== null && size.name.length > 0);
}

function normalizeSize(raw: unknown): ArticleSizeInput {
    const source = (raw ?? {}) as Record<string, unknown>;
    const priceValue = source.price;

    // Preise kommen je nach Formular als Euro-Text oder bereits als Cents.
    const price =
        typeof priceValue === "number"
            ? Math.round(priceValue)
            : (parseEuro(String(priceValue ?? "")) ?? 0);

    return {
        name: String(source.name ?? "").trim(),
        price,
        stock: Math.max(0, Math.trunc(Number(source.stock) || 0)),
        minStock: Math.max(0, Math.trunc(Number(source.minStock) || 0)),
        orderUrl: String(source.orderUrl ?? "")
    };
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function listArticles(includeInactive = false): Promise<ArticleView[]> {
    const rows = await db
        .select()
        .from(articles)
        .where(includeInactive ? undefined : eq(articles.active, true))
        .orderBy(asc(articles.name));
    return hydrate(rows);
}

export async function getArticle(id: string): Promise<ArticleView | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    const [article] = await hydrate(rows);
    return article ?? null;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export interface ArticleInput {
    name: string;
    description?: string;
    price: Cents;
    sizes?: ArticleSizeInput[];
    stock?: number;
    minStock?: number;
    active?: boolean;
    orderUrl?: string;
}

async function replaceSizes(
    tx: Executor,
    articleId: string,
    sizes: ArticleSizeInput[]
): Promise<void> {
    await tx.delete(articleSizes).where(eq(articleSizes.articleId, articleId));
    if (sizes.length === 0) return;

    await tx.insert(articleSizes).values(
        sizes.map((size, index) => ({
            articleId,
            name: size.name,
            price: size.price,
            stock: size.stock,
            minStock: size.minStock,
            orderUrl: size.orderUrl ?? "",
            position: index
        }))
    );
}

export async function createArticle(input: ArticleInput): Promise<ArticleView> {
    const sizes = input.sizes ?? [];

    const id = await withTransaction(async (tx) => {
        const [row] = await tx
            .insert(articles)
            .values({
                name: input.name.trim(),
                description: input.description ?? "",
                price: input.price,
                // Bei Größen ist der Bestand abgeleitet; ein gesendeter Wert
                // wird bewusst ignoriert statt die Summe zu überschreiben.
                stock:
                    sizes.length > 0
                        ? sizes.reduce((sum, size) => sum + size.stock, 0)
                        : Math.max(0, Math.trunc(input.stock ?? 0)),
                minStock: Math.max(0, Math.trunc(input.minStock ?? 0)),
                active: input.active !== false,
                orderUrl: input.orderUrl ?? ""
            })
            .returning({ id: articles.id });

        await replaceSizes(tx, row.id, sizes);
        return row.id;
    });

    const article = await getArticle(id);
    if (!article) throw new Error("Artikel konnte nicht gelesen werden.");
    return article;
}

export async function updateArticle(
    id: string,
    input: Partial<ArticleInput>
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const existing = await getArticle(id);
    if (!existing) return { ok: false, error: "Artikel nicht gefunden." };

    const update: Partial<typeof articles.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.description !== undefined) update.description = input.description;
    if (input.price !== undefined) update.price = input.price;
    if (input.minStock !== undefined) update.minStock = Math.max(0, Math.trunc(input.minStock));
    if (input.active !== undefined) update.active = input.active;
    if (input.orderUrl !== undefined) update.orderUrl = input.orderUrl;

    if (input.sizes !== undefined) {
        update.stock = input.sizes.reduce((sum, size) => sum + size.stock, 0);
    } else if (input.stock !== undefined) {
        // Direkter Bestand nur bei Artikeln ohne Größen.
        if (existing.hasSizes) {
            return {
                ok: false,
                error: "Bei Artikeln mit Größen wird der Bestand je Größe geführt."
            };
        }
        update.stock = Math.max(0, Math.trunc(input.stock));
    }

    await withTransaction(async (tx) => {
        await tx.update(articles).set(update).where(eq(articles.id, id));
        if (input.sizes !== undefined) await replaceSizes(tx, id, input.sizes);
    });

    return { ok: true };
}

export async function setArticleActive(id: string, active: boolean): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db
        .update(articles)
        .set({ active, updatedAt: new Date() })
        .where(eq(articles.id, id))
        .returning({ id: articles.id });
    return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Bestandsführung
// ---------------------------------------------------------------------------

export interface StockResult {
    ok: boolean;
    error?: string;
}

type MovementKind = "in" | "out" | "correction" | "order" | "return";

async function logMovement(
    tx: Executor,
    input: {
        articleId: string;
        sizeId?: string | null;
        kind: MovementKind;
        quantity: number;
        stockAfter: number;
        orderId?: string | null;
        note?: string;
        user?: string;
    }
): Promise<void> {
    await tx.insert(stockMovements).values({
        articleId: input.articleId,
        sizeId: input.sizeId ?? null,
        kind: input.kind,
        quantity: input.quantity,
        stockAfter: input.stockAfter,
        orderId: input.orderId ?? null,
        note: input.note ?? "",
        createdBy: input.user ?? "system"
    });
}

/** Führt den abgeleiteten Gesamtbestand eines Artikels mit Größen nach. */
async function recomputeStock(tx: Executor, articleId: string): Promise<number> {
    const [row] = await tx
        .select({ total: sql<number>`coalesce(sum(${articleSizes.stock}), 0)::int` })
        .from(articleSizes)
        .where(eq(articleSizes.articleId, articleId));

    const total = Number(row?.total ?? 0);
    await tx.update(articles).set({ stock: total, updatedAt: new Date() }).where(eq(articles.id, articleId));
    return total;
}

/**
 * Bucht Bestand ab.
 *
 * Das bedingte UPDATE verhindert, dass der Bestand negativ wird -- vorher gab
 * es keine Untergrenze, weshalb die Oberfläche sogar ein eigenes Abzeichen
 * "Bestand negativ" führte.
 */
export async function decrementStock(
    articleId: string,
    quantity: number,
    size?: string | null,
    options: { orderId?: string | null; note?: string; user?: string } = {}
): Promise<StockResult> {
    if (!isUuid(articleId)) return { ok: false, error: "Ungültige Kennung." };
    if (quantity <= 0) return { ok: true };

    return withTransaction(async (tx) => {
        if (size) {
            const rows = await tx
                .update(articleSizes)
                .set({ stock: sql`${articleSizes.stock} - ${quantity}` })
                .where(
                    and(
                        eq(articleSizes.articleId, articleId),
                        eq(articleSizes.name, size),
                        sql`${articleSizes.stock} >= ${quantity}`
                    )
                )
                .returning({ id: articleSizes.id, stock: articleSizes.stock });

            if (rows.length === 0) {
                return { ok: false, error: `Nicht genug Bestand in Größe ${size}.` };
            }

            await recomputeStock(tx, articleId);
            await logMovement(tx, {
                articleId,
                sizeId: rows[0].id,
                kind: options.orderId ? "order" : "out",
                quantity: -quantity,
                stockAfter: rows[0].stock,
                orderId: options.orderId,
                note: options.note,
                user: options.user
            });
            return { ok: true };
        }

        const rows = await tx
            .update(articles)
            .set({ stock: sql`${articles.stock} - ${quantity}`, updatedAt: new Date() })
            .where(and(eq(articles.id, articleId), sql`${articles.stock} >= ${quantity}`))
            .returning({ stock: articles.stock });

        if (rows.length === 0) return { ok: false, error: "Nicht genug Bestand." };

        await logMovement(tx, {
            articleId,
            kind: options.orderId ? "order" : "out",
            quantity: -quantity,
            stockAfter: rows[0].stock,
            orderId: options.orderId,
            note: options.note,
            user: options.user
        });
        return { ok: true };
    });
}

/** Bucht Bestand zurück, etwa beim Stornieren einer Bestellung. */
export async function incrementStock(
    articleId: string,
    quantity: number,
    size?: string | null,
    options: { orderId?: string | null; note?: string; user?: string } = {}
): Promise<StockResult> {
    if (!isUuid(articleId)) return { ok: false, error: "Ungültige Kennung." };
    if (quantity <= 0) return { ok: true };

    return withTransaction(async (tx) => {
        if (size) {
            const rows = await tx
                .update(articleSizes)
                .set({ stock: sql`${articleSizes.stock} + ${quantity}` })
                .where(and(eq(articleSizes.articleId, articleId), eq(articleSizes.name, size)))
                .returning({ id: articleSizes.id, stock: articleSizes.stock });

            if (rows.length > 0) {
                await recomputeStock(tx, articleId);
                await logMovement(tx, {
                    articleId,
                    sizeId: rows[0].id,
                    kind: options.orderId ? "return" : "in",
                    quantity,
                    stockAfter: rows[0].stock,
                    orderId: options.orderId,
                    note: options.note,
                    user: options.user
                });
                return { ok: true };
            }
        }

        const rows = await tx
            .update(articles)
            .set({ stock: sql`${articles.stock} + ${quantity}`, updatedAt: new Date() })
            .where(eq(articles.id, articleId))
            .returning({ stock: articles.stock });

        if (rows.length === 0) return { ok: false, error: "Artikel nicht gefunden." };

        await logMovement(tx, {
            articleId,
            kind: options.orderId ? "return" : "in",
            quantity,
            stockAfter: rows[0].stock,
            orderId: options.orderId,
            note: options.note,
            user: options.user
        });
        return { ok: true };
    });
}

/** Setzt einen Bestand absolut (Inventurkorrektur), nie unter 0. */
export async function correctStock(
    articleId: string,
    value: number,
    size?: string | null,
    options: { note?: string; user?: string } = {}
): Promise<StockResult> {
    if (!isUuid(articleId)) return { ok: false, error: "Ungültige Kennung." };

    const target = Math.max(0, Math.trunc(value));
    const article = await getArticle(articleId);
    if (!article) return { ok: false, error: "Artikel nicht gefunden." };

    if (!size && article.hasSizes) {
        return { ok: false, error: "Bei Artikeln mit Größen bitte je Größe korrigieren." };
    }

    return withTransaction(async (tx) => {
        if (size) {
            const before = article.sizes.find((entry) => entry.name === size);
            if (!before) return { ok: false, error: `Größe ${size} gibt es nicht.` };

            const rows = await tx
                .update(articleSizes)
                .set({ stock: target })
                .where(and(eq(articleSizes.articleId, articleId), eq(articleSizes.name, size)))
                .returning({ id: articleSizes.id });

            await recomputeStock(tx, articleId);
            await logMovement(tx, {
                articleId,
                sizeId: rows[0]?.id ?? null,
                kind: "correction",
                quantity: target - before.stock,
                stockAfter: target,
                note: options.note,
                user: options.user
            });
            return { ok: true };
        }

        await tx
            .update(articles)
            .set({ stock: target, updatedAt: new Date() })
            .where(eq(articles.id, articleId));

        await logMovement(tx, {
            articleId,
            kind: "correction",
            quantity: target - article.stock,
            stockAfter: target,
            note: options.note,
            user: options.user
        });
        return { ok: true };
    });
}

/** Bewegungen eines Artikels, neueste zuerst. */
export async function listStockMovements(articleId: string, limit = 50) {
    if (!isUuid(articleId)) return [];
    return db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.articleId, articleId))
        .orderBy(sql`${stockMovements.createdAt} desc`)
        .limit(limit);
}

// ---------------------------------------------------------------------------
// Nachbestellliste
// ---------------------------------------------------------------------------

export interface ReorderRow {
    articleId: string;
    name: string;
    size: string | null;
    stock: number;
    minStock: number;
    missing: number;
    orderUrl: string;
}

/**
 * Nachbestellliste.
 *
 * Vorher wurde JEDE Größe gegen den artikelweiten Mindestbestand verglichen:
 * ein Artikel mit Mindestbestand 10 und fünf Größen meldete dadurch einen
 * Fehlbestand von 10 pro Größe, also das Fünffache des tatsächlichen Bedarfs.
 * Jetzt hat jede Größe ihren eigenen Mindestbestand.
 */
export async function getReorderList(): Promise<ReorderRow[]> {
    const list = await listArticles(false);
    const rows: ReorderRow[] = [];

    for (const article of list) {
        if (article.hasSizes) {
            for (const size of article.sizes) {
                const missing = Math.max(0, size.minStock - size.stock);
                if (missing > 0) {
                    rows.push({
                        articleId: article.id,
                        name: article.name,
                        size: size.name,
                        stock: size.stock,
                        minStock: size.minStock,
                        missing,
                        orderUrl: size.orderUrl || article.orderUrl
                    });
                }
            }
        } else {
            const missing = Math.max(0, article.minStock - article.stock);
            if (missing > 0) {
                rows.push({
                    articleId: article.id,
                    name: article.name,
                    size: null,
                    stock: article.stock,
                    minStock: article.minStock,
                    missing,
                    orderUrl: article.orderUrl
                });
            }
        }
    }

    return rows;
}
