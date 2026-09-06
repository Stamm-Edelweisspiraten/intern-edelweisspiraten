import { error, fail, redirect } from "@sveltejs/kit";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "$env/dynamic/private";
import type { Actions, PageServerLoad } from "./$types";
import { hasAnyActiveUser } from "$lib/server/auth/bootstrap";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "$lib/server/auth/password";
import { databaseInfo, describeConnectionError, testConnection } from "$lib/server/db";
import {
    buildDatabaseUrl,
    databaseFilePath,
    describeDatabase,
    writeDatabaseFile,
    type DatabaseFileConfig
} from "$lib/server/db/url";
import { createUser, normalizeEmail } from "$lib/server/userService";
import { ensureDefaultRoles, getRoleByKey, SYSTEM_ROLE_KEYS } from "$lib/server/roleService";
import { createSession } from "$lib/server/auth/session";
import { saveFinanceSettings, saveOrganizationSettings } from "$lib/server/settingsService";
import { ensureChartOfAccounts } from "$lib/server/finance/chartOfAccounts";
import { createFiscalYear, getFiscalYearByYear } from "$lib/server/finance/yearService";
import { createBankAccount, listBankAccounts } from "$lib/server/finance/bankAccountService";
import { seedDemoData } from "$lib/server/seed/demo";
import { parseEuro } from "$lib/money";

/**
 * Ersteinrichtung.
 *
 * Erreichbar ausschliesslich, solange ueberhaupt kein anmeldefaehiger Zugang
 * existiert. Danach antwortet die Route dauerhaft mit 404 -- ohne diese
 * Sperre waere sie eine offene Tuer.
 *
 * Der Assistent legt in einem Durchgang an: Organisation, ersten Zugang,
 * Kontenrahmen mit erstem Geschaeftsjahr und Bankkonto und auf Wunsch
 * Demodaten. Damit laeuft dieselbe Anwendung fuer verschiedene Staemme, ohne
 * dass irgendwo ein Name im Quelltext steht.
 *
 * Vorgeschaltet ist ein Schritt "Datenbank": ist gar keine Datenbank
 * erreichbar, koennte die Seite die Frage nach dem ersten Zugang nicht einmal
 * stellen -- sie wuerde mit einem Verbindungsfehler abbrechen. Statt dessen
 * wird nach den Zugangsdaten gefragt, die Verbindung geprueft, die
 * Konfiguration geschrieben und migriert. Steht die Verbindung, ist der
 * Assistent unveraendert der bisherige.
 */

/** Zustand des Datenbankschritts; die Seite braucht ihn zur Vorbelegung. */
interface DatabaseFormValues {
    mode: "parts" | "url";
    host: string;
    port: string;
    name: string;
    user: string;
    ssl: boolean;
    connectionString: string;
}

const EMPTY_VALUES: DatabaseFormValues = {
    mode: "parts",
    host: "",
    port: "5432",
    name: "",
    user: "",
    ssl: false,
    connectionString: ""
};

/**
 * Ist die Datenbank erreichbar, und gibt es dort schon einen Zugang?
 *
 * Die Abfrage ist zugleich der Verbindungstest: hasAnyActiveUser() wirft, wenn
 * keine Verbindung steht oder die Tabellen fehlen.
 */
async function probeDatabase(): Promise<
    { reachable: true; hasUser: boolean } | { reachable: false; reason: string }
> {
    try {
        return { reachable: true, hasUser: await hasAnyActiveUser() };
    } catch (err) {
        return { reachable: false, reason: describeConnectionError(err) };
    }
}

/**
 * Der 404-Schutz, auch fuer die Actions des Datenbankschritts.
 *
 * SvelteKit fuehrt bei Form-Actions kein load aus; ohne diese Pruefung waere
 * der neue Zweig ein Weg, die Sperre zu umgehen und eine laufende Installation
 * auf eine fremde Datenbank umzubiegen. Steht keine Verbindung, gibt es auch
 * nichts zu schuetzen -- dann darf der Schritt arbeiten.
 */
async function guardExistingInstallation(): Promise<void> {
    const probe = await probeDatabase();
    if (probe.reachable && probe.hasUser) throw error(404, "Nicht gefunden");
}

/** Liest die Eingaben des Datenbankschritts -- ohne das Passwort. */
function readDatabaseForm(form: FormData): DatabaseFormValues {
    return {
        mode: form.get("mode") === "url" ? "url" : "parts",
        host: String(form.get("host") ?? "").trim(),
        port: String(form.get("port") ?? "").trim(),
        name: String(form.get("name") ?? "").trim(),
        user: String(form.get("user") ?? "").trim(),
        ssl: form.get("ssl") === "on",
        connectionString: String(form.get("connectionString") ?? "").trim()
    };
}

