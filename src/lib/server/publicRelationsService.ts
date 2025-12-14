import { ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";
import type { PRMediaMeta } from "$lib/server/prMediaStore";

export interface PublicArticle {
    id?: string;
    title: string;
    summary?: string;
    content: string;
    groups: string[];
    coverImage?: PRMediaMeta | null;
    actionImages: PRMediaMeta[];
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
}

function getCollection() {
    return db.collection("pr_articles");
}

function mapArticle(doc: any): PublicArticle {
    return {
        id: doc._id?.toString?.() ?? doc.id,
        title: doc.title ?? "",
        summary: doc.summary ?? "",
        content: doc.content ?? "",
        groups: doc.groups ?? [],
        coverImage: doc.coverImage ?? null,
        actionImages: doc.actionImages ?? [],
        createdAt: doc.createdAt ?? new Date().toISOString(),
        updatedAt: doc.updatedAt ?? doc.createdAt ?? new Date().toISOString(),
        createdBy: doc.createdBy ?? "unbekannt",
        updatedBy: doc.updatedBy ?? doc.createdBy ?? "unbekannt"
    };
}

export async function listArticles(): Promise<PublicArticle[]> {
    const articles = await getCollection()
        .find()
        .sort({ updatedAt: -1 })
        .toArray();

    return articles.map(mapArticle);
}

export async function getArticle(id: string): Promise<PublicArticle | null> {
    const doc = await getCollection().findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return mapArticle(doc);
}

export async function createArticle(payload: {
    title: string;
    summary?: string;
    content: string;
    groups: string[];
    coverImage?: PRMediaMeta | null;
    actionImages?: PRMediaMeta[];
    createdBy: string;
    updatedBy: string;
}): Promise<PublicArticle> {
    const now = new Date().toISOString();

    const doc = {
        title: payload.title,
        summary: payload.summary ?? "",
        content: payload.content,
        groups: payload.groups ?? [],
        coverImage: payload.coverImage ?? null,
        actionImages: payload.actionImages ?? [],
        createdAt: now,
        updatedAt: now,
        createdBy: payload.createdBy,
        updatedBy: payload.updatedBy
    };

    const res = await getCollection().insertOne(doc);

    return {
        ...doc,
        id: res.insertedId.toString()
    };
}

export async function updateArticle(
    id: string,
    updates: Partial<Omit<PublicArticle, "id" | "createdAt">>
): Promise<boolean> {
    const payload: any = {
        ...updates,
        updatedAt: new Date().toISOString()
    };

    await getCollection().updateOne(
        { _id: new ObjectId(id) },
        { $set: payload }
    );

    return true;
}

export async function deleteArticle(id: string) {
    return await getCollection().deleteOne({ _id: new ObjectId(id) });
}
