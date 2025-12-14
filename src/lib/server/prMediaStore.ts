import { GridFSBucket, ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";

export type MediaKind = "cover" | "action";

export interface PRMediaMeta {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    kind: MediaKind;
    articleId?: string;
}

function getBucket() {
    if (!db) {
        throw new Error("MONGODB_URI ist nicht konfiguriert");
    }
    return new GridFSBucket(db, { bucketName: "pr_media" });
}

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function isFile(input: any): input is File {
    return input && typeof input === "object" && typeof input.arrayBuffer === "function";
}

export async function saveArticleImage(
    file: unknown,
    articleId: string,
    kind: MediaKind,
    previousId?: string
): Promise<PRMediaMeta | undefined> {
    if (!isFile(file) || file.size === 0) return undefined;

    if (file.size > MAX_BYTES) {
        throw new Error("Datei zu groغ (max 12 MB)");
    }

    const contentType = ALLOWED_TYPES.includes(file.type) ? file.type : "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadStream = getBucket().openUploadStream(file.name || `${kind}-${Date.now()}.bin`, {
        contentType,
        metadata: { articleId, kind }
    });

    await new Promise<void>((resolve, reject) => {
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => resolve());
        uploadStream.end(buffer);
    });

    if (previousId) {
        try {
            await getBucket().delete(new ObjectId(previousId));
        } catch (err) {
            console.warn("Konnte altes PR-Bild nicht lغschen", previousId, err);
        }
    }

    return {
        id: uploadStream.id.toString(),
        filename: uploadStream.filename,
        contentType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        kind,
        articleId
    };
}

export async function getArticleImage(id: string) {
    const files = await getBucket().find({ _id: new ObjectId(id) }).toArray();
    const file = files[0];
    if (!file) return null;

    const stream = getBucket().openDownloadStream(new ObjectId(id));
    return { file, stream };
}

export async function deleteArticleImage(id?: string) {
    if (!id) return;
    try {
        await getBucket().delete(new ObjectId(id));
    } catch (err) {
        console.warn("Konnte PR-Bild nicht lغschen", id, err);
    }
}
