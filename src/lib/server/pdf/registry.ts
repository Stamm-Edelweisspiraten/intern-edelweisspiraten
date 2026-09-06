import { z } from "zod";
import { createDocument, formatPdfDate, PDF_COLORS, PDF_FONTS } from "./layout";
import { formatEuro, type Cents } from "$lib/money";
import { toCalendarDate } from "$lib/server/db/dates";
import { getMember, getAllMembers, getMembersByGroupIds } from "$lib/server/memberService";
import { getGroup, getAllGroups } from "$lib/server/groupService";
import { getInvoice, computeOutstanding } from "$lib/server/finance/invoiceService";
import { getFinanceSettings } from "$lib/server/settingsService";
import {
    accountLedger,
    agingReport,
    balanceSheet,
    cashBook,
    profitAndLoss
} from "$lib/server/finance/reportService";
import { getEvent, listResponses } from "$lib/server/eventService";
import { createInvitePdf } from "./invitePdf";
import { createPaymentNoticePdf } from "./paymentNoticePdf";

/**
 * Zentrale Stelle für alle PDFs.
 *
 * Jede Vorlage trägt ihren Namen, das benötigte Recht, ein zod-Schema ihrer
 * Eingabe und die Erzeugerfunktion. Damit gibt es
 *
 *   - **eine** Rechteprüfung statt drei verschiedener Muster (bisher zweimal
 *     von Hand, einmal über requirePermission),
 *   - eine Selbstbeschreibung für die REST-API (`GET /api/v1/pdf`),
 *   - ein gemeinsames Gerüst für Kopf, Fußzeile und Tabellen.
 *
 * Die drei bestehenden Adressen unter /intern bleiben als bequeme Wege
 * erhalten, rufen aber die Registry auf.
 */

export interface PdfTemplate<Input = unknown> {
    name: string;
    title: string;
    description: string;
    /** Ohne dieses Recht wird der Aufruf abgewiesen. */
    permission: string;
    schema: z.ZodType<Input>;
    /** Der Dateiname, den der Browser vorschlägt. */
    filename: (input: Input) => string;
    render: (input: Input) => Promise<Buffer>;
}

/** Wird geworfen, wenn die Eingabe auf nichts Vorhandenes zeigt. */
export class PdfNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PdfNotFoundError";
    }
}

const uuid = z.string().uuid("Bitte eine gültige Kennung angeben.");

/** Ein Kalendertag als JJJJ-MM-TT. */
const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum im Format JJJJ-MM-TT angeben.");

function euro(amount: Cents): string {
    return formatEuro(amount);
}

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

/**
 * Der Beitrittslink im QR-Code braucht eine Grundadresse. Ohne
 * PUBLIC_APP_URL fiel die Vorlage frueher auf "http://localhost:5173" zurueck
 * -- der Ausdruck sah richtig aus, der QR-Code fuehrte ins Leere. Die
 * aufrufende Route reicht deshalb den Ursprung der Anfrage durch.
 */
const inviteSchema = z.object({
    memberId: uuid,
    baseUrl: z.string().url("Bitte eine gültige Adresse angeben.").optional()
});

const memberListSchema = z.object({
    /** Ohne Angabe alle Gruppen. */
    groupIds: z.array(uuid).optional(),
    status: z.enum(["aktiv", "passiv", "gekündigt"]).optional(),
    includeContact: z.boolean().optional()
});

const groupMembersSchema = z.object({ groupId: uuid });

// ---------------------------------------------------------------------------
// Kasse
// ---------------------------------------------------------------------------

const paymentNoticeSchema = z.object({
    memberId: uuid,
    /** Ohne Angabe das aktive Geschäftsjahr. */
    fiscalYearId: uuid.optional(),
    subject: z.string().max(200).optional(),
    message: z.string().max(4000).optional()
});

const invoiceSchema = z.object({ invoiceId: uuid });

const reminderSchema = z.object({
    invoiceId: uuid,
    message: z.string().max(4000).optional()
});

