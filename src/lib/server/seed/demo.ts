import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { groups, members } from "$lib/server/db/schema";
import { createGroup } from "$lib/server/groupService";
import { createMember } from "$lib/server/memberService";
import { createPosition } from "$lib/server/positionService";
import { getRoleByKey, SYSTEM_ROLE_KEYS } from "$lib/server/roleService";
import { createFolder, setFolderShares } from "$lib/server/documentService";
import { createEvent, respond, setEventShares } from "$lib/server/eventService";
import { createSurvey, setSurveyFields, setSurveyStatus } from "$lib/server/surveyService";
import { createGallery } from "$lib/server/galleryService";
import { createArticle } from "$lib/server/kaemmerer/articleService";
import { createOrder } from "$lib/server/kaemmerer/orderService";
import { createFiscalYear, getFiscalYearByYear } from "$lib/server/finance/yearService";
import { createBankAccount, listBankAccounts } from "$lib/server/finance/bankAccountService";
import { ensureChartOfAccounts } from "$lib/server/finance/chartOfAccounts";
import { listCategories } from "$lib/server/finance/categoryService";
import { createTransaction } from "$lib/server/finance/transactionService";
import { seedYearlyDues } from "$lib/server/finance/duesSeeding";
import { createBill } from "$lib/server/finance/billService";

/**
 * Demodaten fuer eine frische Installation.
 *
 * Gedacht zum Ausprobieren: zwei Gruppen, ein Dutzend Mitglieder, ein Amt,
 * ein Geschaeftsjahr mit Beitraegen, ein paar Buchungen, Artikel und eine
 * Bestellung. Alles erkennbar erfunden -- die Namen stammen aus einer festen
 * Liste, damit ein Demobestand nicht wie echte Mitgliedsdaten aussieht.
 *
 * Der Lauf ist NICHT idempotent: er prueft nur, ob ueberhaupt schon
 * Mitglieder vorhanden sind, und bricht dann ab. Zweimal ausgefuehrt entstuenden
 * sonst doppelte Datensaetze.
 */

const FIRST_NAMES = [
    "Anna", "Ben", "Clara", "David", "Emma", "Finn",
    "Greta", "Hannes", "Ida", "Jonas", "Klara", "Lars"
];

const LAST_NAMES = [
    "Berger", "Brandt", "Dreyer", "Engel", "Fischer", "Groß",
    "Hansen", "Iversen", "Jansen", "Köhler", "Lorenz", "Meyer"
];

const TRAIL_NAMES = ["Falke", "Luchs", "Otter", "Specht", "Wiesel"];

const STANDS = ["Wölfling", "Jungpfadfinder", "Pfadfinder", "Rover", "Leitung"];

export interface DemoResult {
    skipped: boolean;
    groups: number;
    members: number;
    articles: number;
    orders: number;
    transactions: number;
    folders: number;
    events: number;
    surveys: number;
    galleries: number;
}

/** Feste Streuung ohne Zufall, damit jeder Lauf denselben Bestand ergibt. */
function pick<T>(list: T[], index: number): T {
    return list[index % list.length];
}

