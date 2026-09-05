import { z } from "zod";

/**
 * Eingabeschemata der REST-API.
 *
 * Bewusst getrennt von den Formular-Aktionen: ein Formular liefert immer
 * Zeichenketten und darf grosszuegig sein, eine API liefert getypte Werte und
 * soll bei unbekannten Feldern lieber sagen, dass sie unbekannt sind.
 *
 * Geldbetraege sind ganzzahlige Cents -- wie ueberall im Projekt. Ein
 * Fliesskommawert waere hier die haeufigste Fehlerquelle, deshalb wird er
 * ausdruecklich abgewiesen.
 */

const cents = z
    .number()
    .int("Beträge sind ganzzahlige Cents, keine Euro mit Nachkommastellen.")
    .positive("Der Betrag muss größer als 0 sein.");

const isoDate = z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Kein gültiges Datum.")
    .transform((value) => new Date(value));

const uuid = z.string().uuid("Keine gültige Kennung.");

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

const memberEmail = z.object({
    label: z.string().default(""),
    email: z.string().email("Keine gültige E-Mail-Adresse.")
});

const memberNumber = z.object({
    label: z.string().default(""),
    number: z.string().min(1)
});

export const memberCreateSchema = z.object({
    firstname: z.string().min(1, "Vorname fehlt."),
    lastname: z.string().min(1, "Nachname fehlt."),
    fahrtenname: z.string().optional(),
    birthday: z.string().optional(),
    address: z
        .object({
            street: z.string().optional(),
            zip: z.string().optional(),
            city: z.string().optional()
        })
        .optional(),
    stand: z.string().optional(),
    status: z.string().optional(),
    entryDate: z.string().optional(),
    isSecondMember: z.boolean().optional(),
    emails: z.array(memberEmail).optional(),
    numbers: z.array(memberNumber).optional(),
    groups: z.array(uuid).optional(),
    contributionDues: z
        .object({
            stamm: z.boolean().optional(),
            gau: z.boolean().optional(),
            landesmark: z.boolean().optional(),
            bund: z.boolean().optional()
        })
        .optional(),
    mediaConsent: z
        .object({
            socialMedia: z.boolean().optional(),
            website: z.boolean().optional(),
            print: z.boolean().optional()
        })
        .optional()
});

export const memberUpdateSchema = memberCreateSchema.partial();

// ---------------------------------------------------------------------------
// Gruppen und Aemter
// ---------------------------------------------------------------------------

export const groupCreateSchema = z.object({
    name: z.string().min(1, "Name fehlt."),
    type: z.enum(["sippe", "meute"]),
    meeting_time: z.string().default(""),
    description: z.string().optional(),
    replyTo: z.string().optional()
});

export const groupUpdateSchema = groupCreateSchema.partial();

// ---------------------------------------------------------------------------
// Kasse
// ---------------------------------------------------------------------------

export const fiscalYearCreateSchema = z.object({
    year: z.number().int().min(2000).max(2100),
    dues: z.object({
        stamm: z.number().int().nonnegative(),
        gau: z.number().int().nonnegative(),
        landesmark: z.number().int().nonnegative(),
        bund: z.number().int().nonnegative()
    }),
    openingBalance: z.number().int().optional()
});

export const accountCreateSchema = z.object({
    number: z.string().regex(/^\d{3,6}$/, "Die Kontonummer besteht aus 3 bis 6 Ziffern."),
    name: z.string().min(1, "Name fehlt."),
    type: z.enum(["asset", "liability", "equity", "income", "expense"]),
    sphere: z
        .enum(["ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich", "neutral"])
        .optional(),
    description: z.string().optional()
});

export const accountUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    sphere: z
        .enum(["ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich", "neutral"])
        .optional(),
    description: z.string().optional(),
    active: z.boolean().optional()
});

/** Ganzzahlige Cents; ein Euro-Fliesskommawert ist hier der haeufigste Fehler. */
const lineAmount = z
    .number()
    .int("Beträge sind ganzzahlige Cents, keine Euro mit Nachkommastellen.")
    .nonnegative("Der Betrag darf nicht negativ sein.");

const journalLine = z
    .object({
        accountId: uuid,
        debit: lineAmount.default(0),
        credit: lineAmount.default(0),
        memberId: uuid.nullish(),
        note: z.string().optional()
    })
    .refine(
        (line) => (line.debit === 0) !== (line.credit === 0),
        "Je Zeile ist entweder ein Soll- oder ein Habenbetrag anzugeben."
    );

export const journalEntryCreateSchema = z
    .object({
        fiscalYearId: uuid,
        date: isoDate,
        description: z.string().min(1, "Buchungstext fehlt."),
        lines: z.array(journalLine).min(2, "Ein Buchungssatz braucht mindestens zwei Zeilen.")
    })
    .refine((entry) => {
        const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
        const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
        return debit === credit;
    }, "Soll und Haben stimmen nicht überein.");

export const reverseSchema = z.object({
    reason: z.string().optional()
});

export const invoiceCreateSchema = z.object({
    fiscalYearId: uuid,
    memberId: uuid.nullish(),
    member: z.string().min(1, "Bezeichnung des Zahlungspflichtigen fehlt."),
    kind: z.string().min(1),
    amount: cents,
    date: isoDate.optional(),
    dueDate: isoDate.nullish(),
    note: z.string().optional()
});

export const paymentCreateSchema = z.object({
    amount: cents,
    date: isoDate.optional(),
    bankAccountId: uuid.nullish(),
    note: z.string().optional()
});

export const billCreateSchema = z.object({
    fiscalYearId: uuid,
    vendor: z.string().min(1, "Lieferant fehlt."),
    categoryId: uuid,
    amount: cents,
    date: isoDate,
    dueDate: isoDate.nullish(),
    note: z.string().optional()
});

export const bankAccountCreateSchema = z.object({
    name: z.string().min(1, "Name fehlt."),
    accountHolder: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional(),
    bankName: z.string().optional(),
    isCash: z.boolean().optional(),
    openingBalance: z.number().int().optional()
});

// ---------------------------------------------------------------------------
// Kaemmerer
// ---------------------------------------------------------------------------

export const articleCreateSchema = z.object({
    name: z.string().min(1, "Name fehlt."),
    description: z.string().optional(),
    price: z.number().int().nonnegative(),
    minStock: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    active: z.boolean().optional(),
    orderUrl: z.string().optional(),
    sizes: z
        .array(
            z.object({
                name: z.string().min(1),
                price: z.number().int().nonnegative(),
                stock: z.number().int().nonnegative(),
                minStock: z.number().int().nonnegative(),
                orderUrl: z.string().optional()
            })
        )
        .optional()
});

export const articleUpdateSchema = articleCreateSchema.partial();

export const orderCreateSchema = z.object({
    memberIds: z.array(uuid).min(1, "Mindestens ein Mitglied angeben."),
    lines: z
        .array(
            z.object({
                articleId: uuid,
                size: z.string().nullish(),
                quantity: z.number().int().positive()
            })
        )
        .min(1, "Mindestens eine Position angeben.")
});

export const orderUpdateSchema = z.object({
    status: z.enum(["ordered", "processing", "delivered", "cancelled"]).optional(),
    paymentStatus: z.enum(["open", "partial", "paid"]).optional()
});