const financeReportSchema = z.object({
    kind: z.enum(["guv", "bilanz", "kassenbericht", "kontenblatt", "offene-posten"]),
    from: isoDate.optional(),
    to: isoDate.optional(),
    /** Für Kassenbericht und Kontenblatt. */
    accountId: uuid.optional(),
    bankAccountId: uuid.optional()
});

// ---------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------

const eventAttendeesSchema = z.object({ eventId: uuid });

// ---------------------------------------------------------------------------
// Erzeuger
// ---------------------------------------------------------------------------

function memberName(member: {
    firstname: string;
    lastname: string;
    fahrtenname?: string | null;
}): string {
    return member.fahrtenname
        ? `${member.firstname} „${member.fahrtenname}“ ${member.lastname}`
        : `${member.firstname} ${member.lastname}`;
}

async function renderMemberList(input: z.infer<typeof memberListSchema>): Promise<Buffer> {
    const groups = await getAllGroups();
    const groupNames = new Map(groups.map((group) => [group.id, group.name]));

    const members =
        input.groupIds && input.groupIds.length > 0
            ? await getMembersByGroupIds(input.groupIds)
            : await getAllMembers();

    const filtered = input.status
        ? members.filter((member) => member.status === input.status)
        : members;

    const sorted = [...filtered].sort((a, b) =>
        (a.lastname || "").localeCompare(b.lastname || "", "de")
    );

    const scope =
        input.groupIds && input.groupIds.length > 0
            ? input.groupIds.map((id) => groupNames.get(id) ?? "Unbekannt").join(", ")
            : "Alle Gruppen";

    const builder = await createDocument({
        title: "Mitgliederliste",
        subtitle: `${scope}${input.status ? ` · Status: ${input.status}` : ""}`,
        landscape: input.includeContact === true,
        footnote: `Mitgliederliste · Stand ${formatPdfDate()}`
    });

    const columns = input.includeContact
        ? [
              { header: "Name", width: 24 },
              { header: "Gruppe", width: 16 },
              { header: "Geburtstag", width: 12 },
              { header: "Stufe", width: 12 },
              { header: "E-Mail", width: 22 },
              { header: "Telefon", width: 14 }
          ]
        : [
              { header: "Name", width: 34 },
              { header: "Gruppe", width: 24 },
              { header: "Geburtstag", width: 16 },
              { header: "Stufe", width: 14 },
              { header: "Status", width: 12 }
          ];

    builder.table({
        columns,
        rows: sorted.map((member) => {
            const groupLabel = (member.groups ?? [])
                .map((id) => groupNames.get(id) ?? "")
                .filter(Boolean)
                .join(", ");

            return input.includeContact
                ? [
                      memberName(member),
                      groupLabel,
                      member.birthday ? formatPdfDate(member.birthday) : "",
                      member.stand ?? "",
                      member.emails?.[0]?.email ?? "",
                      member.numbers?.[0]?.number ?? ""
                  ]
                : [
                      memberName(member),
                      groupLabel,
                      member.birthday ? formatPdfDate(member.birthday) : "",
                      member.stand ?? "",
                      member.status ?? ""
                  ];
        }),
        empty: "Keine Mitglieder gefunden."
    });

    builder.paragraph(`${sorted.length} Mitglieder`, { color: PDF_COLORS.subtle });

    return builder.finish();
}

