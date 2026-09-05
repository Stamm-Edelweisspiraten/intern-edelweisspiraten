import crypto from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, withTransaction } from "$lib/server/db";
import { isUuid, onlyUuids } from "$lib/server/db/ids";
import {
    articleSizes,
    articles,
    orderItems,
    orderMembers,
    orders
} from "$lib/server/db/schema";
import { sumCents, type Cents } from "$lib/money";
import { fullName } from "$lib/format";
import { getMembersByIds } from "$lib/server/memberService";
import {
    isOrderStatus,
    isPaymentStatus,
    type OrderStatus,
    type PaymentStatus
} from "$lib/kaemmerer/orderStatus";
import { decrementStock, incrementStock } from "./articleService";
import { cancelOrderBilling, createInvoicesForOrder } from "$lib/server/orders/orderBilling";
import { NoActiveFiscalYearError } from "$lib/server/finance/types";

/** Bestellungen des Kämmerers. */

export interface OrderItemView {
    id: string;
    position: number;
    articleId: string | null;
    name: string;
    size: string | null;
    price: Cents;
    quantity: number;
    total: Cents;
    received: boolean;
    stockBooked: boolean;
    /** true, wenn der Bestand beim Anlegen nicht reichte. */
    backorder: boolean;
}

export interface OrderView {
    id: string;
    number: string;
    items: OrderItemView[];
    members: { id: string; name: string }[];
    memberIds: string[];
    total: Cents;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    cancelled: boolean;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    receivedCount: number;
}

type OrderRow = typeof orders.$inferSelect;

async function hydrate(rows: OrderRow[]): Promise<OrderView[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [itemRows, memberRows] = await Promise.all([
        db
            .select()
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
            .orderBy(asc(orderItems.position)),
        db.select().from(orderMembers).where(inArray(orderMembers.orderId, ids))
    ]);

    const itemsByOrder = new Map<string, OrderItemView[]>();
    for (const item of itemRows) {
        const list = itemsByOrder.get(item.orderId) ?? [];
        list.push({
            id: item.id,
            position: item.position,
            articleId: item.articleId,
            name: item.name,
            size: item.size,
            price: item.price,
            quantity: item.quantity,
            total: item.total,
            received: item.received,
            stockBooked: item.stockBooked,
            backorder: !item.stockBooked && !item.received
        });
        itemsByOrder.set(item.orderId, list);
    }

    const membersByOrder = new Map<string, { id: string; name: string }[]>();
    for (const member of memberRows) {
        const list = membersByOrder.get(member.orderId) ?? [];
        list.push({ id: member.memberId, name: member.memberName });
        membersByOrder.set(member.orderId, list);
    }

    return rows.map((row) => {
        const items = itemsByOrder.get(row.id) ?? [];
        const members = membersByOrder.get(row.id) ?? [];
        return {
            id: row.id,
            number: row.number,
            items,
            members,
            memberIds: members.map((member) => member.id),
            total: row.total,
            status: row.status,
            paymentStatus: row.paymentStatus,
            cancelled: row.cancelledAt !== null,
            createdBy: row.createdBy ?? "",
            createdByName: row.createdByName,
            createdAt: row.createdAt.toISOString(),
            receivedCount: items.filter((item) => item.received).length
        };
    });
}

function generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
    return `ORD-${timestamp}-${random}`;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function listOrders(filter: { status?: string } = {}): Promise<OrderView[]> {
    // Nur gültige Statuswerte wirken als Filter.
    const condition =
        filter.status && isOrderStatus(filter.status) ? eq(orders.status, filter.status) : undefined;

    const rows = await db.select().from(orders).where(condition).orderBy(desc(orders.createdAt));
    return hydrate(rows);
}

export async function listOrdersForMembers(memberIds: string[]): Promise<OrderView[]> {
    const valid = onlyUuids(memberIds);
    if (valid.length === 0) return [];

    const rows = await db
        .selectDistinct({ order: orders })
        .from(orders)
        .innerJoin(orderMembers, eq(orderMembers.orderId, orders.id))
        .where(inArray(orderMembers.memberId, valid))
        .orderBy(desc(orders.createdAt));

    return hydrate(rows.map((row) => row.order));
}

export async function getOrderById(id: string): Promise<OrderView | null> {
    if (!isUuid(id)) return null;
    const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const [order] = await hydrate(rows);
    return order ?? null;
}

