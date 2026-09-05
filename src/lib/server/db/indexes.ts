import { db } from "$lib/server/mongo";
import { COLLECTIONS } from "$lib/server/db/collections";

/**
 * Legt die benoetigten Indizes an.
 *
 * Bisher existierte im gesamten Projekt kein einziger Index -- jede Suche nach
 * E-Mail, Mitglied oder Bestellung war ein Collection-Scan, und es gab nichts,
 * was doppelte Benutzer oder doppelte Geschaeftsjahre verhindert haette.
 *
 * Wird einmalig beim Start aus hooks.server.ts aufgerufen und ist idempotent.
 */

let ensured: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
    if (!ensured) {
        ensured = createIndexes().catch((err) => {
            // Ein fehlgeschlagener Indexaufbau darf den Start nicht verhindern,
            // muss aber sichtbar sein.
            console.error("Indizes konnten nicht angelegt werden:", err);
            ensured = null;
        });
    }
    return ensured;
}

interface IndexSpec {
    collection: string;
    keys: Record<string, 1 | -1>;
    options: Record<string, unknown>;
}

async function createIndexes(): Promise<void> {
    const specs: IndexSpec[] = [
        // --- Benutzer / Auth ---------------------------------------------
        { collection: COLLECTIONS.users, keys: { email: 1 }, options: { unique: true, name: "users_email_unique" } },
        { collection: COLLECTIONS.users, keys: { memberIds: 1 }, options: { name: "users_memberIds" } },
        { collection: COLLECTIONS.sessions, keys: { tokenHash: 1 }, options: { unique: true, name: "sessions_token_unique" } },
        { collection: COLLECTIONS.sessions, keys: { userId: 1 }, options: { name: "sessions_userId" } },
        // TTL: abgelaufene Sitzungen raeumt MongoDB selbst weg.
        { collection: COLLECTIONS.sessions, keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: "sessions_ttl" } },
        { collection: COLLECTIONS.roles, keys: { key: 1 }, options: { unique: true, name: "roles_key_unique" } },
        { collection: COLLECTIONS.passwordResetTokens, keys: { tokenHash: 1 }, options: { unique: true, name: "reset_token_unique" } },
        { collection: COLLECTIONS.passwordResetTokens, keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: "reset_token_ttl" } },
        { collection: COLLECTIONS.loginAttempts, keys: { key: 1 }, options: { unique: true, name: "login_attempts_key_unique" } },
        { collection: COLLECTIONS.loginAttempts, keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: "login_attempts_ttl" } },

        // --- Mitglieder ---------------------------------------------------
        { collection: COLLECTIONS.members, keys: { "emails.email": 1 }, options: { name: "members_email" } },
        { collection: COLLECTIONS.members, keys: { groups: 1 }, options: { name: "members_groups" } },
        { collection: COLLECTIONS.members, keys: { lastname: 1, firstname: 1 }, options: { name: "members_name" } },
        { collection: COLLECTIONS.memberLogs, keys: { memberId: 1, createdAt: -1 }, options: { name: "member_logs_member" } },
        { collection: COLLECTIONS.positions, keys: { type: 1, memberIds: 1 }, options: { name: "positions_type_members" } },

        // --- Finanzen -----------------------------------------------------
        // Ein Geschaeftsjahr pro Jahreszahl -- verhindert die bisher moeglichen
        // Doppelanlagen mit widerspruechlichen Beitraegen.
        { collection: COLLECTIONS.fiscalYears, keys: { year: 1 }, options: { unique: true, name: "fiscal_years_year_unique" } },
        { collection: COLLECTIONS.fiscalYears, keys: { status: 1, year: -1 }, options: { name: "fiscal_years_status" } },
        { collection: COLLECTIONS.fiscalInvoices, keys: { fiscalYearId: 1, status: 1 }, options: { name: "invoices_year_status" } },
        { collection: COLLECTIONS.fiscalInvoices, keys: { memberId: 1 }, options: { name: "invoices_member" } },
        { collection: COLLECTIONS.fiscalInvoices, keys: { orderId: 1 }, options: { name: "invoices_order", sparse: true } },
        // Verhindert die doppelten Jahresbeitraege, die durch das Seeding im
        // load entstanden sind: pro Jahr, Mitglied und Art hoechstens eine
        // Rechnung.
        { collection: COLLECTIONS.fiscalInvoices, keys: { fiscalYearId: 1, memberId: 1, kind: 1 }, options: {
                unique: true,
                name: "invoices_year_member_kind_unique",
                partialFilterExpression: { memberId: { $type: "string" } }
            } },
        { collection: COLLECTIONS.fiscalTransactions, keys: { fiscalYearId: 1, date: -1 }, options: { name: "transactions_year_date" } },
        { collection: COLLECTIONS.fiscalTransactions, keys: { invoiceId: 1 }, options: { name: "transactions_invoice", sparse: true } },
        { collection: COLLECTIONS.fiscalTransactions, keys: { memberId: 1 }, options: { name: "transactions_member" } },
        { collection: COLLECTIONS.financeLogs, keys: { fiscalYearId: 1, createdAt: -1 }, options: { name: "finance_logs_year" } },

        // --- Kaemmerer ----------------------------------------------------
        { collection: COLLECTIONS.kaemmererArticles, keys: { active: 1, name: 1 }, options: { name: "articles_active_name" } },
        { collection: COLLECTIONS.kaemmererOrders, keys: { number: 1 }, options: { unique: true, name: "orders_number_unique" } },
        { collection: COLLECTIONS.kaemmererOrders, keys: { memberIds: 1, createdAt: -1 }, options: { name: "orders_members" } },
        { collection: COLLECTIONS.kaemmererOrders, keys: { status: 1, createdAt: -1 }, options: { name: "orders_status" } }
    ];

    // Jeden Index einzeln anlegen: ein fehlschlagender Index (z.B. eine
    // Unique-Bedingung, die vorhandene Daten verletzen) darf die uebrigen
    // nicht verhindern.
    const results = await Promise.allSettled(
        specs.map((spec) =>
            db.collection(spec.collection).createIndex(spec.keys as never, spec.options as never)
        )
    );

    results.forEach((result, i) => {
        if (result.status === "rejected") {
            const spec = specs[i];
            const label = spec.options.name ?? JSON.stringify(spec.keys);
            console.error(
                `Index ${label} auf ${spec.collection} konnte nicht angelegt werden:`,
                (result.reason as Error)?.message ?? result.reason
            );
        }
    });
}