async function renderGroupMembers(input: z.infer<typeof groupMembersSchema>): Promise<Buffer> {
    const group = await getGroup(input.groupId);
    if (!group) throw new PdfNotFoundError("Die Gruppe wurde nicht gefunden.");

    const members = await getMembersByGroupIds([input.groupId]);
    const sorted = [...members].sort((a, b) =>
        (a.lastname || "").localeCompare(b.lastname || "", "de")
    );

    const builder = await createDocument({
        title: `Gruppe ${group.name}`,
        subtitle: [group.type, group.meeting_time].filter(Boolean).join(" · "),
        landscape: true,
        footnote: `Gruppenliste ${group.name} · Stand ${formatPdfDate()}`
    });

    if (group.description) builder.paragraph(group.description, { color: PDF_COLORS.muted });

    builder.table({
        columns: [
            { header: "Name", width: 22 },
            { header: "Adresse", width: 28 },
            { header: "E-Mail", width: 26 },
            { header: "Telefon", width: 24 }
        ],
        rows: sorted.map((member) => [
            memberName(member),
            [member.address?.street, `${member.address?.zip ?? ""} ${member.address?.city ?? ""}`]
                .map((part) => part?.trim())
                .filter(Boolean)
                .join(", "),
            (member.emails ?? []).map((entry) => entry.email).filter(Boolean).join("\n"),
            (member.numbers ?? []).map((entry) => entry.number).filter(Boolean).join("\n")
        ]),
        empty: "In dieser Gruppe ist noch niemand."
    });

    builder.paragraph(`${sorted.length} Mitglieder`, { color: PDF_COLORS.subtle });

    return builder.finish();
}

async function renderInvoice(input: z.infer<typeof invoiceSchema>): Promise<Buffer> {
    const invoice = await getInvoice(input.invoiceId);
    if (!invoice) throw new PdfNotFoundError("Die Rechnung wurde nicht gefunden.");

    const finance = await getFinanceSettings();

    const builder = await createDocument({
        title: `Rechnung ${invoice.number ?? ""}`.trim(),
        subtitle: invoice.member ?? undefined,
        footnote: `Rechnung ${invoice.number ?? ""} · ${formatPdfDate()}`
    });

    builder.keyValues([
        { label: "Rechnungsnummer", value: invoice.number ?? "–" },
        { label: "Datum", value: formatPdfDate(invoice.date) },
        { label: "Fällig am", value: invoice.dueDate ? formatPdfDate(invoice.dueDate) : "–" },
        { label: "Empfänger", value: invoice.member ?? "–" },
        { label: "Verwendungszweck", value: invoice.note || invoice.kind || "–" }
    ]);

    builder.table({
        columns: [
            { header: "Position", width: 60 },
            { header: "Betrag", width: 40, align: "right" }
        ],
        rows: [[invoice.note || invoice.kind || "Forderung", euro(invoice.amount)]],
        total: ["Gesamtbetrag", euro(invoice.amount)]
    });

    if (invoice.paidAmount > 0) {
        builder.table({
            columns: [
                { header: "", width: 60 },
                { header: "", width: 40, align: "right" }
            ],
            rows: [
                ["Bereits gezahlt", euro(invoice.paidAmount)],
                ["Offener Betrag", euro(invoice.outstanding)]
            ]
        });
    }

    if (finance.bank.iban) {
        builder.heading("Bankverbindung", { size: 11 });
        builder.keyValues([
            { label: "Kontoinhaber", value: finance.bank.accountHolder },
            { label: "IBAN", value: finance.bank.iban },
            { label: "BIC", value: finance.bank.bic },
            { label: "Bank", value: finance.bank.bankName },
            { label: "Verwendungszweck", value: invoice.number ?? "" }
        ]);
    }

    return builder.finish();
}