/** Nur Bestellungen, an denen der Benutzer selbst beteiligt ist. */
export async function getOrderForMembers(
    id: string,
    memberIds: string[]
): Promise<OrderView | null> {
    const valid = onlyUuids(memberIds);
    if (!isUuid(id) || valid.length === 0) return null;

    const rows = await db
        .selectDistinct({ order: orders })
        .from(orders)
        .innerJoin(orderMembers, eq(orderMembers.orderId, orders.id))
        .where(and(eq(orders.id, id), inArray(orderMembers.memberId, valid)))
        .limit(1);

    const [order] = await hydrate(rows.map((row) => row.order));
    return order ?? null;
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

export interface OrderLineInput {
    articleId: string;
    size?: string | null;
    quantity: number;
}

export interface CreateOrderInput {
    lines: OrderLineInput[];
    memberIds: string[];
    createdBy: string;
    createdByName: string;
}

export interface CreateOrderResult {
    ok: boolean;
    error?: string;
    order?: OrderView;
    /** Positionen, für die der Bestand nicht reichte. */
    backorders?: string[];
}

/**
 * Legt eine Bestellung an.
 *
 * Wichtig: Preise werden ausschließlich serverseitig aus dem Artikel
 * aufgelöst. Vorher übernahm der Server den Preis aus einem versteckten
 * JSON-Feld des Formulars -- ein Mitglied konnte damit jeden Artikel zu einem
 * selbst gewählten Preis bestellen.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const lines = input.lines.filter((line) => line.quantity > 0 && isUuid(line.articleId));
    if (lines.length === 0) {
        return { ok: false, error: "Bitte mindestens eine Position mit Menge auswählen." };
    }

    const memberIds = onlyUuids(input.memberIds);
    if (memberIds.length === 0) {
        return { ok: false, error: "Bitte mindestens ein Mitglied auswählen." };
    }

    const articleIds = Array.from(new Set(lines.map((line) => line.articleId)));
    const [articleRows, sizeRows] = await Promise.all([
        db.select().from(articles).where(inArray(articles.id, articleIds)),
        db.select().from(articleSizes).where(inArray(articleSizes.articleId, articleIds))
    ]);

    const byId = new Map(articleRows.map((row) => [row.id, row]));
    const sizesByArticle = new Map<string, typeof sizeRows>();
    for (const size of sizeRows) {
        const list = sizesByArticle.get(size.articleId) ?? [];
        list.push(size);
        sizesByArticle.set(size.articleId, list);
    }

    const items: {
        articleId: string;
        sizeId: string | null;
        name: string;
        size: string | null;
        price: Cents;
        quantity: number;
        total: Cents;
    }[] = [];

    for (const line of lines) {
        const article = byId.get(line.articleId);
        if (!article) return { ok: false, error: "Ein ausgewählter Artikel existiert nicht mehr." };
        if (!article.active) {
            return { ok: false, error: `„${article.name}“ ist derzeit nicht bestellbar.` };
        }

        const quantity = Math.min(100, Math.max(1, Math.trunc(line.quantity)));
        const size = line.size || null;

        let price = article.price;
        let sizeId: string | null = null;

        if (size) {
            const variant = (sizesByArticle.get(article.id) ?? []).find(
                (entry) => entry.name === size
            );
            if (!variant) {
                return { ok: false, error: `Größe „${size}“ gibt es bei „${article.name}“ nicht.` };
            }
            price = variant.price || article.price;
            sizeId = variant.id;
        }

        items.push({
            articleId: article.id,
            sizeId,
            name: article.name,
            size,
            price,
            quantity,
            total: price * quantity
        });
    }

    const total = sumCents(items.map((item) => item.total));

    // Mitgliedsnamen in einer Abfrage auflösen.
    const memberRows = await getMembersByIds(memberIds);
    const nameById = new Map(memberRows.map((member) => [member.id, fullName(member)]));
    const members = memberIds.map((id) => ({ id, name: nameById.get(id) ?? "Unbekannt" }));

    const number = generateOrderNumber();

    const orderId = await withTransaction(async (tx) => {
        const [row] = await tx
            .insert(orders)
            .values({
                number,
                total,
                status: "ordered",
                paymentStatus: "open",
                createdBy: isUuid(input.createdBy) ? input.createdBy : null,
                createdByName: input.createdByName
            })
            .returning({ id: orders.id });

        await tx.insert(orderItems).values(
            items.map((item, index) => ({
                orderId: row.id,
                position: index,
                articleId: item.articleId,
                sizeId: item.sizeId,
                name: item.name,
                size: item.size,
                price: item.price,
                quantity: item.quantity,
                total: item.total,
                received: false,
                stockBooked: false
            }))
        );

        await tx.insert(orderMembers).values(
            members.map((member) => ({
                orderId: row.id,
                memberId: member.id,
                memberName: member.name
            }))
        );

        return row.id;
    });

    // Rechnungen anlegen. Fehlt ein aktives Geschäftsjahr, schlägt das jetzt
    // sichtbar fehl -- vorher entstand still eine Bestellung, die niemand
    // jemals bezahlen musste.
    try {
        await createInvoicesForOrder({
            orderId,
            orderNumber: number,
            members,
            total,
            createdBy: input.createdBy,
            itemSummary: items
                .map((item) => `${item.quantity}x ${item.name}${item.size ? ` (${item.size})` : ""}`)
                .join(", ")
        });
    } catch (err) {
        await db.delete(orders).where(eq(orders.id, orderId));

        if (err instanceof NoActiveFiscalYearError) {
            return {
                ok: false,
                error: "Es ist kein aktives Geschäftsjahr vorhanden. Bitte zuerst eines anlegen."
            };
        }
        throw err;
    }

    // Lagerabgang buchen, soweit Bestand vorhanden ist. Fehlender Bestand
    // führt zu einem Vermerk statt zu einem negativen Bestand.
    const backorders: string[] = [];
    const stored = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.position));

    for (const item of stored) {
        if (!item.articleId) continue;

        const result = await decrementStock(item.articleId, item.quantity, item.size, {
            orderId,
            note: `Bestellung ${number}`,
            user: input.createdByName
        });

        await db
            .update(orderItems)
            .set({ stockBooked: result.ok })
            .where(eq(orderItems.id, item.id));

        if (!result.ok) {
            backorders.push(`${item.name}${item.size ? ` (${item.size})` : ""}`);
        }
    }

    const order = await getOrderById(orderId);
    return {
        ok: true,
        order: order ?? undefined,
        backorders: backorders.length > 0 ? backorders : undefined
    };
}

// ---------------------------------------------------------------------------
// Ändern
// ---------------------------------------------------------------------------

export async function updateOrderStatus(
    id: string,
    status: string,
    paymentStatus?: string
): Promise<{ ok: boolean; error?: string }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    // Vorher wurde der Formularwert per `as any` ungeprüft gespeichert.
    if (!isOrderStatus(status)) return { ok: false, error: "Unbekannter Bestellstatus." };

    const update: Partial<typeof orders.$inferInsert> = { status, updatedAt: new Date() };

    if (paymentStatus !== undefined && paymentStatus !== "") {
        if (!isPaymentStatus(paymentStatus)) {
            return { ok: false, error: "Unbekannter Zahlungsstatus." };
        }
        update.paymentStatus = paymentStatus;
    }

    const rows = await db
        .update(orders)
        .set(update)
        .where(eq(orders.id, id))
        .returning({ id: orders.id });

    return rows.length > 0 ? { ok: true } : { ok: false, error: "Bestellung nicht gefunden." };
}

/**
 * Markiert eine Position als geliefert.
 *
 * Angesprochen wird die Position jetzt über ihre Kennung statt über einen
 * Index ins Array. Vorher konnte ein zu großer Index MongoDB veranlassen, das
 * items-Array mit null-Einträgen aufzufüllen.
 */
export async function setItemReceived(
    orderId: string,
    itemId: string,
    received: boolean
): Promise<{ ok: boolean; error?: string; allReceived?: boolean }> {
    if (!isUuid(orderId) || !isUuid(itemId)) return { ok: false, error: "Ungültige Kennung." };

    const rows = await db
        .update(orderItems)
        .set({ received })
        .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
        .returning({ id: orderItems.id });

    if (rows.length === 0) return { ok: false, error: "Diese Position gibt es nicht." };

    const order = await getOrderById(orderId);
    if (!order) return { ok: false, error: "Bestellung nicht gefunden." };

    const allReceived = order.items.length > 0 && order.items.every((item) => item.received);

    // Nur der Lieferstatus wird angepasst -- der Zahlungsstatus bleibt
    // unberührt und umgekehrt.
    if (allReceived && order.status !== "delivered" && !order.cancelled) {
        await db
            .update(orders)
            .set({ status: "delivered", updatedAt: new Date() })
            .where(eq(orders.id, orderId));
    } else if (!allReceived && order.status === "delivered") {
        await db
            .update(orders)
            .set({ status: "processing", updatedAt: new Date() })
            .where(eq(orders.id, orderId));
    }

    return { ok: true, allReceived };
}

/**
 * Storniert eine Bestellung: bucht den Lagerbestand zurück und storniert die
 * zugehörigen Rechnungen. Bisher gab es keine Möglichkeit, eine Bestellung
 * rückgängig zu machen -- weshalb sich negative Bestände ansammelten.
 */
export async function cancelOrder(
    id: string,
    user: string
): Promise<{ ok: boolean; error?: string; restored?: number }> {
    if (!isUuid(id)) return { ok: false, error: "Ungültige Kennung." };

    const order = await getOrderById(id);
    if (!order) return { ok: false, error: "Bestellung nicht gefunden." };
    if (order.cancelled) return { ok: false, error: "Diese Bestellung ist bereits storniert." };

    let restored = 0;
    for (const item of order.items) {
        // Nur zurückbuchen, was tatsächlich abgebucht und noch nicht
        // ausgehändigt wurde.
        if (item.articleId && item.stockBooked && !item.received) {
            await incrementStock(item.articleId, item.quantity, item.size, {
                orderId: id,
                note: `Storno Bestellung ${order.number}`,
                user
            });
            restored += 1;
        }
    }

    await cancelOrderBilling(id, user);

    await db
        .update(orders)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, id));

    return { ok: true, restored };
}
