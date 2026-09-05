import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { requireAnyPermission } from "$lib/server/permissionGuard";
import { getOrganizationSettings, saveOrganizationSettings } from "$lib/server/settingsService";
import { deleteFile, MAX_FILE_BYTES, storeFile } from "$lib/server/fileStore";
import { matchesAnyPermission } from "$lib/permissions/match";

/**
 * Angaben zur Organisation.
 *
 * Damit laeuft dieselbe Anwendung fuer verschiedene Staemme: Name, Logo und
 * Kontaktdaten stehen nicht mehr im Quelltext, sondern hier. Sie erscheinen
 * in der Kopfzeile, in E-Mails, in den PDFs und als Aussteller des
 * Zwei-Faktor-Geheimnisses.
 */

const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export const load: PageServerLoad = async (event) => {
    requireAnyPermission(event, ["admin.view", "system.settings.view"]);

    return {
        organization: await getOrganizationSettings(),
        canUpdate: matchesAnyPermission(event.locals.permissions, [
            "admin.view",
            "system.settings.update"
        ])
    };
};

export const actions: Actions = {
    save: async (event) => {
        requireAnyPermission(event, ["admin.view", "system.settings.update"]);

        const form = await event.request.formData();
        const name = String(form.get("name") ?? "").trim();
        if (!name) return fail(400, { error: "Bitte einen Namen angeben." });

        const primaryColor = String(form.get("primaryColor") ?? "").trim();
        if (primaryColor && !/^#[0-9a-f]{6}$/i.test(primaryColor)) {
            return fail(400, { error: "Die Primärfarbe muss ein Hex-Wert wie #2563eb sein." });
        }

        const current = await getOrganizationSettings();
        let logoFileId = current.logoFileId;

        const logo = form.get("logo");
        if (logo instanceof File && logo.size > 0) {
            if (logo.size > MAX_FILE_BYTES) {
                return fail(400, { error: "Das Logo ist zu groß (höchstens 10 MB)." });
            }
            if (!LOGO_TYPES.includes(logo.type)) {
                return fail(400, { error: "Als Logo sind PNG, JPEG, SVG und WebP möglich." });
            }

            const previous = logoFileId;
            logoFileId = await storeFile({
                filename: logo.name,
                contentType: logo.type,
                content: Buffer.from(await logo.arrayBuffer()),
                uploadedBy: event.locals.user?.email
            });

            // Erst nach dem erfolgreichen Ablegen entfernen.
            await deleteFile(previous);
        }

        if (form.get("removeLogo") === "1" && logoFileId) {
            await deleteFile(logoFileId);
            logoFileId = "";
        }

        await saveOrganizationSettings(
            {
                name,
                shortName: String(form.get("shortName") ?? "").trim() || name,
                city: String(form.get("city") ?? "").trim(),
                contactEmail: String(form.get("contactEmail") ?? "").trim(),
                website: String(form.get("website") ?? "").trim(),
                imprintUrl: String(form.get("imprintUrl") ?? "").trim(),
                privacyUrl: String(form.get("privacyUrl") ?? "").trim(),
                instagramUrl: String(form.get("instagramUrl") ?? "").trim(),
                primaryColor,
                logoFileId
            },
            event.locals.user?.email ?? "system"
        );

        return { success: "Die Angaben wurden gespeichert." };
    }
};
