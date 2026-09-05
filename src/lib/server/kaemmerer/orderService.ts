import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import { articles, orders, type OrderDoc, type OrderItemDoc } from "$lib/server/db/collections";
import { db } from "$lib/server/mongo";
import { sumCents, type Cents } from "$lib/money";
import { fullName } from "$lib/format";
import {
    isOrderStatus,
    isPaymentStatus,
    type OrderStatus,
    type PaymentStatus
} from "$lib/kaemmerer/orderStatus";
import { decrementStock, incrementStock } from "./articleService";
import { createInvoicesForOrder, cancelOrderBilling } from "$lib/server/orders/orderBilling";
import { NoActiveFiscalYearError } from "$lib/server/finance/types";

/** Bestellungen des Kämmerers. */

export interface OrderView {
    id: string;
    number: string;
    items: (OrderItemDoc & { backorder?: boolean })[];
    members: { id: string; name: string }[];
    memberIds: string[];
    invoiceIds: string[];
    total: Cents;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    cancelled: boolean;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    receivedCount: number;
}

export function toOrderView(doc: OrderDoc): OrderView {
    const items = doc.items ?? [];
    return {
        id: doc._id!.toString(),
        number: doc.number,
        items,
        members: doc.members ?? [],
        memberIds: doc.memberIds ?? [],
        invoiceIds: doc.invoiceIds ?? [],
        total: doc.total,
        status: doc.status,
        paymentStatus: doc.paymentStatus,
        cancelled: !!doc.cancelledAt,
        createdBy: doc.createdBy ?? "",
        createdByName: doc.createdByName ?? "",
        createdAt: doc.createdAt.toISOString(),
        receivedCount: items.filter((item) => item.received).length
    };
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
    const query: Record<string, unknown> = {};
    // Nur gültige Statuswerte wirken als Filter.
    if (filter.status && isOrderStatus(filter.status)) query.status = filter.status;

    const docs = await orders().find(query as never).sort({ createdAt: -1 }).toArray();
    return docs.map(toOrderView);
}

export async function listOrdersForMembers(memberIds: string[]): Promise<OrderView[]> {
    if (memberIds.length === 0) return [];
    const docs = await orders()
        .find({ memberIds: { $in: memberIds } })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(toOrderView);
}

export async function getOrderById(id: string): Promise<OrderView | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await orders().findOne({ _id: new ObjectId(id) });
    return doc ? toOrderView(doc) : null;
}

