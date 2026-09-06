import type { RequestEvent } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { forbidden, noContent, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { memberUpdateSchema } from "$lib/server/api/schemas";
import { deleteMember, getMember, updateMember } from "$lib/server/memberService";
import { hasPermissionForAnyGroup } from "$lib/server/permissionService";

/** Einzelnes Mitglied. */

/**
 * Gruppenbezug wie im Web (requirePermissionForAnyGroup).
 *
 * Bewusst nicht der Guard aus $lib/server/permissionGuard: der wirft einen
 * SvelteKit-Fehler, hier soll die Antwort ein Problem-Dokument nach RFC 9457
 * bleiben und dem Muster "fertige Antwort zurueckgeben" folgen.
 *
 * Ein Mitglied kann in mehreren Gruppen sein; eine Zustaendigkeit genuegt.
 * Fuer Token-Zugriffe ist die Pruefung ein No-Op, weil die Scopes eines
 * Tokens stammesweit gelten (groupId: null).
 */
function denyByGroup(
    event: RequestEvent,
    permission: string,
    groupIds: readonly string[]
): Response | null {
    if (hasPermissionForAnyGroup(event.locals.grants ?? [], permission, groupIds)) return null;
    return forbidden(permission);
}

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.view");
    if (denied) return denied;

    const member = await getMember(event.params.id);
    if (!member) return notFound("Das Mitglied");

    const deniedGroup = denyByGroup(event, "members.view", member.groups);
    if (deniedGroup) return deniedGroup;

    return resource(member);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.edit");
    if (denied) return denied;

    const existing = await getMember(event.params.id);
    if (!existing) return notFound("Das Mitglied");

    const deniedGroup = denyByGroup(event, "members.edit", existing.groups);
    if (deniedGroup) return deniedGroup;

    const body = await parseBody(event, memberUpdateSchema);
    if (!body.ok) return body.response!;

    /*
     * Auch das ZIEL pruefen: sonst liesse sich ein Mitglied aus der eigenen
     * Zustaendigkeit in eine fremde Gruppe verschieben.
     */
    if (body.data!.groups !== undefined) {
        const deniedTarget = denyByGroup(event, "members.edit", body.data!.groups);
        if (deniedTarget) return deniedTarget;
    }

    const ok = await updateMember(
        event.params.id,
        body.data!,
        event.locals.apiToken?.name ?? "api"
    );
    if (!ok) return notFound("Das Mitglied");

    const member = await getMember(event.params.id);
    return resource(member);
};

export const DELETE: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.delete");
    if (denied) return denied;

    const target = await getMember(event.params.id);
    if (!target) return notFound("Das Mitglied");

    const deniedGroup = denyByGroup(event, "members.delete", target.groups);
    if (deniedGroup) return deniedGroup;

    const ok = await deleteMember(event.params.id, event.locals.apiToken?.name ?? "api");
    if (!ok) return notFound("Das Mitglied");

    return noContent();
};
