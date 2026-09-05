import { ObjectId } from "mongodb";
import { articles, type ArticleDoc, type ArticleSizeDoc } from "$lib/server/db/collections";
import { parseEuro, type Cents } from "$lib/money";

/**
 * Artikelverwaltung des Kämmerers.
 *
 * Bestandsregel, die bisher fehlte und deshalb garantiert auseinanderlief:
 * bei Artikeln MIT Größen ist `stock` ein abgeleiteter Wert (Summe der
 * Größenbestände) und wird nie direkt geschrieben; bei Artikeln OHNE Größen
 * ist `stock` maßgeblich.
 *
 * Vorher überschrieb createArticle die Größensumme mit 0, sobald das Formular
 * ein leeres Bestandsfeld sendete, und updateArticle berechnete den Bestand
 * bei jedem Speichern neu -- um ihn direkt danach wieder mit dem gesendeten
 * Wert zu überschreiben.
 */

export interface ArticleSizeInput {
    name: string;
    price: Cents;
    stock: number;
    minStock: number;
    orderUrl?: string;
}

export interface ArticleView {
    id: string;
    name: string;
    description: string;
    price: Cents;
    sizes: ArticleSizeDoc[];
    stock: number;
    minStock: number;
    active: boolean;
    orderUrl: string;
    /** true, wenn der Artikel Größen führt -- dann ist stock abgeleitet. */
    hasSizes: boolean;
}

export function toArticleView(doc: ArticleDoc): ArticleView {
    const sizes = doc.sizes ?? [];
    return {
        id: doc._id!.toString(),
        name: doc.name,
        description: doc.description ?? "",
        price: doc.price,
        sizes,
        stock: sizes.length > 0 ? sizes.reduce((sum, s) => sum + (s.stock ?? 0), 0) : (doc.stock ?? 0),
        minStock: doc.minStock ?? 0,
        active: doc.active !== false,
        orderUrl: doc.orderUrl ?? "",
        hasSizes: sizes.length > 0
    };
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

export async function listArticles(includeInactive = false): Promise<ArticleView[]> {
    const query = includeInactive ? {} : { active: { $ne: false } };
    const docs = await articles().find(query).sort({ name: 1 }).toArray();
    return docs.map(toArticleView);
}

export async function getArticle(id: string): Promise<ArticleView | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await articles().findOne({ _id: new ObjectId(id) });
    return doc ? toArticleView(doc) : null;
}

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

export async function createArticle(input: ArticleInput): Promise<ArticleView> {
    const sizes = (input.sizes ?? []).map((size) => ({ ...size }));
    const now = new Date();

    const doc: ArticleDoc = {
        name: input.name.trim(),
        description: input.description ?? "",
        price: input.price,
        sizes,
        // Bei Größen ist der Bestand abgeleitet; ein gesendeter Wert wird
        // bewusst ignoriert statt die Summe zu überschreiben.
        stock: sizes.length > 0
            ? sizes.reduce((sum, size) => sum + size.stock, 0)
            : Math.max(0, Math.trunc(input.stock ?? 0)),
        minStock: Math.max(0, Math.trunc(input.minStock ?? 0)),
        active: input.active !== false,
        orderUrl: input.orderUrl ?? "",
        createdAt: now
    };

    const result = await articles().insertOne(doc);
    return toArticleView({ ...doc, _id: result.insertedId });
}

export async function updateArticle(
    id: string,
    input: Partial<ArticleInput>
): Promise<{ ok: boolean; error?: string }> {
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const articleId = new ObjectId(id);
    const existing = await articles().findOne({ _id: articleId });
    if (!existing) return { ok: false, error: "Artikel nicht gefunden." };

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) update.name = input.name.trim();
    if (input.description !== undefined) update.description = input.description;
    if (input.price !== undefined) update.price = input.price;
    if (input.minStock !== undefined) update.minStock = Math.max(0, Math.trunc(input.minStock));
    if (input.active !== undefined) update.active = input.active;
    if (input.orderUrl !== undefined) update.orderUrl = input.orderUrl;

    if (input.sizes !== undefined) {
        update.sizes = input.sizes;
        update.stock = input.sizes.reduce((sum, size) => sum + size.stock, 0);
    } else if (input.stock !== undefined) {
        // Direkter Bestand nur bei Artikeln ohne Größen.
        if ((existing.sizes ?? []).length > 0) {
            return {
                ok: false,
                error: "Bei Artikeln mit Größen wird der Bestand je Größe geführt."
            };
        }
        update.stock = Math.max(0, Math.trunc(input.stock));
    }

    await articles().updateOne({ _id: articleId }, { $set: update });
    return { ok: true };
}