/**
 * Baut aus den Eingaben die URL und den Inhalt der Konfigurationsdatei.
 *
 * Beide Eingabearten fuehren zum selben Ergebnis; welche jemand benutzt, haengt
 * davon ab, was der Hoster herausgibt -- oft ist es genau eine fertige URL.
 */
function connectionFromForm(
    values: DatabaseFormValues,
    password: string
): { url: string; config: DatabaseFileConfig } | { error: string } {
    if (values.mode === "url") {
        if (!values.connectionString) {
            return { error: "Bitte einen Connection String angeben." };
        }
        if (!/^postgres(ql)?:\/\//i.test(values.connectionString)) {
            return {
                error: "Der Connection String muss mit postgresql:// beginnen. Diese Anwendung setzt PostgreSQL voraus."
            };
        }
        if (!describeDatabase(values.connectionString)) {
            return { error: "Der Connection String lässt sich nicht lesen." };
        }
        return { url: values.connectionString, config: { url: values.connectionString } };
    }

    if (!values.host) return { error: "Bitte einen Host angeben." };
    if (!values.name) return { error: "Bitte einen Datenbanknamen angeben." };

    const port = values.port ? Number(values.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { error: "Der Port muss eine Zahl zwischen 1 und 65535 sein." };
    }

    const config: DatabaseFileConfig = {
        host: values.host,
        port,
        name: values.name,
        user: values.user || undefined,
        password: password || undefined,
        ssl: values.ssl
    };

    try {
        return {
            url: buildDatabaseUrl({
                host: config.host ?? "",
                port,
                name: config.name ?? "",
                user: config.user,
                password: config.password,
                ssl: config.ssl
            }),
            config
        };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}

export const load: PageServerLoad = async () => {
    const probe = await probeDatabase();

    if (probe.reachable) {
        if (probe.hasUser) throw error(404, "Nicht gefunden");

        return {
            stage: "wizard" as const,
            database: null,
            minPasswordLength: MIN_PASSWORD_LENGTH,
            currentYear: new Date().getFullYear()
        };
    }

    // Vorbelegung aus dem, was bereits konfiguriert ist -- ohne das Passwort.
    const info = databaseInfo();
    const values: DatabaseFormValues = info.description
        ? {
              ...EMPTY_VALUES,
              host: info.description.host,
              port: String(info.description.port),
              name: info.description.database,
              user: info.description.user,
              ssl: info.description.ssl
          }
        : EMPTY_VALUES;

    return {
        stage: "database" as const,
        database: {
            reason: probe.reason,
            values,
            configFile: info.configFile,
            /** Die Umgebung gibt die Verbindung vor; eine Datei aendert daran nichts. */
            fromEnv: info.source === "env-url" || info.source === "env-parts"
        },
        minPasswordLength: MIN_PASSWORD_LENGTH,
        currentYear: new Date().getFullYear()
    };
};

export const actions: Actions = {
    /** Verbindung pruefen, ohne etwas zu schreiben. */
    testDatabase: async ({ request }) => {
        await guardExistingInstallation();

        const form = await request.formData();
        const values = readDatabaseForm(form);
        const built = connectionFromForm(values, String(form.get("password") ?? ""));

        if ("error" in built) return fail(400, { error: built.error, values });

        const result = await testConnection(built.url);
        if (!result.ok) return fail(400, { error: result.message, values });

        return {
            success: result.serverVersion
                ? `Die Verbindung steht. PostgreSQL ${result.serverVersion}.`
                : result.message,
            values
        };
    },

    /**
     * Verbindung pruefen, speichern, migrieren.
     *
     * In dieser Reihenfolge: eine Konfiguration, die nicht funktioniert, soll
     * gar nicht erst auf der Platte landen -- sonst faende der naechste Start
     * sie vor und scheiterte daran.
     */
    saveDatabase: async ({ request }) => {
        await guardExistingInstallation();

        const form = await request.formData();
        const values = readDatabaseForm(form);
        const built = connectionFromForm(values, String(form.get("password") ?? ""));

        if ("error" in built) return fail(400, { error: built.error, values });

        const info = databaseInfo();
        if (info.source === "env-url" || info.source === "env-parts") {
            return fail(400, {
                error:
                    "Die Verbindung wird über Umgebungsvariablen vorgegeben; eine hier gespeicherte Konfiguration bliebe wirkungslos. Bitte DATABASE_URL beziehungsweise die DB_* Variablen ändern und die Anwendung neu starten.",
                values
            });
        }

        const test = await testConnection(built.url);
        if (!test.ok) return fail(400, { error: test.message, values });

        try {
            writeDatabaseFile(databaseFilePath(env), built.config);
        } catch (err) {
            return fail(500, {
                error: `Die Konfiguration konnte nicht gespeichert werden: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                values
            });
        }

        // max: 1 -- Migrationen laufen streng nacheinander.
        const client = postgres(built.url, { max: 1, connect_timeout: 10, onnotice: () => {} });
        try {
            await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
        } catch (err) {
            return fail(500, {
                error: `Die Datenbank ist erreichbar, aber die Migrationen sind fehlgeschlagen: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                values
            });
        } finally {
            await client.end({ timeout: 5 }).catch(() => {});
        }

        // Zurueck auf /setup: der load findet jetzt eine Verbindung vor und
        // zeigt den gewohnten vierschrittigen Assistenten.
        throw redirect(303, "/setup");
    },

    complete: async ({ request, cookies, getClientAddress }) => {
        if (await hasAnyActiveUser()) {
            throw error(404, "Nicht gefunden");
        }

        const form = await request.formData();

        // --- Organisation -------------------------------------------------
        const organizationName = String(form.get("organizationName") ?? "").trim();
        const shortName = String(form.get("shortName") ?? "").trim();
        const city = String(form.get("city") ?? "").trim();

        // --- Zugang -------------------------------------------------------
        const name = String(form.get("name") ?? "").trim();
        const email = normalizeEmail(String(form.get("email") ?? ""));
        const password = String(form.get("password") ?? "");
        const passwordRepeat = String(form.get("passwordRepeat") ?? "");

        // --- Kasse --------------------------------------------------------
        const setupFinance = form.get("setupFinance") === "on";
        const yearValue = Number(form.get("fiscalYear") ?? new Date().getFullYear());
        const bankAccountName = String(form.get("bankAccountName") ?? "").trim();
        const withDemo = form.get("demoData") === "on";

        const values = { organizationName, shortName, city, name, email };

        if (!organizationName) {
            return fail(400, { error: "Bitte den Namen des Stamms angeben.", ...values });
        }
        if (!name) return fail(400, { error: "Bitte einen Namen angeben.", ...values });
        if (!email.includes("@")) {
            return fail(400, { error: "Bitte eine gültige E-Mail-Adresse angeben.", ...values });
        }
        if (password !== passwordRepeat) {
            return fail(400, { error: "Die beiden Passwörter stimmen nicht überein.", ...values });
        }

        const policy = checkPasswordPolicy(password, email);
        if (!policy.ok) return fail(400, { error: policy.error, ...values });

        if (setupFinance && (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100)) {
            return fail(400, { error: "Bitte ein gültiges Geschäftsjahr angeben.", ...values });
        }

        // --- Anlegen ------------------------------------------------------
        await saveOrganizationSettings(
            {
                name: organizationName,
                shortName: shortName || organizationName,
                city,
                contactEmail: email
            },
            email
        );

        await ensureDefaultRoles();
        const adminRole = await getRoleByKey(SYSTEM_ROLE_KEYS.admin);
        if (!adminRole) {
            return fail(500, {
                error: "Die Administrationsrolle konnte nicht angelegt werden.",
                ...values
            });
        }

        const result = await createUser({
            name,
            email,
            password,
            roleIds: [adminRole.id],
            status: "active"
        });

        if (!result.ok || !result.user) {
            return fail(400, {
                error: result.error ?? "Der Zugang konnte nicht angelegt werden.",
                ...values
            });
        }

        if (setupFinance) {
            await ensureChartOfAccounts();

            const dues = {
                stamm: parseEuro(String(form.get("dues_stamm") ?? "0")) ?? 0,
                gau: parseEuro(String(form.get("dues_gau") ?? "0")) ?? 0,
                landesmark: parseEuro(String(form.get("dues_landesmark") ?? "0")) ?? 0,
                bund: parseEuro(String(form.get("dues_bund") ?? "0")) ?? 0
            };

            const existingYear = await getFiscalYearByYear(yearValue);
            if (!existingYear) {
                await createFiscalYear({ year: yearValue, dues, createdBy: email });
            }

            // Dieselben Saetze als Voreinstellung fuer kuenftige Jahre.
            await saveFinanceSettings({ contributions: dues }, email);

            const accounts = await listBankAccounts();
            if (accounts.length === 0) {
                await createBankAccount({
                    name: bankAccountName || "Girokonto",
                    accountHolder: organizationName,
                    openingBalance: parseEuro(String(form.get("openingBalance") ?? "0")) ?? 0
                });
            }
        }

        if (withDemo) {
            try {
                await seedDemoData(email);
            } catch (err) {
                // Demodaten sind eine Beigabe -- ihr Scheitern darf die
                // Einrichtung nicht zunichtemachen.
                console.error("Demodaten konnten nicht angelegt werden:", err);
            }
        }

        // Direkt anmelden; die Einrichtung von 2FA folgt im Profil.
        await createSession(cookies, {
            userId: result.user.id,
            ip: getClientAddress(),
            userAgent: request.headers.get("user-agent"),
            mfaSatisfied: true
        });

        throw redirect(303, "/intern/profil/sicherheit?hinweis=ersteinrichtung");
    }
};