/** Nur Bestellungen, an denen der Benutzer selbst beteiligt ist. */
export async function getOrderForMembers(
    id: string,
    memberIds: string[]
): Promise<OrderView | null> {
    if (!ObjectId.isValid(id) || memberIds.length === 0) return null;
    const doc = await orders().findOne({ _id: new ObjectId(id), memberIds: { $in: memberIds } });
    return doc ? toOrderView(doc) : null;
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
    const lines = input.lines.filter((line) => line.quantity > 0 && ObjectId.isValid(line.articleId));
    if (lines.length === 0) {
        return { ok: false, error: "Bitte mindestens eine Position mit Menge auswählen." };
    }
    if (input.memberIds.length === 0) {
        return { ok: false, error: "Bitte mindestens ein Mitglied auswählen." };
    }

    const articleDocs = await articles()
        .find({ _id: { $in: lines.map((line) => new ObjectId(line.articleId)) } })
        .toArray();
    const byId = new Map(articleDocs.map((doc) => [doc._id!.toString(), doc]));

    const items: OrderItemDoc[] = [];

    for (const line of lines) {
        const article = byId.get(line.articleId);
        if (!article) return { ok: false, error: "Ein ausgewählter Artikel existiert nicht mehr." };
        if (article.active === false) {
            return { ok: false, error: `„${article.name}“ ist derzeit nicht bestellbar.` };
        }

        const quantity = Math.min(100, Math.max(1, Math.trunc(line.quantity)));
        const size = line.size || null;

        let price = article.price;
        if (size) {
            const variant = (article.sizes ?? []).find((entry) => entry.name === size);
            if (!variant) {
                return { ok: false, error: `Größe „${size}“ gibt es bei „${article.name}“ nicht.` };
            }
            price = variant.price || article.price;
        }

        items.push({
            articleId: line.articleId,
            name: article.name,
            price,
            size: size ?? undefined,
            quantity,
            total: price * quantity,
            received: false,
            stockBooked: false
        });
    }

    const total = sumCents(items.map((item) => item.total));

    // Mitgliedsnamen in einer Abfrage auflösen.
    const memberDocs = await db
        .collection("members")
        .find({ _id: { $in: input.memberIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } })
        .toArray();

    const nameById = new Map(
        memberDocs.map((doc) => [
            String(doc._id),
            fullName(doc as { firstname?: string; lastname?: string })
        ])
    );

    const members = input.memberIds.map((id) => ({
        id,
        name: nameById.get(id) ?? "Unbekannt"
    }));

    const now = new Date();
    const doc: OrderDoc = {
        number: generateOrderNumber(),
        items,
        members,
        memberIds: members.map((member) => member.id),
        invoiceIds: [],
        total,
        status: "ordered",
        paymentStatus: "open",
        cancelledAt: null,
        createdBy: input.createdBy,
        createdByName: input.createdByName,
        createdAt: now
    };

    const inserted = await orders().insertOne(doc);
    const orderId = inserted.insertedId;

    // Rechnungen anlegen. Fehlt ein aktives Geschäftsjahr, schlägt das jetzt
    // sichtbar fehl -- vorher entstand still eine Bestellung, die niemand
    // jemals bezahlen musste.
    let invoiceIds: string[];
    try {
        invoiceIds = await createInvoicesForOrder({
            orderId,
            orderNumber: doc.number,
            members,
            total,
            createdBy: input.createdBy,
            itemSummary: items
                .map((item) => `${item.quantity}x ${item.name}${item.size ? ` (${item.size})` : ""}`)
                .join(", ")
        });
    } catch (err) {
        await orders().deleteOne({ _id: orderId });

        if (err instanceof NoActiveFiscalYearError) {
            return {
                ok: false,
                error: "Es ist kein aktives Geschäftsjahr vorhanden. Bitte zuerst eines anlegen."
            };
        }
        throw err;
    }

    await orders().updateOne({ _id: orderId }, { $set: { invoiceIds, updatedAt: new Date() } });

    // Lagerabgang buchen, soweit Bestand vorhanden ist. Fehlender Bestand
    // führt zu einem Vermerk statt zu einem negativen Bestand.
    const backorders: string[] = [];
    for (const [index, item] of items.entries()) {
        if (!item.articleId) continue;

        const result = await decrementStock(item.articleId, item.quantity, item.size ?? null);
        await orders().updateOne(
            { _id: orderId },
            {
                $set: {
                    [`items.${index}.stockBooked`]: result.ok,
                    ...(result.ok ? {} : { [`items.${index}.backorder`]: true })
                }
            }
        );

        if (!result.ok) {
            backorders.push(`${item.name}${item.size ? ` (${item.size})` : ""}`);
        }
    }

    const saved = await orders().findOne({ _id: orderId });
    return {
        ok: true,
        order: saved ? toOrderView(saved) : undefined,
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
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    // Vorher wurde der Formularwert per `as any` ungeprüft gespeichert.
    if (!isOrderStatus(status)) {
        return { ok: false, error: "Unbekannter Bestellstatus." };
    }

    const update: Record<string, unknown> = { status, updatedAt: new Date() };

    if (paymentStatus !== undefined && paymentStatus !== "") {
        if (!isPaymentStatus(paymentStatus)) {
            return { ok: false, error: "Unbekannter Zahlungsstatus." };
        }
        update.paymentStatus = paymentStatus;
    }

    const result = await orders().updateOne({ _id: new ObjectId(id) }, { $set: update });
    return result.matchedCount > 0
        ? { ok: true }
        : { ok: false, error: "Bestellung nicht gefunden." };
}

/**
 * Markiert eine Position als geliefert.
 *
 * Der Index wird jetzt gegen die tatsächliche Länge geprüft. Vorher wurde nur
 * auf "kleiner 0" getestet, sodass ein zu großer Index MongoDB veranlasste,
 * das items-Array mit null-Einträgen aufzufüllen.
 */
export async function setItemReceived(
    orderId: string,
    itemIndex: number,
    received: boolean
): Promise<{ ok: boolean; error?: string; allReceived?: boolean }> {
    if (!ObjectId.isValid(orderId)) return { ok: false, error: "Ungültige Kennung." };

    const id = new ObjectId(orderId);
    const order = await orders().findOne({ _id: id });
    if (!order) return { ok: false, error: "Bestellung nicht gefunden." };

    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= (order.items?.length ?? 0)) {
        return { ok: false, error: "Diese Position gibt es nicht." };
    }

    await orders().updateOne(
        { _id: id },
        { $set: { [`items.${itemIndex}.received`]: received, updatedAt: new Date() } }
    );

    const updated = await orders().findOne({ _id: id });
    const allReceived = (updated?.items ?? []).every((item) => item.received);

    // Nur der Lieferstatus wird angepasst -- der Zahlungsstatus bleibt
    // unberührt und umgekehrt.
    if (allReceived && updated?.status !== "delivered" && !updated?.cancelledAt) {
        await orders().updateOne({ _id: id }, { $set: { status: "delivered", updatedAt: new Date() } });
    } else if (!allReceived && updated?.status === "delivered") {
        await orders().updateOne({ _id: id }, { $set: { status: "processing", updatedAt: new Date() } });
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
    if (!ObjectId.isValid(id)) return { ok: false, error: "Ungültige Kennung." };

    const orderId = new ObjectId(id);
    const order = await orders().findOne({ _id: orderId });
    if (!order) return { ok: false, error: "Bestellung nicht gefunden." };
    if (order.cancelledAt) return { ok: false, error: "Diese Bestellung ist bereits storniert." };

    let restored = 0;
    for (const item of order.items ?? []) {
        // Nur zurückbuchen, was tatsächlich abgebucht und noch nicht
        // ausgehändigt wurde.
        if (item.articleId && item.stockBooked && !item.received) {
            await incrementStock(item.articleId, item.quantity, item.size ?? null);
            restored += 1;
        }
    }

    await cancelOrderBilling(orderId, user);

    await orders().updateOne(
        { _id: orderId },
        { $set: { status: "cancelled" as OrderStatus, cancelledAt: new Date(), updatedAt: new Date() } }
    );

    return { ok: true, restored };
}