function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function seedDemoData(user = "demo"): Promise<DemoResult> {
    const existing = await db.select({ id: members.id }).from(members).limit(1);
    if (existing.length > 0) {
        return {
            skipped: true,
            groups: 0,
            members: 0,
            articles: 0,
            orders: 0,
            transactions: 0,
            folders: 0,
            events: 0,
            surveys: 0,
            galleries: 0
        };
    }

    const year = new Date().getFullYear();

    // --- Gruppen ----------------------------------------------------------
    const meute = await createGroup({
        name: "Meute Wildkatzen",
        type: "meute",
        meeting_time: "Dienstag 17:00 Uhr",
        description: "Wölflinge, 7 bis 10 Jahre."
    });
    const sippe = await createGroup({
        name: "Sippe Nordstern",
        type: "sippe",
        meeting_time: "Donnerstag 18:30 Uhr",
        description: "Jungpfadfinder und Pfadfinder."
    });

    // --- Mitglieder -------------------------------------------------------
    const created: { id: string; name: string }[] = [];

    for (let i = 0; i < 12; i++) {
        const group = i < 5 ? meute.id : sippe.id;
        const member = await createMember({
            firstname: pick(FIRST_NAMES, i),
            lastname: pick(LAST_NAMES, i),
            fahrtenname: i % 3 === 0 ? pick(TRAIL_NAMES, i) : "",
            birthday: isoDate(year - 10 - (i % 8), ((i * 3) % 12) + 1, ((i * 5) % 27) + 1),
            address: {
                street: `Musterweg ${i + 1}`,
                zip: "28195",
                city: "Musterstadt"
            },
            stand: pick(STANDS, i),
            status: "aktiv",
            entryDate: isoDate(year - (i % 4) - 1, 9, 1),
            emails: [{ label: "Eltern", email: `demo${i + 1}@example.org` }],
            numbers: [{ label: "Mobil", number: `0170 000000${i}` }],
            groups: [group],
            // Ein Mitglied ohne Bundesbeitrag, damit die Beitragsberechnung
            // sichtbar unterschiedliche Betraege erzeugt.
            contributionDues: i === 3 ? { bund: false } : undefined,
            updatedBy: user
        });

        created.push({ id: member.id, name: `${member.firstname} ${member.lastname}` });
    }

    // --- Amt --------------------------------------------------------------
    await createPosition({
        name: "Kassenwart",
        email: "kasse@example.org",
        description: "Führt die Kasse des Stamms.",
        type: "amt",
        memberIds: [created[0].id]
    });

    /**
     * Ein Amt mit Rolle UND Gruppenbezug -- damit sind die gruppenbezogenen
     * Rechte in den Demodaten vorgefuehrt: der Inhaber sieht und bearbeitet
     * nur die Mitglieder dieser Meute, sonst nichts.
     */
    const leaderRole = await getRoleByKey(SYSTEM_ROLE_KEYS.groupLeader);

    await createPosition({
        name: "Meutenführung Wildkatzen",
        type: "gruppenleiter",
        groupId: meute.id,
        roleId: leaderRole?.id ?? null,
        memberIds: [created[1].id]
    });

    // --- Kasse ------------------------------------------------------------
    await ensureChartOfAccounts();

    let fiscalYear = await getFiscalYearByYear(year);
    if (!fiscalYear) {
        const result = await createFiscalYear({
            year,
            // 30 / 12 / 9 / 15 EUR in Cents.
            dues: { stamm: 3000, gau: 1200, landesmark: 900, bund: 1500 },
            createdBy: user
        });
        fiscalYear = result.year ?? null;
    }

    let bankAccounts = await listBankAccounts({ activeOnly: true });
    if (bankAccounts.length === 0) {
        await createBankAccount({
            name: "Girokonto",
            accountHolder: "Musterverein e. V.",
            iban: "DE02120300000000202051",
            bankName: "Musterbank",
            openingBalance: 250_000
        });
        await createBankAccount({ name: "Barkasse", isCash: true, openingBalance: 5_000 });
        bankAccounts = await listBankAccounts({ activeOnly: true });
    }

    let transactions = 0;

    if (fiscalYear) {
        await seedYearlyDues(fiscalYear.id, user);

        const categories = await listCategories({ activeOnly: true });
        const bank = bankAccounts[0];

        const samples: { category: string; amount: number; day: number; note: string }[] = [
            { category: "Spende", amount: 15_000, day: 12, note: "Spende Elternabend" },
            { category: "Zuschuss", amount: 40_000, day: 20, note: "Zuschuss Stadtjugendring" },
            { category: "Gruppenstunde/Material", amount: 6_450, day: 25, note: "Bastelmaterial" },
            { category: "Lager/Aktion", amount: 89_900, day: 40, note: "Anzahlung Sommerlager" },
            { category: "Verwaltung", amount: 2_390, day: 55, note: "Porto und Kopien" }
        ];

        for (const sample of samples) {
            const category = categories.find((entry) => entry.name === sample.category);
            if (!category || !bank) continue;

            const date = new Date(year, 0, 1);
            date.setDate(date.getDate() + sample.day);

            const result = await createTransaction({
                fiscalYearId: fiscalYear.id,
                categoryId: category.id,
                bankAccountId: bank.id,
                date,
                amount: sample.amount,
                note: sample.note,
                user
            });
            if (result.ok) transactions += 1;
        }

        // Eine offene Eingangsrechnung, damit die Verbindlichkeiten nicht leer sind.
        const billCategory = categories.find((entry) => entry.name === "Ausrüstung");
        if (billCategory) {
            const date = new Date(year, 1, 15);
            await createBill({
                fiscalYearId: fiscalYear.id,
                vendor: "Ausrüstungshaus Muster",
                categoryId: billCategory.id,
                amount: 34_900,
                date,
                dueDate: new Date(year, 2, 15),
                note: "Zelte und Kochgeschirr",
                createdBy: user
            });
        }
    }

    // --- Kämmerer ---------------------------------------------------------
    const kluft = await createArticle({
        name: "Kluft-Hemd",
        description: "Standardhemd in verschiedenen Größen.",
        price: 4_500,
        minStock: 0,
        sizes: [
            { name: "S", price: 4_500, stock: 6, minStock: 3 },
            { name: "M", price: 4_500, stock: 4, minStock: 3 },
            { name: "L", price: 4_900, stock: 2, minStock: 3 },
            { name: "XL", price: 4_900, stock: 0, minStock: 2 }
        ]
    });

    await createArticle({
        name: "Halstuch",
        description: "Stammeshalstuch.",
        price: 1_800,
        stock: 25,
        minStock: 10
    });

    await createArticle({
        name: "Aufnäher Stammesabzeichen",
        price: 350,
        stock: 40,
        minStock: 20
    });

    let orders = 0;
    const order = await createOrder({
        lines: [{ articleId: kluft.id, size: "M", quantity: 1 }],
        memberIds: [created[0].id],
        createdBy: "",
        createdByName: user
    });
    if (order.ok) orders += 1;

    // --- Dateiablage ------------------------------------------------------
    /**
     * Zwei Ordner mit unterschiedlichen Freigaben -- damit sich im Demobetrieb
     * gleich sehen laesst, dass die Sichtbarkeit wirklich greift: der zweite
     * ist nur fuer die Meute freigegeben und taucht bei allen anderen nicht
     * auf.
     */
    const publicFolder = await createFolder(
        {
            name: "Formulare",
            description: "Anmeldungen, Einverstaendniserklaerungen und Vorlagen."
        },
        null
    );

    const meuteFolder = await createFolder(
        {
            name: "Meute Wildkatzen",
            description: "Nur fuer die Meute: Programm und Absprachen.",
            parentId: null
        },
        null
    );

    let folders = 0;

    if (publicFolder.ok && publicFolder.id) {
        // Ohne Gruppenbezug: an beide Gruppen freigegeben, lesend.
        await setFolderShares(publicFolder.id, [
            { targetKind: "group", targetId: meute.id, canWrite: false },
            { targetKind: "group", targetId: sippe.id, canWrite: false }
        ]);
        folders += 1;
    }

    if (meuteFolder.ok && meuteFolder.id) {
        await setFolderShares(meuteFolder.id, [
            { targetKind: "group", targetId: meute.id, canWrite: true }
        ]);
        folders += 1;
    }

    // --- Termine ----------------------------------------------------------
    /**
     * Drei Termine: einer fuer alle, einer nur fuer die Meute, einer bereits
     * vorbei. Der erste traegt Rueckmeldungen, damit die Teilnehmerliste und
     * die Zaehler nicht leer sind.
     */
    const day = 24 * 60 * 60 * 1000;
    let events = 0;

    const camp = await createEvent(
        {
            title: "Sommerlager",
            description:
                "Eine Woche Zelten am See. Packliste haengt im Ordner „Formulare“.",
            location: "Zeltplatz Musterheide",
            startsAt: new Date(Date.now() + 45 * day),
            endsAt: new Date(Date.now() + 52 * day),
            allDay: true,
            status: "published",
            responseDeadline: new Date(Date.now() + 20 * day)
        },
        null
    );

    if (camp.ok && camp.id) {
        events += 1;
        // Zwei Zusagen, eine Absage -- die Zaehler zeigen dann etwas.
        await respond({
            eventId: camp.id,
            memberId: created[0].id,
            response: "yes",
            respondedBy: null
        });
        await respond({
            eventId: camp.id,
            memberId: created[1].id,
            response: "yes",
            note: "kommt einen Tag spaeter",
            respondedBy: null
        });
        await respond({
            eventId: camp.id,
            memberId: created[2].id,
            response: "no",
            note: "Familienurlaub",
            respondedBy: null
        });
    }

    const meuteEvent = await createEvent(
        {
            title: "Meutenstunde Wildkatzen",
            description: "Gelaendespiel im Stadtwald.",
            location: "Pfadfinderheim",
            startsAt: new Date(Date.now() + 7 * day),
            status: "published"
        },
        null
    );

    if (meuteEvent.ok && meuteEvent.id) {
        await setEventShares(meuteEvent.id, [{ targetKind: "group", targetId: meute.id }]);
        events += 1;
    }

    const past = await createEvent(
        {
            title: "Stammesversammlung",
            description: "Rueckblick auf das Jahr und Wahl der Aemter.",
            location: "Pfadfinderheim",
            startsAt: new Date(Date.now() - 30 * day),
            status: "published"
        },
        null
    );
    if (past.ok) events += 1;

    // --- Umfragen ---------------------------------------------------------
    /**
     * Eine Umfrage mit ALLEN fuenf Feldtypen, gekoppelt an das Sommerlager --
     * so zeigt die Demo gleich den Terminbezug mit. Sie wird veroeffentlicht,
     * denn ein Entwurf waere fuer die meisten Zugaenge unsichtbar und die
     * Seite saehe leer aus.
     */
    let surveys = 0;

    const survey = await createSurvey(
        {
            title: "Anmeldung Sommerlager",
            description:
                "Damit wir planen koennen: bitte bis zwei Wochen vor Beginn ausfuellen.",
            eventId: camp.ok ? camp.id : null,
            audience: "member",
            closesAt: new Date(Date.now() + 20 * day)
        },
        null
    );

    if (survey.ok && survey.id) {
        const fields = await setSurveyFields(survey.id, [
            {
                type: "single",
                label: "Wie kommst du zum Zeltplatz?",
                required: true,
                options: [
                    { label: "Mit dem Bus des Stammes" },
                    { label: "Die Eltern bringen mich" },
                    { label: "Mit dem Fahrrad" }
                ]
            },
            {
                type: "multi",
                label: "Woran moechtest du teilnehmen?",
                help: "Mehrfachauswahl moeglich.",
                options: [
                    { label: "Nachtwanderung" },
                    { label: "Kanufahrt" },
                    { label: "Lagerbau" },
                    { label: "Kochgruppe" }
                ]
            },
            { type: "boolean", label: "Darf dein Kind schwimmen gehen?", required: true },
            { type: "text", label: "Krankenkasse", help: "Name der Kasse genuegt." },
            {
                type: "longtext",
                label: "Was sollen wir wissen?",
                help: "Unvertraeglichkeiten, Medikamente, Besonderheiten."
            }
        ]);

        if (fields.ok) {
            await setSurveyStatus(survey.id, "published");
            surveys += 1;
        }
    }

    // --- Galerie ----------------------------------------------------------
    /**
     * Eine leere Galerie zum Sommerlager. BEWUSST ohne Bilder: Binaerdaten
     * gehoeren nicht ins Repository, und ein erfundenes Bild waere ohne
     * eingerichteten Objektspeicher ohnehin nicht ablegbar.
     */
    let galleries = 0;

    const gallery = await createGallery(
        {
            title: "Sommerlager",
            description: "Bilder von der Fahrt -- bitte nur mit Einverstaendnis hochladen.",
            eventId: camp.ok ? camp.id : null
        },
        null
    );
    if (gallery.ok) galleries += 1;

    const [groupCount] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, meute.id));

    return {
        skipped: false,
        groups: groupCount ? 2 : 0,
        members: created.length,
        articles: 3,
        orders,
        transactions,
        folders,
        events,
        surveys,
        galleries
    };
}