async function renderReminder(input: z.infer<typeof reminderSchema>): Promise<Buffer> {
    const invoice = await getInvoice(input.invoiceId);
    if (!invoice) throw new PdfNotFoundError("Die Rechnung wurde nicht gefunden.");

    const finance = await getFinanceSettings();

    const builder = await createDocument({
        title: "Zahlungserinnerung",
        subtitle: invoice.member ?? undefined,
        footnote: `Zahlungserinnerung zu ${invoice.number ?? ""} · ${formatPdfDate()}`
    });

    builder.paragraph(
        input.message?.trim() ||
            "vermutlich ist es untergegangen: Der unten aufgeführte Betrag ist noch offen. " +
                "Bitte gleiche ihn in den nächsten vierzehn Tagen aus. Sollte sich die " +
                "Zahlung überschnitten haben, betrachte diese Erinnerung als gegenstandslos."
    );

    builder.table({
        columns: [
            { header: "Rechnung", width: 24 },
            { header: "Datum", width: 16 },
            { header: "Fällig", width: 16 },
            { header: "Betrag", width: 22, align: "right" },
            { header: "Offen", width: 22, align: "right" }
        ],
        rows: [
            [
                invoice.number ?? "–",
                formatPdfDate(invoice.date),
                invoice.dueDate ? formatPdfDate(invoice.dueDate) : "–",
                euro(invoice.amount),
                euro(invoice.outstanding)
            ]
        ],
        total: ["Offener Betrag", "", "", "", euro(invoice.outstanding)]
    });

    if (finance.bank.iban) {
        builder.heading("Bankverbindung", { size: 11 });
        builder.keyValues([
            { label: "Kontoinhaber", value: finance.bank.accountHolder },
            { label: "IBAN", value: finance.bank.iban },
            { label: "BIC", value: finance.bank.bic },
            { label: "Verwendungszweck", value: invoice.number ?? "" }
        ]);
    }

    return builder.finish();
}

