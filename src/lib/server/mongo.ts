import { MongoClient } from "mongodb";
import { env } from "$env/dynamic/private";

const uri = env.MONGODB_URI;

let mongoClient: MongoClient | null = null;
let db: any = null;

if (uri) {
    const client = new MongoClient(uri);
    let clientPromise: Promise<MongoClient>;

    if (import.meta.env.PROD) {
        clientPromise = client.connect();
    } else {
        if (!(globalThis as any)._mongoClientPromise) {
            (globalThis as any)._mongoClientPromise = client.connect();
        }
        clientPromise = (globalThis as any)._mongoClientPromise;
    }

    mongoClient = await clientPromise;
    db = mongoClient.db(env.MONGODB_DB || "intern-test");
} else {
    console.warn("MONGODB_URI ist nicht gesetzt. Datenbankzugriff wird fehlschlagen.");
    db = new Proxy(
        {},
        {
            get() {
                throw new Error("MONGODB_URI ist nicht konfiguriert");
            }
        }
    );
}

export { mongoClient, db };
