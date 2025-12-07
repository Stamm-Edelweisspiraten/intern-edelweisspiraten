import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ url, locals }) => {
    const perms = locals.permissions ?? [];
    if (!hasPermission(perms, "groups.view")) {
        throw error(403, "Keine Berechtigung");
    }

    const groupId = url.searchParams.get("group");
    if (!groupId) {
        throw error(400, "Keine Gruppe ausgewählt");
    }

    const group = await getGroup(groupId);
    if (!group) {
        throw error(404, "Gruppe nicht gefunden");
    }

    const members = await getMembersByGroup(groupId);

    return {
        group,
        members: members.map((m: any) => ({
            id: m._id.toString(),
            firstname: m.firstname,
            lastname: m.lastname,
            emails: m.emails ?? []
        }))
    };
};

export const actions: Actions = {
    sendMail: async ({ request, locals }) => {
        if (!hasPermission(locals.permissions ?? [], "groups.edit")) {
            throw error(403, "Keine Berechtigung");
        }

        const form = await request.formData();
        const subject = form.get("subject")?.toString() ?? "";
        const bodyHtml = form.get("bodyHtml")?.toString() ?? "";
        const replyToForm = form.get("replyTo")?.toString() ?? "";
        const groupId = form.get("groupId")?.toString() ?? "";
        const files = form.getAll("attachments");

        if (!groupId) {
            return fail(400, { error: "Keine Gruppe angegeben." });
        }

        const stripTags = (html: string) => html.replace(/<\/?[^>]+(>|$)/g, "");
        const bodyText = stripTags(bodyHtml).trim();

        if (!subject || !bodyHtml) {
            return fail(400, { error: "Betreff und Nachricht sind Pflicht." });
        }

        const group = await getGroup(groupId);
        if (!group) {
            throw error(404, "Gruppe nicht gefunden");
        }

        const members = await getMembersByGroup(groupId);
        const emails = new Set<string>();
        members.forEach((m: any) => {
            (m.emails ?? []).forEach((e: any) => {
                if (e.email) emails.add(e.email);
            });
        });

        if (emails.size === 0) {
            return fail(400, { error: "Keine E-Mail-Adressen in dieser Gruppe." });
        }

        const { sendEmail } = await import("$lib/server/emailService");
        const reply = replyToForm || group.replyTo || "";

        // Attachments aufbereiten
        const attachments: { filename?: string; content: Buffer; contentType?: string }[] = [];
        for (const f of files) {
            if (f && typeof (f as any).arrayBuffer === "function") {
                const file = f as File;
                const buffer = Buffer.from(await file.arrayBuffer());
                attachments.push({
                    filename: file.name || "attachment",
                    content: buffer,
                    contentType: file.type || undefined
                });
            }
        }

        for (const to of emails) {
            await sendEmail({
                to,
                subject,
                text: bodyText || bodyHtml,
                html: bodyHtml,
                replyTo: reply || undefined,
                attachments
            } as any);
        }

        return { success: true, sent: emails.size };
    }
};
