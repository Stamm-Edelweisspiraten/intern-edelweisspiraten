import { db } from "$lib/server/mongo";
import { ObjectId } from "mongodb";
import { addInvoice, getActiveFiscalYear } from "$lib/server/financeService";

export type KaemmererOrderStatus = "ordered" | "processing" | "delivered" | "paid";
export type KaemmererPaymentStatus = "open" | "paid" | "partial";

export interface KaemmererArticle {
    id?: string;
    name: string;
    description?: string;
    price: number;
    sizes?: { name: string; price: number; stock?: number }[];
    stock?: number;
    minStock?: number;
    active?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface KaemmererOrderItem {
    articleId?: string;
    name: string;
    price: number;
    size?: string;
    quantity: number;
    total: number;
}

export interface KaemmererOrderMember {
    id: string;
    name: string;
}

export interface KaemmererOrder {
    id?: string;
    number: string;
    items: KaemmererOrderItem[];
    members: KaemmererOrderMember[];
    memberIds: string[];
    invoiceIds?: string[];
    total: number;
    status: KaemmererOrderStatus;
    paymentStatus: KaemmererPaymentStatus;
    createdBy?: string;
    createdByName?: string;
    createdAt?: string;
    updatedAt?: string;
}

const ARTICLE_COLLECTION = "kaemmerer_articles";
const ORDER_COLLECTION = "kaemmerer_orders";

const mapArticleDoc = (doc: any): KaemmererArticle => ({
    id: doc._id?.toString?.() ?? doc.id,
    name: doc.name,
    description: doc.description ?? "",
    price: Number(doc.price) || 0,
    sizes: Array.isArray(doc.sizes)
        ? doc.sizes.map((s: any) => ({
            name: s.name ?? "",
            price: Number(s.price) || 0,
            stock: Number(s.stock) || 0
        }))
        : undefined,
    stock: Number(doc.stock) || 0,
    minStock: Number(doc.minStock) || 0,
    active: doc.active ?? true,
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt
});

const mapOrderDoc = (doc: any): KaemmererOrder => ({
    id: doc._id?.toString?.() ?? doc.id,
    number: doc.number,
    items: (doc.items ?? []).map((i: any) => ({
        articleId: i.articleId,
        name: i.name,
        price: Number(i.price) || 0,
        size: i.size,
        quantity: Number(i.quantity) || 0,
        total: Number(i.total) || 0
    })),
    members: doc.members ?? [],
    memberIds: doc.memberIds ?? [],
    invoiceIds: doc.invoiceIds ?? [],
    total: Number(doc.total) || 0,
    status: doc.status ?? "ordered",
    paymentStatus: doc.paymentStatus ?? "open",
    createdBy: doc.createdBy,
    createdByName: doc.createdByName,
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt
});

function nowIso() {
    return new Date().toISOString();
}

function generateOrderNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const short = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ORD-${ts}-${short}`;
}

function normalizeSizes(raw: any): { name: string; price: number; stock?: number }[] | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw)) {
        return raw
            .map((s) => ({ name: s.name ?? "", price: Number(s.price) || 0, stock: Number(s.stock) || 0 }))
            .filter((s) => s.name);
    }

    const parseStringList = (value: string) =>
        value
            .split(/[\n,]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .map((entry) => {
                const [name, rest] = entry.split(/[:=]/).map((p) => p.trim());
                if (!name) return null;
                const [priceRaw, stockRaw] = (rest ?? "").split("|").map((p) => p.trim());
                return { name, price: Number(priceRaw ?? 0) || 0, stock: stockRaw !== undefined ? Number(stockRaw) || 0 : 0 };
            })
            .filter((s): s is { name: string; price: number; stock?: number } => !!s?.name);

    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((s: any) => ({ name: s.name ?? "", price: Number(s.price) || 0 }))
                    .filter((s) => s.name);
            }
        } catch (e) {
            const parsedList = parseStringList(raw);
            return parsedList.length ? parsedList : undefined;
        }

        const parsedList = parseStringList(raw);
        return parsedList.length ? parsedList : undefined;
    }

    return undefined;
}

export async function listArticles(includeInactive = false): Promise<KaemmererArticle[]> {
    const query = includeInactive ? {} : { active: { $ne: false } };
    const docs = await db.collection(ARTICLE_COLLECTION).find(query).sort({ name: 1 }).toArray();
    return docs.map(mapArticleDoc);
}

export async function getArticle(id: string): Promise<KaemmererArticle | null> {
    if (!id) return null;
    const doc = await db.collection(ARTICLE_COLLECTION).findOne({ _id: new ObjectId(id) });
    return doc ? mapArticleDoc(doc) : null;
}

export async function createArticle(payload: {
    name: string;
    description?: string;
    price: number;
    sizes?: { name: string; price: number; stock?: number }[] | string;
    stock?: number;
    minStock?: number;
    active?: boolean;
}): Promise<KaemmererArticle> {
    const now = new Date();
    const normalizedSizes = normalizeSizes(payload.sizes) ?? [];
    const sizeStock = normalizedSizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    const doc = {
        name: payload.name,
        description: payload.description ?? "",
        price: Number(payload.price) || 0,
        sizes: normalizedSizes,
        stock: payload.stock !== undefined ? Number(payload.stock) || 0 : sizeStock,
        minStock: Number(payload.minStock) || 0,
        active: payload.active ?? true,
        createdAt: now,
        updatedAt: now
    };
    const res = await db.collection(ARTICLE_COLLECTION).insertOne(doc);
    return mapArticleDoc({ ...doc, _id: res.insertedId });
}

export async function updateArticle(id: string, data: Partial<KaemmererArticle>): Promise<boolean> {
    const update: Record<string, any> = { updatedAt: new Date() };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.price !== undefined) update.price = Number(data.price) || 0;
    if (data.sizes !== undefined) {
        const normalized = normalizeSizes(data.sizes) ?? [];
        update.sizes = normalized;
        update.stock = normalized.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
    }
    if (data.stock !== undefined) update.stock = Number(data.stock) || 0;
    if (data.minStock !== undefined) update.minStock = Number(data.minStock) || 0;
    if (data.active !== undefined) update.active = data.active;

    const res = await db.collection(ARTICLE_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
    );
    return res.matchedCount > 0;
}

export async function adjustStock(id: string, delta: number, size?: string) {
    const baseUpdate = { $inc: { stock: delta }, $set: { updatedAt: new Date() } };
    if (size) {
        const res = await db.collection(ARTICLE_COLLECTION).updateOne(
            { _id: new ObjectId(id), "sizes.name": size },
            { $inc: { "sizes.$.stock": delta, stock: delta }, $set: { updatedAt: new Date() } }
        );
        if (res.matchedCount > 0) return;
    }

    await db.collection(ARTICLE_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        baseUpdate
    );
}

export async function listOrders(filter: { status?: string; memberId?: string } = {}) {
    const query: any = {};
    if (filter.status) query.status = filter.status;
    if (filter.memberId) query.memberIds = { $in: [filter.memberId] };

    const docs = await db.collection(ORDER_COLLECTION).find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(mapOrderDoc);
}

export async function listOrdersForMembers(memberIds: string[]) {
    if (!memberIds || memberIds.length === 0) return [];
    const docs = await db.collection(ORDER_COLLECTION)
        .find({ memberIds: { $in: memberIds } })
        .sort({ createdAt: -1 })
        .toArray();
    return docs.map(mapOrderDoc);
}

export async function getOrderForUser(orderId: string, user: any): Promise<KaemmererOrder | null> {
    if (!orderId || !user) return null;
    const members = await getAccessibleMembersForUser(user);
    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) return null;

    const doc = await db.collection(ORDER_COLLECTION).findOne({
        _id: new ObjectId(orderId),
        memberIds: { $in: memberIds }
    });

    return doc ? mapOrderDoc(doc) : null;
}

export async function updateOrderStatus(id: string, status: KaemmererOrderStatus, paymentStatus?: KaemmererPaymentStatus) {
    const set: Record<string, any> = { status, updatedAt: new Date() };
    if (paymentStatus) set.paymentStatus = paymentStatus;
    await db.collection(ORDER_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        { $set: set }
    );
}

async function createInvoicesForOrder(order: KaemmererOrder): Promise<string[]> {
    const fiscalYear = await getActiveFiscalYear();
    if (!fiscalYear || !fiscalYear.id) return [];
    const memberCount = order.members.length || 1;
    const perMember = Number((order.total / memberCount).toFixed(2));
    const note = `Bestellung ${order.number}: ${order.items
        .map((i) => `${i.quantity}x ${i.name}${i.size ? ` (${i.size})` : ""}`)
        .join(", ")}`;

    const invoiceIds: string[] = [];

    for (const member of order.members) {
        const invoice = await addInvoice(fiscalYear.id, {
            memberId: member.id,
            member: member.name,
            amount: perMember,
            date: nowIso(),
            kind: "Bestellung",
            note,
            status: "pending",
            orderId: order.id
        });
        if (invoice?.id) invoiceIds.push(invoice.id);
    }

    return invoiceIds;
}

async function reduceStockForItems(items: KaemmererOrderItem[]) {
    for (const item of items) {
        if (item.articleId && item.quantity) {
            await adjustStock(item.articleId, -Math.abs(item.quantity), item.size);
        }
    }
}

export async function createOrder(payload: {
    items: { articleId?: string; name: string; price: number; quantity: number; size?: string }[];
    memberIds: string[];
    memberNames?: string[];
    createdBy?: string;
    createdByName?: string;
}): Promise<KaemmererOrder> {
    const items: KaemmererOrderItem[] = (payload.items ?? [])
        .filter((i) => i && (Number(i.quantity) || 0) > 0)
        .map((i) => ({
            articleId: i.articleId,
            name: i.name,
            price: Number(i.price) || 0,
            quantity: Number(i.quantity) || 0,
            size: i.size,
            total: (Number(i.price) || 0) * (Number(i.quantity) || 0)
        }));

    const memberIds = (payload.memberIds ?? []).filter((id) => !!id);
    const memberObjectIds = memberIds.map((id) => new ObjectId(id));
    const memberDocs = memberObjectIds.length
        ? await db.collection("members").find({ _id: { $in: memberObjectIds } }).toArray()
        : [];
    const memberNameMap = new Map<string, string>(
        memberDocs.map((m: any) => [m._id?.toString?.() ?? m.id, `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt"])
    );

    const members = memberIds.map((id, idx) => ({
        id,
        name: memberNameMap.get(id) ?? payload.memberNames?.[idx] ?? "Unbekannt"
    }));

    const total = items.reduce((sum, i) => sum + i.total, 0);

    const now = new Date();
    const orderNumber = generateOrderNumber();

    const doc = {
        number: orderNumber,
        items,
        members,
        memberIds: members.map((m) => m.id),
        total,
        status: "ordered" as KaemmererOrderStatus,
        paymentStatus: "open" as KaemmererPaymentStatus,
        createdBy: payload.createdBy,
        createdByName: payload.createdByName,
        createdAt: now,
        updatedAt: now
    };

    const res = await db.collection(ORDER_COLLECTION).insertOne(doc);
    const order = mapOrderDoc({ ...doc, _id: res.insertedId });

    const invoiceIds = await createInvoicesForOrder(order);
    if (invoiceIds && invoiceIds.length > 0 && order.id) {
        await db.collection(ORDER_COLLECTION).updateOne(
            { _id: new ObjectId(order.id) },
            { $set: { invoiceIds, updatedAt: new Date() } }
        );
        order.invoiceIds = invoiceIds;
    }
    await reduceStockForItems(items);

    return order;
}