async function renderFinanceReport(
    input: z.infer<typeof financeReportSchema>
): Promise<Buffer> {
    const year = new Date().getFullYear();

    /**
     * Der Zeitraum kommt als JJJJ-MM-TT herein. `new Date("2026-01-01")`
     * liest das bereits als UTC-Mitternacht; toCalendarDate() haelt die
     * Behandlung trotzdem einheitlich mit dem Rest der Kasse.
     */
    const parseDay = (value: string): Date | null => {
        const [y, m, d] = value.split("-").map(Number);
        const date = new Date(y, (m ?? 1) - 1, d ?? 1);
        return Number.isNaN(date.getTime()) ? null : toCalendarDate(date);
    };

    const from = parseDay(input.from ?? `${year}-01-01`);
    const to = parseDay(input.to ?? `${year}-12-31`);

    if (!from || !to) throw new PdfNotFoundError("Der Zeitraum ist ungültig.");

    const period = `${formatPdfDate(from)} – ${formatPdfDate(to)}`;

    if (input.kind === "guv") {
        const report = await profitAndLoss(from, to);
        const builder = await createDocument({
            title: "Gewinn- und Verlustrechnung",
            subtitle: period,
            footnote: `GuV ${period}`
        });

        builder.heading("Erträge");
        builder.table({
            columns: [
                { header: "Konto", width: 14 },
                { header: "Bezeichnung", width: 60 },
                { header: "Betrag", width: 26, align: "right" }
            ],
            rows: report.income.map((row) => [row.number, row.name, euro(row.amount)]),
            total: ["", "Summe Erträge", euro(report.incomeTotal)],
            empty: "Keine Erträge im Zeitraum."
        });

        builder.heading("Aufwendungen");
        builder.table({
            columns: [
                { header: "Konto", width: 14 },
                { header: "Bezeichnung", width: 60 },
                { header: "Betrag", width: 26, align: "right" }
            ],
            rows: report.expense.map((row) => [row.number, row.name, euro(row.amount)]),
            total: ["", "Summe Aufwendungen", euro(report.expenseTotal)],
            empty: "Keine Aufwendungen im Zeitraum."
        });

        builder.heading("Ergebnis nach steuerlichen Bereichen");
        builder.table({
            columns: [
                { header: "Bereich", width: 40 },
                { header: "Erträge", width: 20, align: "right" },
                { header: "Aufwendungen", width: 20, align: "right" },
                { header: "Ergebnis", width: 20, align: "right" }
            ],
            rows: report.bySphere.map((row) => [
                SPHERE_LABELS[row.sphere] ?? row.sphere,
                euro(row.income),
                euro(row.expense),
                euro(row.result)
            ]),
            total: [
                "Gesamtergebnis",
                euro(report.incomeTotal),
                euro(report.expenseTotal),
                euro(report.result)
            ]
        });

        return builder.finish();
    }

    if (input.kind === "bilanz") {
        const report = await balanceSheet(to, from);
        const builder = await createDocument({
            title: "Bilanz",
            subtitle: `Stichtag ${formatPdfDate(to)}`,
            footnote: `Bilanz zum ${formatPdfDate(to)}`
        });

        builder.heading("Aktiva");
        builder.table({
            columns: [
                { header: "Konto", width: 14 },
                { header: "Bezeichnung", width: 60 },
                { header: "Betrag", width: 26, align: "right" }
            ],
            rows: report.assets.map((row) => [row.number, row.name, euro(row.amount)]),
            total: ["", "Summe Aktiva", euro(report.assetsTotal)],
            empty: "Keine Aktiva."
        });

        builder.heading("Passiva");
        builder.table({
            columns: [
                { header: "Konto", width: 14 },
                { header: "Bezeichnung", width: 60 },
                { header: "Betrag", width: 26, align: "right" }
            ],
            rows: [
                ...report.liabilities.map((row) => [row.number, row.name, euro(row.amount)]),
                ...report.equity.map((row) => [row.number, row.name, euro(row.amount)]),
                ["", "Jahresergebnis", euro(report.result)]
            ],
            total: [
                "",
                "Summe Passiva",
                euro(report.liabilitiesTotal + report.equityTotal + report.result)
            ]
        });

        return builder.finish();
    }

    if (input.kind === "kassenbericht") {
        if (!input.bankAccountId) {
            throw new PdfNotFoundError("Für den Kassenbericht fehlt das Konto.");
        }

        const report = await cashBook(input.bankAccountId, from, to);
        if (!report) throw new PdfNotFoundError("Das Konto wurde nicht gefunden.");

        const builder = await createDocument({
            title: "Kassenbericht",
            subtitle: `${report.bankAccountName} · ${period}`,
            landscape: true,
            footnote: `Kassenbericht ${report.bankAccountName} · ${period}`
        });

        builder.keyValues([
            { label: "Anfangsbestand", value: euro(report.openingBalance) },
            { label: "Einnahmen", value: euro(report.incomeTotal) },
            { label: "Ausgaben", value: euro(report.expenseTotal) },
            { label: "Endbestand", value: euro(report.closingBalance) }
        ]);

        builder.table({
            columns: [
                { header: "Datum", width: 11 },
                { header: "Beleg", width: 11 },
                { header: "Beschreibung", width: 34 },
                { header: "Gegenkonto", width: 14 },
                { header: "Einnahme", width: 10, align: "right" },
                { header: "Ausgabe", width: 10, align: "right" },
                { header: "Bestand", width: 10, align: "right" }
            ],
            rows: report.entries.map((entry) => [
                formatPdfDate(entry.date),
                entry.entryNo,
                entry.description,
                entry.counterAccount,
                entry.income ? euro(entry.income) : "",
                entry.expense ? euro(entry.expense) : "",
                euro(entry.balance)
            ]),
            total: [
                "",
                "",
                "Summen",
                "",
                euro(report.incomeTotal),
                euro(report.expenseTotal),
                euro(report.closingBalance)
            ],
            empty: "Keine Bewegungen im Zeitraum."
        });

        return builder.finish();
    }

    if (input.kind === "kontenblatt") {
        if (!input.accountId) {
            throw new PdfNotFoundError("Für das Kontenblatt fehlt das Konto.");
        }

        const report = await accountLedger(input.accountId, from, to);
        if (!report) throw new PdfNotFoundError("Das Konto wurde nicht gefunden.");

        const builder = await createDocument({
            title: `Kontenblatt ${report.account.number}`,
            subtitle: `${report.account.name} · ${period}`,
            landscape: true,
            footnote: `Kontenblatt ${report.account.number} · ${period}`
        });

        builder.keyValues([
            { label: "Anfangssaldo", value: euro(report.openingBalance) },
            { label: "Endsaldo", value: euro(report.closingBalance) }
        ]);

        builder.table({
            columns: [
                { header: "Datum", width: 12 },
                { header: "Beleg", width: 12 },
                { header: "Beschreibung", width: 36 },
                { header: "Gegenkonto", width: 14 },
                { header: "Soll", width: 9, align: "right" },
                { header: "Haben", width: 9, align: "right" },
                { header: "Saldo", width: 8, align: "right" }
            ],
            rows: report.entries.map((entry) => [
                formatPdfDate(entry.date),
                entry.entryNo,
                entry.description,
                entry.counterAccount,
                entry.debit ? euro(entry.debit) : "",
                entry.credit ? euro(entry.credit) : "",
                euro(entry.balance)
            ]),
            empty: "Keine Buchungen im Zeitraum."
        });

        return builder.finish();
    }

    // Offene Posten mit Fälligkeitsstaffel.
    const [aging, outstanding] = await Promise.all([agingReport(), computeOutstanding()]);

    const builder = await createDocument({
        title: "Offene Posten",
        subtitle: `Stand ${formatPdfDate(aging.at)}`,
        landscape: true,
        footnote: `Offene Posten · Stand ${formatPdfDate(aging.at)}`
    });

    builder.heading("Fälligkeitsstaffel");
    builder.table({
        columns: [
            { header: "Zeitraum", width: 50 },
            { header: "Anzahl", width: 25, align: "right" },
            { header: "Betrag", width: 25, align: "right" }
        ],
        rows: aging.buckets.map((bucket) => [
            bucket.label,
            String(bucket.count),
            euro(bucket.amount)
        ]),
        total: ["Gesamt", String(aging.count), euro(aging.total)]
    });

    builder.heading("Einzelne Forderungen");
    builder.table({
        columns: [
            { header: "Nummer", width: 13 },
            { header: "Mitglied", width: 26 },
            { header: "Beschreibung", width: 27 },
            { header: "Fällig", width: 12 },
            { header: "Betrag", width: 11, align: "right" },
            { header: "Offen", width: 11, align: "right" }
        ],
        rows: outstanding.map((invoice) => [
            invoice.number ?? "–",
            invoice.member ?? "–",
            invoice.note || invoice.kind,
            invoice.dueDate ? formatPdfDate(invoice.dueDate) : "–",
            euro(invoice.amount),
            euro(invoice.outstanding)
        ]),
        empty: "Es gibt keine offenen Posten."
    });

    return builder.finish();
}

