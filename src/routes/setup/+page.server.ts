import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { hasAnyActiveUser } from "$lib/server/auth/bootstrap";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "$lib/server/auth/password";
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
 */

export const load: PageServerLoad = async () => {
    if (await hasAnyActiveUser()) {
        throw error(404, "Nicht gefunden");
    }
    return {
        minPasswordLength: MIN_PASSWORD_LENGTH,
        currentYear: new Date().getFullYear()
    };
};

export const actions: Actions = {
    default: async ({ request, cookies, getClientAddress }) => {
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
