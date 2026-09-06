import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getGroup } from "$lib/server/groupService";
import {
    getMemberByEmail,
    getMembersByGroup,
    getMembersByIds,
    type Member
} from "$lib/server/memberService";
import { groupsWithPermission, requirePermissionForGroup } from "$lib/server/permissionGuard";
import { getPositionsByMemberIds } from "$lib/server/positionService";
import type { RequestEvent } from "./$types";

/**
 * Empfaenger aufloesen -- eine Stelle fuer das Laden und fuer den Versand.
 *
 * Vorher stand die Aufloesung zweimal im Modul, und im Zweig ueber
 * Mitgliedskennungen wurden Mitglieder ausserhalb der eigenen Zustaendigkeit
 * STILL weggefiltert: die Nachricht ging dann an weniger Empfaenger als
 * ausgewaehlt, ohne Hinweis. Jetzt wird abgewiesen.
 */
async function resolveRecipients(
    event: RequestEvent,
    input: { groupId?: string; memberIdsParam?: string }
): Promise<{ group: Awaited<ReturnType<typeof getGroup>>; members: Member[] }> {
    if (input.groupId) {
        const group = await getGroup(input.groupId);
        if (!group) throw error(404, "Gruppe nicht gefunden");

        requirePermissionForGroup(event, "groups.view", group.id);
        return { group, members: await getMembersByGroup(input.groupId) };
    }

    const ids = (input.memberIdsParam ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    if (ids.length === 0) throw error(400, "Keine Mitglieder ausgewählt");

    const members = await getMembersByIds(ids);
    const allowed = groupsWithPermission(event, "members.view");

    if (allowed !== null) {
        if (allowed.length === 0) throw error(403, "Keine Berechtigung");
        const outside = members.filter((m) => !m.groups.some((g) => allowed.includes(g)));
        if (outside.length > 0) {
            throw error(403, "Keine Berechtigung für diese Mitglieder");
        }
    }

    return { group: null, members };
}

export const load: PageServerLoad = async (event) => {
    const { url, locals } = event;
    const groupId = url.searchParams.get("group");
    const memberIdsParam = url.searchParams.get("members");

    if (!groupId && !memberIdsParam) {
        throw error(400, "Keine Gruppe oder Mitglieder ausgewählt");
    }

    const { group, members } = await resolveRecipients(event, {
        groupId: groupId ?? undefined,
        memberIdsParam: memberIdsParam ?? undefined
    });
    const mode: "group" | "members" = groupId ? "group" : "members";

    const userEmail = locals.user?.userinfo?.email ?? "";
    const replyToOptions: { label: string; email: string }[] = [];

    if (userEmail) {
        replyToOptions.push({ label: "Eigene E-Mail", email: userEmail });
    }

    const member = userEmail ? await getMemberByEmail(userEmail) : null;
    if (member) {
        const positions = await getPositionsByMemberIds([member.id]);
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
        members: members.map((m) => ({
            id: m.id,
            firstname: m.firstname,
            lastname: m.lastname,
            emails: m.emails
        }))
    };
};

export const actions: Actions = {
    sendMail: async (event) => {
        const { request, locals } = event;
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

        const { group, members } = await resolveRecipients(event, {
            groupId: groupId || undefined,
            memberIdsParam
        });

        const emails = new Set<string>();
        members.forEach((m) => {
            m.emails.forEach((e) => {
                if (e.email) emails.add(e.email);
            });
        });

        if (emails.size === 0) {
            return fail(400, { error: "Keine E-Mail-Adressen in dieser Gruppe." });
        }

        const { sendEmail, describeSmtpError, SmtpNotConfiguredError } = await import(
            "$lib/server/emailService"
        );
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

        /*
         * Je Empfaenger einzeln fangen.
         *
         * Vorher brach eine einzige abgelehnte Adresse den gesamten Restlauf
         * ab, und der Absender erfuhr nicht, wie weit der Versand gekommen
         * war -- bei einem Verteiler ueber mehrere Gruppen ist das der
         * Unterschied zwischen "nichts passiert" und "die Haelfte hat es
         * doppelt bekommen", sobald jemand es erneut versucht.
         */
        const failed: string[] = [];
        let sent = 0;

        for (const to of emails) {
            try {
                await sendEmail({
                    to,
                    from: fromAddress,
                    subject,
                    text: bodyText || bodyHtml,
                    html: bodyHtml,
                    replyTo: reply || undefined,
                    attachments
                });
                sent += 1;
            } catch (err) {
                // Ohne eingerichteten Versand scheitert jeder weitere
                // Empfaenger genauso -- dann gleich abbrechen und sagen, was
                // fehlt, statt hundertmal dieselbe Meldung zu sammeln.
                if (err instanceof SmtpNotConfiguredError) {
                    return fail(500, { error: describeSmtpError(err) });
                }

                console.error(`E-Mail an ${to} fehlgeschlagen:`, err);
                failed.push(to);
            }
        }

        if (sent === 0) {
            return fail(500, {
                error: `Keine der ${emails.size} Nachrichten konnte versendet werden.`
            });
        }

        if (failed.length > 0) {
            return {
                success: true,
                sent,
                failed,
                warning:
                    `${sent} von ${emails.size} Nachrichten versendet. ` +
                    `Nicht zugestellt: ${failed.join(", ")}.`
            };
        }

        return { success: true, sent };
    }
};