const SPHERE_LABELS: Record<string, string> = {
    ideell: "Ideeller Bereich",
    vermoegen: "Vermögensverwaltung",
    zweckbetrieb: "Zweckbetrieb",
    wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
    neutral: "Neutral"
};

async function renderEventAttendees(
    input: z.infer<typeof eventAttendeesSchema>
): Promise<Buffer> {
    // Die Rechteprüfung liegt beim Aufrufer; hier zählt die Verwaltungssicht,
    // damit die Liste vollständig ist.
    const entry = await getEvent(input.eventId, {}, { manageAll: true });
    if (!entry) throw new PdfNotFoundError("Der Termin wurde nicht gefunden.");

    const responses = await listResponses(entry.id);

    const when = entry.allDay
        ? `${formatPdfDate(entry.startsAt)}, ganztägig`
        : `${formatPdfDate(entry.startsAt)}, ${entry.startsAt.toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit"
          })} Uhr`;

    const builder = await createDocument({
        title: `Teilnehmerliste: ${entry.title}`,
        subtitle: [when, entry.location].filter(Boolean).join(" · "),
        footnote: `${entry.title} · Stand ${formatPdfDate()}`
    });

    builder.keyValues([
        { label: "Zusagen", value: String(entry.counts.yes) },
        { label: "Vielleicht", value: String(entry.counts.maybe) },
        { label: "Absagen", value: String(entry.counts.no) }
    ]);

    const LABELS = { yes: "Zusage", no: "Absage", maybe: "Vielleicht" } as const;

    builder.table({
        columns: [
            { header: "Name", width: 34 },
            { header: "Rückmeldung", width: 16 },
            { header: "Anmerkung", width: 34 },
            { header: "Am", width: 16 }
        ],
        rows: responses.map((response) => [
            response.memberName,
            LABELS[response.response],
            response.note,
            formatPdfDate(response.respondedAt)
        ]),
        empty: "Bisher hat niemand zurückgemeldet."
    });

    /**
     * Eine Spalte zum Abhaken: die Liste wird ausgedruckt und beim Treffpunkt
     * benutzt. Ohne sie müsste jemand mit dem Handy danebenstehen.
     */
    if (responses.some((response) => response.response === "yes")) {
        builder.doc.addPage();
        builder.heading("Anwesenheit");
        builder.paragraph("Zum Abhaken beim Treffpunkt.", { color: PDF_COLORS.subtle });

        builder.table({
            columns: [
                { header: "Name", width: 60 },
                { header: "Da", width: 20, align: "center" },
                { header: "Zurück", width: 20, align: "center" }
            ],
            rows: responses
                .filter((response) => response.response === "yes")
                .map((response) => [response.memberName, "", ""])
        });
    }

    return builder.finish();
}

