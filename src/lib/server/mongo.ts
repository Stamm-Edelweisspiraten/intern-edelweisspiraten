import { MongoClient } from "mongodb";
import { MONGODB_URI } from "$env/static/private";

if (!MONGODB_URI) {
    throw new Error("❌ MONGODB_URI fehlt in .env");
}

const client = new MongoClient(MONGODB_URI);

let clientPromise: Promise<MongoClient>;

if (import.meta.env.PROD) {
    clientPromise = client.connect();
} else {
    if (!(globalThis as any)._mongoClientPromise) {
        (globalThis as any)._mongoClientPromise = client.connect();
    }
    clientPromise = (globalThis as any)._mongoClientPromise;
}

export const mongoClient = await clientPromise;

export const db = mongoClient.db("intern-test");
