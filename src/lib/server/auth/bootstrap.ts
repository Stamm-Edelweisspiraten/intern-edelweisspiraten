import { env } from "$env/dynamic/private";
import { users } from "$lib/server/db/collections";
import { getRoleByKey, SYSTEM_ROLE_KEYS } from "$lib/server/roleService";
import { hashPassword } from "$lib/server/auth/password";
import { normalizeEmail } from "$lib/server/userService";

/**
 * Erster Zugang nach dem Wegfall des externen Anmeldedienstes.
 *
 * Ohne diesen Weg gaebe es nach der Umstellung buchstaeblich keine
 * Moeglichkeit mehr, sich anzumelden. Es gibt deshalb zwei Wege:
 *
 *  1. Diese Funktion, gesteuert ueber BOOTSTRAP_ADMIN_EMAIL und
 *     BOOTSTRAP_ADMIN_PASSWORD -- gedacht als Wiederherstellungsweg, wenn
 *     man sich ausgesperrt hat.
 *  2. Die Seite /setup, die nur erreichbar ist, solange ueberhaupt kein
 *     aktiver Zugang existiert.
 */

export async function hasActiveAdmin(): Promise<boolean> {
    const adminRole = await getRoleByKey(SYSTEM_ROLE_KEYS.admin);
    if (!adminRole?._id) return false;

    const count = await users().countDocuments({
        status: "active",
        passwordHash: { $nin: ["", null] as never },
        roleIds: adminRole._id
    });

    return count > 0;
}

/** Gibt es ueberhaupt einen anmeldefaehigen Zugang? */
export async function hasAnyActiveUser(): Promise<boolean> {
    const count = await users().countDocuments({
        status: "active",
        passwordHash: { $nin: ["", null] as never }
    });
    return count > 0;
}

export async function ensureBootstrapAdmin(): Promise<void> {
    const email = env.BOOTSTRAP_ADMIN_EMAIL;
    const password = env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!email || !password) return;

    try {
        const adminRole = await getRoleByKey(SYSTEM_ROLE_KEYS.admin);
        if (!adminRole?._id) {
            console.error("Bootstrap: Die Rolle 'admin' existiert nicht.");
            return;
        }

        const normalized = normalizeEmail(email);
        const existing = await users().findOne({ email: normalized });
        const force = env.BOOTSTRAP_ADMIN_FORCE === "1";

        if (!existing) {
            await users().insertOne({
                name: "Administration",
                email: normalized,
                passwordHash: await hashPassword(password),
                passwordChangedAt: new Date(),
                status: "active",
                type: "parent",
                roleIds: [adminRole._id],
                memberIds: [],
                failedLoginAttempts: 0,
                lockedUntil: null,
                createdAt: new Date()
            });
            console.warn(
                `Bootstrap-Zugang angelegt: ${normalized}. Bitte das Passwort aendern und die BOOTSTRAP_ADMIN_* Variablen anschliessend entfernen.`
            );
            return;
        }

        // Ein funktionierender Zugang wird nur auf ausdrueckliche Anweisung
        // ueberschrieben.
        const needsRepair = !existing.passwordHash || existing.status !== "active";
        if (!needsRepair && !force) return;

        await users().updateOne(
            { _id: existing._id },
            {
                $set: {
                    passwordHash: await hashPassword(password),
                    passwordChangedAt: new Date(),
                    status: "active",
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                    updatedAt: new Date()
                },
                $addToSet: { roleIds: adminRole._id }
            }
        );

        console.warn(
            `Bootstrap-Zugang wiederhergestellt: ${normalized}. Bitte das Passwort aendern und die BOOTSTRAP_ADMIN_* Variablen anschliessend entfernen.`
        );
    } catch (err) {
        // Der Start darf daran nicht scheitern (z.B. wenn keine Datenbank
        // erreichbar ist), der Fehler muss aber sichtbar sein.
        console.error("Bootstrap-Zugang konnte nicht sichergestellt werden:", err);
    }
}