export async function setArticleActive(id: string, active: boolean): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await articles().updateOne(
        { _id: new ObjectId(id) },
        { $set: { active, updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}

// ---------------------------------------------------------------------------
// Bestandsführung
// ---------------------------------------------------------------------------

export interface StockResult {
    ok: boolean;
    error?: string;
}

/**
 * Bucht Bestand ab. Der bedingte $inc verhindert, dass der Bestand negativ
 * wird -- vorher gab es keine Untergrenze, weshalb die Oberfläche sogar ein
 * eigenes Abzeichen "Bestand negativ" führte.
 */
export async function decrementStock(
    articleId: string,
    quantity: number,
    size?: string | null
): Promise<StockResult> {
    if (!ObjectId.isValid(articleId)) return { ok: false, error: "Ungültige Kennung." };
    if (quantity <= 0) return { ok: true };

    const id = new ObjectId(articleId);

    if (size) {
        const result = await articles().updateOne(
            {
                _id: id,
                sizes: { $elemMatch: { name: size, stock: { $gte: quantity } } }
            },
            {
                $inc: { "sizes.$[entry].stock": -quantity, stock: -quantity },
                $set: { updatedAt: new Date() }
            },
            { arrayFilters: [{ "entry.name": size }] }
        );

        if (result.matchedCount === 0) {
            return { ok: false, error: `Nicht genug Bestand in Größe ${size}.` };
        }
        return { ok: true };
    }

    const result = await articles().updateOne(
        { _id: id, stock: { $gte: quantity } },
        { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) return { ok: false, error: "Nicht genug Bestand." };
    return { ok: true };
}

/** Bucht Bestand zurück, etwa beim Stornieren einer Bestellung. */
export async function incrementStock(
    articleId: string,
    quantity: number,
    size?: string | null
): Promise<StockResult> {
    if (!ObjectId.isValid(articleId)) return { ok: false, error: "Ungültige Kennung." };
    if (quantity <= 0) return { ok: true };

    const id = new ObjectId(articleId);

    if (size) {
        const result = await articles().updateOne(
            { _id: id, "sizes.name": size },
            {
                $inc: { "sizes.$[entry].stock": quantity, stock: quantity },
                $set: { updatedAt: new Date() }
            },
            { arrayFilters: [{ "entry.name": size }] }
        );
        if (result.matchedCount > 0) return { ok: true };
    }

    await articles().updateOne(
        { _id: id },
        { $inc: { stock: quantity }, $set: { updatedAt: new Date() } }
    );
    return { ok: true };
}

/** Setzt einen Bestand absolut (Inventurkorrektur), nie unter 0. */
export async function correctStock(
    articleId: string,
    value: number,
    size?: string | null
): Promise<StockResult> {
    if (!ObjectId.isValid(articleId)) return { ok: false, error: "Ungültige Kennung." };

    const id = new ObjectId(articleId);
    const target = Math.max(0, Math.trunc(value));

    if (size) {
        await articles().updateOne(
            { _id: id, "sizes.name": size },
            { $set: { "sizes.$[entry].stock": target, updatedAt: new Date() }, },
            { arrayFilters: [{ "entry.name": size }] }
        );
        await recomputeStock(id);
        return { ok: true };
    }

    const article = await articles().findOne({ _id: id });
    if ((article?.sizes ?? []).length > 0) {
        return { ok: false, error: "Bei Artikeln mit Größen bitte je Größe korrigieren." };
    }

    await articles().updateOne({ _id: id }, { $set: { stock: target, updatedAt: new Date() } });
    return { ok: true };
}

/** Führt den abgeleiteten Gesamtbestand nach. */
async function recomputeStock(id: ObjectId): Promise<void> {
    const article = await articles().findOne({ _id: id });
    if (!article || (article.sizes ?? []).length === 0) return;

    const total = article.sizes.reduce((sum, size) => sum + (size.stock ?? 0), 0);
    await articles().updateOne({ _id: id }, { $set: { stock: total } });
}

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
    const docs = await articles().find({ active: { $ne: false } }).sort({ name: 1 }).toArray();
    const rows: ReorderRow[] = [];

    for (const doc of docs) {
        const view = toArticleView(doc);

        if (view.hasSizes) {
            for (const size of view.sizes) {
                const minStock = size.minStock ?? 0;
                const missing = Math.max(0, minStock - (size.stock ?? 0));
                if (missing > 0) {
                    rows.push({
                        articleId: view.id,
                        name: view.name,
                        size: size.name,
                        stock: size.stock ?? 0,
                        minStock,
                        missing,
                        orderUrl: size.orderUrl || view.orderUrl
                    });
                }
            }
        } else {
            const missing = Math.max(0, view.minStock - view.stock);
            if (missing > 0) {
                rows.push({
                    articleId: view.id,
                    name: view.name,
                    size: null,
                    stock: view.stock,
                    minStock: view.minStock,
                    missing,
                    orderUrl: view.orderUrl
                });
            }
        }
    }

    return rows;
}
