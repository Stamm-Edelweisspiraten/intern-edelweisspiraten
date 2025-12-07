import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getGroup } from "$lib/server/groupService";
import { getMembersByGroup, getMembersByIds } from "$lib/server/memberService";
import { hasPermission } from "$lib/server/permissionService";

export const load: PageServerLoad = async ({ url, locals }) => {
    const perms = locals.permissions ?? [];
    const groupId = url.searchParams.get("group");
    const memberIdsParam = url.searchParams.get("members");

    let group = null;
    let members: any[] = [];
    let mode: "group" | "members" = "group";

    if (groupId) {
        if (!hasPermission(perms, "groups.view")) {
            throw error(403, "Keine Berechtigung");
        }
        group = await getGroup(groupId);
        if (!group) {
            throw error(404, "Gruppe nicht gefunden");
        }
        members = await getMembersByGroup(groupId);
        mode = "group";
    } else if (memberIdsParam) {
        if (!hasPermission(perms, "members.view")) {
            throw error(403, "Keine Berechtigung");
        }
        const ids = memberIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
        if (ids.length === 0) {
            throw error(400, "Keine Mitglieder ausgewählt");
        }
        members = await getMembersByIds(ids);
        mode = "members";
    } else {
        throw error(400, "Keine Gruppe oder Mitglieder ausgewählt");
    }

    return {
        group,
        mode,
        replyToDefault: locals.user?.userinfo?.email ?? group?.replyTo ?? "",
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
        const form = await request.formData();
        const subject = form.get("subject")?.toString() ?? "";
        const bodyHtml = form.get("bodyHtml")?.toString() ?? "";
        const replyToForm = form.get("replyTo")?.toString() ?? "";
        const groupId = form.get("groupId")?.toString() ?? "";
        const files = form.getAll("attachments");
        const memberIdsParam = form.get("memberIds")?.toString() ?? "";

        if (!groupId) {
            if (!memberIdsParam) {
                return fail(400, { error: "Keine Empfänger angegeben." });
            }
        }

        const stripTags = (html: string) => html.replace(/<\/?[^>]+(>|$)/g, "");
        const bodyText = stripTags(bodyHtml).trim();

        if (!subject || !bodyHtml) {
            return fail(400, { error: "Betreff und Nachricht sind Pflicht." });
        }

        let group: any = null;
        let members: any[] = [];

        if (groupId) {
            if (!hasPermission(locals.permissions ?? [], "groups.edit")) {
                throw error(403, "Keine Berechtigung");
            }
            group = await getGroup(groupId);
            if (!group) {
                throw error(404, "Gruppe nicht gefunden");
            }
            members = await getMembersByGroup(groupId);
        } else {
            if (!hasPermission(locals.permissions ?? [], "members.edit")) {
                throw error(403, "Keine Berechtigung");
            }
            const ids = memberIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
            members = await getMembersByIds(ids);
        }

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
        const reply = replyToForm || group?.replyTo || locals.user?.userinfo?.email || "";

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
