import type { RequestHandler } from "./$types";
import { json } from "$lib/server/api/respond";
import { getOrganizationSettings } from "$lib/server/settingsService";
import { listTemplates } from "$lib/server/pdf/registry";

/** Die Vorlagennamen kommen aus der Registry, damit die Beschreibung nicht veraltet. */
const PDF_TEMPLATE_NAMES = listTemplates().map((template) => template.name);

/**
 * Schnittstellenbeschreibung nach OpenAPI 3.1.
 *
 * Oeffentlich erreichbar -- sie beschreibt nur, welche Wege es gibt, nicht
 * welche Daten dahinterstehen. Ein Fremdsystem kann daraus einen Client
 * erzeugen, ohne dass jemand die Endpunkte von Hand abschreibt.
 */

const PROBLEM = {
    type: "object",
    properties: {
        type: { type: "string" },
        title: { type: "string" },
        status: { type: "integer" },
        detail: { type: "string" },
        errors: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } }
    }
};

const META = {
    type: "object",
    properties: {
        page: { type: "integer" },
        per_page: { type: "integer" },
        total: { type: "integer" },
        total_pages: { type: "integer" }
    }
};

/** Antwortpaar, das fast jeder Endpunkt teilt. */
function commonResponses() {
    return {
        "401": {
            description: "Kein oder ungültiges Token.",
            content: { "application/problem+json": { schema: PROBLEM } }
        },
        "403": {
            description: "Das Token hat den nötigen Scope nicht.",
            content: { "application/problem+json": { schema: PROBLEM } }
        },
        "429": {
            description: "Zu viele Anfragen.",
            content: { "application/problem+json": { schema: PROBLEM } }
        }
    };
}

function listOp(summary: string, scope: string, tag: string) {
    return {
        summary,
        tags: [tag],
        description: `Benötigter Scope: \`${scope}\`.`,
        parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "per_page", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } }
        ],
        responses: {
            "200": {
                description: "Liste",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: { data: { type: "array", items: { type: "object" } }, meta: META }
                        }
                    }
                }
            },
            ...commonResponses()
        }
    };
}

function itemOp(summary: string, scope: string, tag: string) {
    return {
        summary,
        tags: [tag],
        description: `Benötigter Scope: \`${scope}\`.`,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
            "200": { description: "Ressource" },
            "404": {
                description: "Nicht gefunden",
                content: { "application/problem+json": { schema: PROBLEM } }
            },
            ...commonResponses()
        }
    };
}

function writeOp(summary: string, scope: string, tag: string, status = "201") {
    return {
        summary,
        tags: [tag],
        description: `Benötigter Scope: \`${scope}\`.`,
        requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } }
        },
        responses: {
            [status]: { description: "Angelegt bzw. geändert" },
            "422": {
                description: "Eingabe nicht verarbeitbar",
                content: { "application/problem+json": { schema: PROBLEM } }
            },
            ...commonResponses()
        }
    };
}

