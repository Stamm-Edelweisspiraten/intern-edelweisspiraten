import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema/index";
import {
    CHART_OF_ACCOUNTS,
    DEFAULT_CATEGORIES
} from "../src/lib/server/finance/chartData";

/**
 * Grunddaten von der Kommandozeile: Systemrollen und Kontenrahmen.
 *
 *   npm run db:seed
 *
 * Idempotent -- ein zweiter Lauf aendert nichts.
 *
 * Bewusst OHNE die Anwendungsmodule: die lesen DATABASE_URL ueber
 * $env/dynamic/private, ein Alias, den es ausserhalb von Vite nicht gibt.
 * Schema und Kontenliste sind reine Daten und deshalb hier verwendbar --
 * die Kontenliste existiert dadurch trotzdem nur einmal im Projekt.
 *
 * Demodaten legt der Einrichtungsassistent unter /setup an; sie brauchen die
 * Geschaeftslogik der Dienste (Beitraege, Bestellungen, Buchungen) und lassen
 * sich nicht sinnvoll aus rohen Einfuegungen nachbauen.
 */

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
}

const DEFAULT_ROLES = [
    {
        key: "admin",
        name: "Administration",
        description: "Vollzugriff auf alle Bereiche.",
        permissions: ["*"],
        requireMfa: true
    },
    {
        key: "mitglied",
        name: "Mitglied",
        description: "Zugriff auf den eigenen Bereich und eigene Bestellungen.",
        permissions: [
            "dashboard.view",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create"
        ],
        requireMfa: false
    },
    {
        key: "eltern",
        name: "Eltern",
        description: "Zugriff auf die Daten der eigenen Kinder.",
        permissions: [
            "dashboard.view",
            "kaemmerer.access",
            "kaemmerer.order.view",
            "kaemmerer.order.create"
        ],
        requireMfa: false
    }
];

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

try {
    let createdRoles = 0;
    for (const role of DEFAULT_ROLES) {
        const rows = await db
            .insert(schema.roles)
            .values({ ...role, system: true })
            .onConflictDoNothing({ target: schema.roles.key })
            .returning({ id: schema.roles.id });
        createdRoles += rows.length;
    }
    console.log(`Systemrollen: ${createdRoles} angelegt, ${DEFAULT_ROLES.length - createdRoles} vorhanden.`);

    let createdAccounts = 0;
    for (const account of CHART_OF_ACCOUNTS) {
        const rows = await db
            .insert(schema.accounts)
            .values({
                number: account.number,
                name: account.name,
                type: account.type,
                sphere: account.sphere ?? "ideell",
                isBank: account.isBank ?? false,
                description: account.description ?? "",
                system: true
            })
            .onConflictDoNothing({ target: schema.accounts.number })
            .returning({ id: schema.accounts.id });
        createdAccounts += rows.length;
    }
    console.log(`Kontenrahmen: ${createdAccounts} Konten angelegt.`);

    let createdCategories = 0;
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
        const [account] = await db
            .select({ id: schema.accounts.id })
            .from(schema.accounts)
            .where(eq(schema.accounts.number, category.account))
            .limit(1);
        if (!account) continue;

        const rows = await db
            .insert(schema.bookingCategories)
            .values({
                name: category.name,
                direction: category.direction,
                accountId: account.id,
                sortOrder: index,
                system: true
            })
            .onConflictDoNothing({ target: schema.bookingCategories.name })
            .returning({ id: schema.bookingCategories.id });
        createdCategories += rows.length;
    }
    console.log(`Buchungsarten: ${createdCategories} angelegt.`);

    console.log("Fertig. Demodaten und den ersten Zugang legt /setup an.");
} catch (err) {
    console.error("Seed fehlgeschlagen:", err);
    process.exit(1);
} finally {
    await client.end();
}
