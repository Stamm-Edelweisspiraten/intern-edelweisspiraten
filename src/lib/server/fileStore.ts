import { GridFSBucket, ObjectId } from "mongodb";
import { db } from "$lib/server/mongo";

type MemberFileKind = "consent" | "application";

export interface StoredFileMeta {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    kind: MemberFileKind;
    memberId: string;
}

const bucket = new GridFSBucket(db, { bucketName: "member_uploads" });

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

function isFile(input: any): input is File {
    return input && typeof input === "object" && typeof input.arrayBuffer === "function";
}

export async function saveMemberFile(
    file: unknown,
    memberId: string,
    kind: MemberFileKind,
    previousId?: string
): Promise<StoredFileMeta | undefined> {

    if (!isFile(file) || file.size === 0) return undefined;

    if (file.size > MAX_BYTES) {
        throw new Error("Datei zu groß (max 10MB)");
    }

    const contentType = ALLOWED_TYPES.includes(file.type) ? file.type : "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadStream = bucket.openUploadStream(file.name || `${kind}-${Date.now()}.bin`, {
        contentType,
        metadata: {
            memberId,
            kind
        }
    });

    await new Promise<void>((resolve, reject) => {
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => resolve());
        uploadStream.end(buffer);
    });

    // Vorherige Datei entfernen, falls vorhanden
    if (previousId) {
        try {
            await bucket.delete(new ObjectId(previousId));
        } catch (err) {
            console.warn("Konnte alte Datei nicht löschen", previousId, err);
        }
    }

    return {
        id: uploadStream.id.toString(),
        filename: uploadStream.filename,
        contentType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        kind,
        memberId
    };
}

export async function getMemberFile(id: string) {
    const files = await bucket.find({ _id: new ObjectId(id) }).toArray();
    const file = files[0];
    if (!file) return null;

    const stream = bucket.openDownloadStream(new ObjectId(id));
    return { file, stream };
}

export async function deleteMemberFile(id?: string) {
    if (!id) return;
    try {
        await bucket.delete(new ObjectId(id));
    } catch (err) {
        console.warn("Konnte Datei nicht löschen", id, err);
    }
}