export const GET: RequestHandler = async (event) => {
    const organization = await getOrganizationSettings();

    return json({
        openapi: "3.1.0",
        info: {
            title: `${organization.name} – Interne REST-API`,
            version: "1.0.0",
            description: [
                "Zugriff auf Mitglieder, Gruppen, Kasse und Kämmerer.",
                "",
                "**Beträge sind ganzzahlige Cents.** 12,50 EUR werden als `1250` übermittelt.",
                "**Datumsangaben** folgen ISO 8601 (JJJJ-MM-TT).",
                "**Fehler** kommen als Problem Details nach RFC 9457.",
                "",
                "Ein Token wird unter `/intern/admin/api-tokens` erzeugt. Die Scopes sind",
                "dieselben Berechtigungsschlüssel wie im Portal; ein Token kann nie mehr,",
                "als beim Anlegen ausgewählt wurde."
            ].join("\n")
        },
        servers: [{ url: `${event.url.origin}/api/v1` }],
        components: {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "ep_…" }
            },
            schemas: { Problem: PROBLEM, Meta: META }
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: "Mitglieder" },
            { name: "Gruppen" },
            { name: "Kasse" },
            { name: "Kämmerer" },
            { name: "Berichte" }
        ],
        paths: {
            "/members": {
                get: {
                    ...listOp("Mitglieder auflisten", "members.view", "Mitglieder"),
                    parameters: [
                        { name: "q", in: "query", schema: { type: "string" }, description: "Suchbegriff" },
                        { name: "page", in: "query", schema: { type: "integer" } },
                        { name: "per_page", in: "query", schema: { type: "integer" } }
                    ]
                },
                post: writeOp("Mitglied anlegen", "members.create", "Mitglieder")
            },
            "/members/{id}": {
                get: itemOp("Mitglied lesen", "members.view", "Mitglieder"),
                patch: writeOp("Mitglied ändern", "members.edit", "Mitglieder", "200"),
                delete: itemOp("Mitglied löschen", "members.delete", "Mitglieder")
            },
            "/groups": {
                get: listOp("Gruppen auflisten", "groups.view", "Gruppen"),
                post: writeOp("Gruppe anlegen", "groups.create", "Gruppen")
            },
            "/groups/{id}": {
                get: itemOp("Gruppe lesen (?include=members)", "groups.view", "Gruppen"),
                patch: writeOp("Gruppe ändern", "groups.edit", "Gruppen", "200"),
                delete: itemOp("Gruppe löschen", "groups.delete", "Gruppen")
            },
            "/positions": { get: listOp("Ämter auflisten", "admin.view", "Gruppen") },
            "/users": { get: listOp("Zugänge auflisten", "user.view", "Mitglieder") },
            "/fiscal-years": {
                get: listOp("Geschäftsjahre mit Kennzahlen", "finance.view", "Kasse"),
                post: writeOp("Geschäftsjahr anlegen", "finance.manage", "Kasse")
            },
            "/fiscal-years/{id}": {
                get: itemOp("Geschäftsjahr lesen", "finance.view", "Kasse")
            },
            "/accounts": {
                get: listOp("Kontenplan lesen", "finance.view", "Kasse"),
                post: writeOp("Konto anlegen", "finance.manage", "Kasse")
            },
            "/accounts/{id}": {
                get: itemOp("Konto lesen (?include=ledger)", "finance.view", "Kasse"),
                patch: writeOp("Konto ändern", "finance.manage", "Kasse", "200"),
                delete: itemOp("Konto löschen", "finance.manage", "Kasse")
            },
            "/journal-entries": {
                get: listOp("Buchungssätze auflisten", "finance.view", "Kasse"),
                post: {
                    ...writeOp("Buchungssatz buchen", "finance.manage", "Kasse"),
                    description: [
                        "Benötigter Scope: `finance.manage`.",
                        "",
                        "Soll und Haben müssen übereinstimmen; je Zeile ist genau einer von",
                        "beiden Beträgen größer als 0. Ein unausgeglichener Satz wird",
                        "abgewiesen — von der Prüfung im Dienst und zusätzlich von der",
                        "Datenbank."
                    ].join("\n")
                }
            },
            "/journal-entries/{id}": {
                get: itemOp("Buchungssatz lesen", "finance.view", "Kasse")
            },
            "/journal-entries/{id}/reverse": {
                post: {
                    ...writeOp("Buchungssatz stornieren", "finance.manage", "Kasse"),
                    description:
                        "Benötigter Scope: `finance.manage`. Es gibt bewusst kein DELETE: storniert wird durch einen Gegenbuchungssatz."
                }
            },
            "/invoices": {
                get: listOp("Forderungen auflisten (?status=open)", "finance.view", "Kasse"),
                post: writeOp("Forderung anlegen", "finance.manage", "Kasse")
            },
            "/invoices/{id}": { get: itemOp("Forderung lesen", "finance.view", "Kasse") },
            "/invoices/{id}/payments": {
                get: itemOp("Zahlungen einer Forderung", "finance.view", "Kasse"),
                post: writeOp("Zahlung verbuchen", "finance.manage", "Kasse")
            },
            "/bills": {
                get: listOp("Eingangsrechnungen auflisten", "finance.view", "Kasse"),
                post: writeOp("Eingangsrechnung anlegen", "finance.manage", "Kasse")
            },
            "/bills/{id}": {
                get: itemOp("Eingangsrechnung lesen", "finance.view", "Kasse"),
                post: writeOp("Eingangsrechnung bezahlen", "finance.manage", "Kasse", "200")
            },
            "/bank-accounts": {
                get: listOp("Kassen- und Bankkonten", "finance.view", "Kasse"),
                post: writeOp("Konto anlegen", "finance.manage", "Kasse")
            },
            "/bank-accounts/{id}": { get: itemOp("Konto lesen", "finance.view", "Kasse") },
            "/bank-accounts/{id}/transactions": {
                get: itemOp("Kassenbericht (?from=&to=)", "finance.view", "Kasse")
            },
            "/recurring/run": {
                post: {
                    summary: "Fällige wiederkehrende Buchungen ausführen",
                    tags: ["Kasse"],
                    description:
                        "Benötigter Scope: `finance.manage`. Gedacht für einen Cron von außen; die Anwendung führt den Lauf ohnehin beim Start und stündlich aus.",
                    responses: { "200": { description: "Ergebnis des Laufs" }, ...commonResponses() }
                }
            },
            "/reports/{report}": {
                get: {
                    summary: "Bericht abrufen",
                    tags: ["Berichte"],
                    description:
                        "Benötigter Scope: `finance.view`. Werte für `report`: `profit-and-loss`, `balance-sheet`, `outstanding`.",
                    parameters: [
                        {
                            name: "report",
                            in: "path",
                            required: true,
                            schema: {
                                type: "string",
                                enum: ["profit-and-loss", "balance-sheet", "outstanding"]
                            }
                        },
                        { name: "from", in: "query", schema: { type: "string", format: "date" } },
                        { name: "to", in: "query", schema: { type: "string", format: "date" } },
                        { name: "at", in: "query", schema: { type: "string", format: "date" } }
                    ],
                    responses: { "200": { description: "Bericht" }, ...commonResponses() }
                }
            },
            "/articles": {
                get: listOp("Artikel auflisten", "kaemmerer.articles.manage", "Kämmerer"),
                post: writeOp("Artikel anlegen", "kaemmerer.articles.manage", "Kämmerer")
            },
            "/articles/{id}": {
                get: itemOp("Artikel lesen", "kaemmerer.articles.manage", "Kämmerer"),
                patch: writeOp("Artikel ändern", "kaemmerer.articles.manage", "Kämmerer", "200")
            },
            "/orders": {
                get: listOp("Bestellungen auflisten", "kaemmerer.orders.view", "Kämmerer"),
                post: writeOp("Bestellung anlegen", "kaemmerer.orders.manage", "Kämmerer")
            },
            "/orders/{id}": {
                get: itemOp("Bestellung lesen", "kaemmerer.orders.view", "Kämmerer"),
                patch: writeOp("Status ändern oder stornieren", "kaemmerer.orders.manage", "Kämmerer", "200")
            },
            "/pdf": {
                get: {
                    summary: "PDF-Vorlagen auflisten",
                    tags: ["PDF"],
                    description:
                        "Liefert Name, benötigten Scope und JSON Schema jeder Vorlage. " +
                        "Geliefert wird, was das verwendete Token erzeugen darf; ein " +
                        "eigener Scope wird nicht verlangt.",
                    responses: { "200": { description: "Liste der Vorlagen" }, ...commonResponses() }
                }
            },
            "/pdf/{template}": {
                post: {
                    summary: "PDF erzeugen",
                    tags: ["PDF"],
                    description:
                        "Der benötigte Scope hängt von der Vorlage ab und steht unter " +
                        "`GET /pdf`. Antwort: `application/pdf`. Die Angaben im Rumpf " +
                        "richten sich nach dem Schema der Vorlage; ein leerer Rumpf ist " +
                        "erlaubt, wo alle Felder wahlfrei sind.",
                    parameters: [
                        {
                            name: "template",
                            in: "path",
                            required: true,
                            schema: { type: "string", enum: PDF_TEMPLATE_NAMES }
                        }
                    ],
                    requestBody: {
                        required: false,
                        content: { "application/json": { schema: { type: "object" } } }
                    },
                    responses: {
                        "200": {
                            description: "Das erzeugte Dokument",
                            content: {
                                "application/pdf": {
                                    schema: { type: "string", format: "binary" }
                                }
                            }
                        },
                        ...commonResponses()
                    }
                }
            }
        }
    });
};
