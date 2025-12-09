import { MongoClient } from "mongodb";
import { env } from "$env/dynamic/private";

const uri = env.MONGODB_URI;
if (!uri) {
    throw new Error("MONGODB_URI fehlt in .env");
}

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

export const mongoClient = await clientPromise;

export const db = mongoClient.db("intern-test");