/**
 * Beitragsbescheid.
 *
 * Die Saetze kommen aus dem GESCHAEFTSJAHR, nicht aus den allgemeinen
 * Einstellungen: ein Bescheid fuer 2025 muss die Saetze von 2025 tragen,
 * auch wenn sie inzwischen erhoeht wurden. calculateMemberDues zieht dabei
 * die Anteile ab, die das Mitglied nicht schuldet -- ein Zweitmitglied zahlt
 * den Stammesbeitrag nur einmal je Familie.
 */
async function renderPaymentNotice(
    input: z.infer<typeof paymentNoticeSchema>
): Promise<Buffer> {
    const { getActiveFiscalYear, getFiscalYear } = await import(
        "$lib/server/finance/yearService"
    );
    const { calculateMemberDues } = await import("$lib/server/finance/dues");
    const { getOrganizationSettings } = await import("$lib/server/settingsService");

    const member = await getMember(input.memberId);
    if (!member) throw new PdfNotFoundError("Das Mitglied wurde nicht gefunden.");

    const year = input.fiscalYearId
        ? await getFiscalYear(input.fiscalYearId)
        : await getActiveFiscalYear();
    if (!year) throw new PdfNotFoundError("Es ist kein Geschäftsjahr vorhanden.");

    const [finance, organization] = await Promise.all([
        getFinanceSettings(),
        getOrganizationSettings()
    ]);

    const dues = calculateMemberDues(year.dues, member);

    const breakdown = [
        { label: "Stammesbeitrag", amount: dues.parts.stamm },
        { label: "Gaubeitrag", amount: dues.parts.gau },
        { label: "Landesmarkbeitrag", amount: dues.parts.landesmark },
        { label: "Bundesbeitrag", amount: dues.parts.bund }
    ].filter((entry) => entry.amount > 0);

    return createPaymentNoticePdf({
        subject: input.subject ?? `Beitragsbescheid für ${memberName(member)}`,
        message:
            input.message ??
            "Bitte überweise den Jahresbeitrag bis zum 31. März auf das unten genannte " +
                "Konto. Bei Fragen wende dich an die Kassenwartung.",
        year: year.year,
        breakdown,
        total: dues.payable,
        organization: organization.name,
        recipient: memberName(member),
        iban: finance.bank.iban,
        bic: finance.bank.bic,
        accountHolder: finance.bank.accountHolder
    });
}

// ---------------------------------------------------------------------------
// Die Vorlagenliste
// ---------------------------------------------------------------------------

