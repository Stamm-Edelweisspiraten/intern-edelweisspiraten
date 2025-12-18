import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getGroup } from "$lib/server/groupService";
import { getMemberByEmail, getMembersByGroup, getMembersByIds } from "$lib/server/memberService";
import { hasPermission, getLeaderGroupIdsForUser } from "$lib/server/permissionService";
import { getPositionsByMemberIds } from "$lib/server/positionService";

export const load: PageServerLoad = async ({ url, locals }) => {
    const perms = locals.permissions ?? [];
    const groupId = url.searchParams.get("group");
    const memberIdsParam = url.searchParams.get("members");

    let group = null;
    let members: any[] = [];
    let mode: "group" | "members" = "group";

    if (groupId) {
        const canAllGroups = hasPermission(perms, "groups.view");
        const canGroupGroups = hasPermission(perms, "groupleader.groups.view");
        if (!canAllGroups && !canGroupGroups) {
            throw error(403, "Keine Berechtigung");
        }
        group = await getGroup(groupId);
        if (!group) {
            throw error(404, "Gruppe nicht gefunden");
        }
        if (!canAllGroups) {
            const allowed = await getLeaderGroupIdsForUser(locals.user);
            if (!allowed.includes(group.id)) throw error(403, "Keine Berechtigung");
        }
        members = await getMembersByGroup(groupId);
        mode = "group";
    } else if (memberIdsParam) {
        const canAllMembers = hasPermission(perms, "members.view");
        const canGroupMembers = hasPermission(perms, "groupleader.members.view");
        if (!canAllMembers && !canGroupMembers) {
            throw error(403, "Keine Berechtigung");
        }
        const ids = memberIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
        if (ids.length === 0) {
            throw error(400, "Keine Mitglieder ausgewählt");
        }
        members = await getMembersByIds(ids);
        if (!canAllMembers) {
            const allowed = await getLeaderGroupIdsForUser(locals.user);
            members = members.filter((m: any) => (m.groups ?? []).some((g: any) => allowed.includes(g?.toString?.() ?? g)));
            if (members.length === 0) {
                throw error(403, "Keine Berechtigung für diese Mitglieder");
            }
        }
        mode = "members";
    } else {
        throw error(400, "Keine Gruppe oder Mitglieder ausgewählt");
    }

    const userEmail = locals.user?.userinfo?.email ?? "";
    const replyToOptions: { label: string; email: string }[] = [];

    if (userEmail) {
        replyToOptions.push({ label: "Eigene E-Mail", email: userEmail });
    }

    const member = userEmail ? await getMemberByEmail(userEmail) : null;
    if (member?._id) {
        const memberIdStr = member._id.toString();
        const positions = await getPositionsByMemberIds([memberIdStr]);
        positions.forEach((p) => {
            if (p.email) {
                replyToOptions.push({
                    label: p.name,
                    email: p.email
                });
            }
        });
    }

    return {
        group,
        mode,
        replyToDefault: replyToOptions[0]?.email ?? group?.replyTo ?? userEmail ?? "",
        replyToOptions,
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
            const canAllGroups = hasPermission(locals.permissions ?? [], "groups.view");
            const canGroupGroups = hasPermission(locals.permissions ?? [], "groupleader.groups.view");
            if (!canAllGroups && !canGroupGroups) {
                throw error(403, "Keine Berechtigung");
            }
            group = await getGroup(groupId);
            if (!group) {
                throw error(404, "Gruppe nicht gefunden");
            }
            if (!canAllGroups) {
                const allowed = await getLeaderGroupIdsForUser(locals.user);
                if (!allowed.includes(group.id)) throw error(403, "Keine Berechtigung");
            }
            members = await getMembersByGroup(groupId);
        } else {
            const canAllMembers = hasPermission(locals.permissions ?? [], "members.view");
            const canGroupMembers = hasPermission(locals.permissions ?? [], "groupleader.members.view");
            if (!canAllMembers && !canGroupMembers) {
                throw error(403, "Keine Berechtigung");
            }
            const ids = memberIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
            members = await getMembersByIds(ids);
            if (!canAllMembers) {
                const allowed = await getLeaderGroupIdsForUser(locals.user);
                members = members.filter((m: any) => (m.groups ?? []).some((g: any) => allowed.includes(g?.toString?.() ?? g)));
                if (members.length === 0) {
                    throw error(403, "Keine Berechtigung für diese Mitglieder");
                }
            }
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
        const fromAddress = reply || undefined;

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
                from: fromAddress,
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