export async function syncOrderPaymentForInvoice(invoiceId: string): Promise<boolean> {
    if (!invoiceId) return false;

    const fiscalYear = await db.collection("fiscal_years")
        .findOne({ "invoices.id": invoiceId }, { projection: { invoices: 1 } });
    if (!fiscalYear?.invoices) return false;

    const invoices = fiscalYear.invoices ?? [];
    const invoice = invoices.find((i: any) => i.id === invoiceId);
    const orderId = invoice?.orderId;
    if (!orderId) return false;

    const relatedInvoices = invoices.filter((i: any) => i.orderId === orderId);
    if (!relatedInvoices.length) return false;

    const allPaid = relatedInvoices.every((i: any) => (i.status ?? "pending") === "paid");
    const anyPaid = relatedInvoices.some((i: any) => (i.status ?? "pending") === "paid");

    const paymentStatus: KaemmererPaymentStatus = allPaid ? "paid" : anyPaid ? "partial" : "open";
    const update: Record<string, any> = {
        paymentStatus,
        updatedAt: new Date()
    };
    if (allPaid) {
        update.status = "paid";
    }

    await db.collection(ORDER_COLLECTION).updateOne(
        { _id: new ObjectId(orderId) },
        {
            $set: update,
            $addToSet: { invoiceIds: { $each: relatedInvoices.map((i: any) => i.id).filter(Boolean) } }
        }
    );

    return true;
}

export async function getAccessibleMembersForUser(user: any) {
    if (!user) return [];
    const email = user?.userinfo?.email;
    const sub = user?.sub;
    const filters: any[] = [];
    if (sub) filters.push({ users: { $in: [sub] } });
    if (email) filters.push({ "emails.email": { $in: [email] } });
    if (filters.length === 0) return [];

    const docs = await db.collection("members").find({ $or: filters }).toArray();
    return docs.map((m) => ({
        id: m._id?.toString?.() ?? m.id,
        name: `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || "Unbekannt"
    }));
}