/**
 * Bewusst `PdfTemplate<any>`: die Vorlagen haben unterschiedliche
 * Eingabetypen, und eine Liste heterogener Generics lässt sich in TypeScript
 * nicht sinnvoll ausdrücken. Die Typsicherheit steht an der Stelle, an der
 * sie zählt -- `schema.parse()` in `renderPdf`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATES: PdfTemplate<any>[] = [
    {
        name: "invite",
        title: "Einladungsschreiben",
        description: "Einladung mit Zugangslink für ein Mitglied.",
        permission: "members.view",
        schema: inviteSchema,
        filename: (input) => `einladung-${input.memberId}.pdf`,
        render: async (input) => {
            const member = await getMember(input.memberId);
            if (!member) throw new PdfNotFoundError("Das Mitglied wurde nicht gefunden.");

            const { getOrganizationSettings } = await import("$lib/server/settingsService");
            const organization = await getOrganizationSettings();

            return createInvitePdf(
                member,
                { name: organization.name, city: organization.city },
                { baseUrl: input.baseUrl }
            );
        }
    },
    {
        name: "group-members",
        title: "Gruppen-Mitgliederliste",
        description: "Alle Mitglieder einer Gruppe mit Kontaktdaten.",
        permission: "groups.view",
        schema: groupMembersSchema,
        filename: (input) => `gruppe-${input.groupId}-mitglieder.pdf`,
        render: renderGroupMembers
    },
    {
        name: "member-list",
        title: "Mitgliederliste",
        description: "Mitglieder des Stamms, wahlweise nach Gruppe und Status gefiltert.",
        permission: "members.view",
        schema: memberListSchema,
        filename: () => "mitgliederliste.pdf",
        render: renderMemberList
    },
    {
        name: "payment-notice",
        title: "Beitragsbescheid",
        description: "Jahresbeitrag mit Aufschlüsselung und Bankverbindung.",
        permission: "finance.view",
        schema: paymentNoticeSchema,
        filename: (input) => `beitragsbescheid-${input.memberId}.pdf`,
        render: renderPaymentNotice
    },
    {
        name: "invoice",
        title: "Rechnung",
        description: "Einzelrechnung mit Positionen und Bankverbindung.",
        permission: "finance.view",
        schema: invoiceSchema,
        filename: (input) => `rechnung-${input.invoiceId}.pdf`,
        render: renderInvoice
    },
    {
        name: "reminder",
        title: "Mahnung",
        description: "Zahlungserinnerung zu einer offenen Rechnung.",
        permission: "finance.manage",
        schema: reminderSchema,
        filename: (input) => `mahnung-${input.invoiceId}.pdf`,
        render: renderReminder
    },
    {
        name: "finance-report",
        title: "Kassenbericht",
        description:
            "GuV, Bilanz, Kassenbericht, Kontenblatt oder offene Posten für einen Zeitraum.",
        permission: "finance.view",
        schema: financeReportSchema,
        filename: (input) => `${input.kind}.pdf`,
        render: renderFinanceReport
    },
    {
        name: "event-attendees",
        title: "Termin-Teilnehmerliste",
        description: "Rückmeldungen zu einem Termin, mit Liste zum Abhaken.",
        permission: "events.view",
        schema: eventAttendeesSchema,
        filename: (input) => `teilnehmer-${input.eventId}.pdf`,
        render: renderEventAttendees
    }
];

const BY_NAME = new Map(TEMPLATES.map((template) => [template.name, template]));

export function listTemplates(): PdfTemplate[] {
    return TEMPLATES;
}

export function getTemplate(name: string): PdfTemplate | null {
    return BY_NAME.get(name) ?? null;
}

/**
 * Erzeugt ein PDF.
 *
 * Die Rechteprüfung liegt beim Aufrufer -- er kennt seinen Benutzer. Hier
 * wird nur geprüft, dass die Vorlage existiert und die Eingabe passt; die
 * benötigte Berechtigung steht auf der Vorlage und ist über `getTemplate`
 * abrufbar.
 */
export async function renderPdf(
    name: string,
    input: unknown
): Promise<{ buffer: Buffer; filename: string }> {
    const template = getTemplate(name);
    if (!template) throw new PdfNotFoundError(`Unbekannte Vorlage: ${name}`);

    const parsed = template.schema.parse(input ?? {});

    return {
        buffer: await template.render(parsed),
        filename: template.filename(parsed)
    };
}
