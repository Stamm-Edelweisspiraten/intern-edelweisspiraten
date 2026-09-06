import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { created, forbidden, parseBody } from "$lib/server/api/respond";
import { paginated, readPagination } from "$lib/server/api/pagination";
import { memberCreateSchema } from "$lib/server/api/schemas";
import { createMember, getAllMembers, searchMembers } from "$lib/server/memberService";
import { groupsForPermission } from "$lib/server/permissionService";

/**
 * Mitglieder.
 *
 * requireScope prueft nur die flache Scope-Liste. Im Web gilt zusaetzlich der
 * Gruppenbezug: wer members.view nur fuer eine Meute besitzt, sieht auch nur
 * deren Mitglieder. Damit API und Web dieselbe Regel haben, wird der
 * Gruppenbezug hier nachgezogen.
 *
 * Fuer Token-Zugriffe ist das ein No-Op -- handleApiRequest legt die Scopes
 * eines Tokens stammesweit ab (groupId: null), groupsForPermission liefert
 * dann null. Die Pruefung greift erst, falls die API je einer Sitzung
 * offensteht; sie kann den Zugriff nie erweitern, nur einschraenken.
 */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.view");
    if (denied) return denied;

    // null = stammesweit (nicht filtern), [] = kein Recht, sonst: nur diese.
    const allowedGroups = groupsForPermission(event.locals.grants ?? [], "members.view");
    if (allowedGroups !== null && allowedGroups.length === 0) return forbidden("members.view");

    const query = event.url.searchParams.get("q") ?? "";
    const found = query ? await searchMembers(query) : await getAllMembers();

    const all =
        allowedGroups === null
            ? found
            : found.filter((member) =>
                  member.groups.some((groupId) => allowedGroups.includes(groupId))
              );

    const pagination = readPagination(event);
    const page = all.slice(pagination.offset, pagination.offset + pagination.perPage);

    return paginated(page, all.length, pagination);
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.create");
    if (denied) return denied;

    const body = await parseBody(event, memberCreateSchema);
    if (!body.ok) return body.response!;

    /*
     * Wie im Web (src/routes/intern/members/create): angelegt werden darf nur
     * in Gruppen, fuer die das Recht gilt.
     */
    const creatableGroups = groupsForPermission(event.locals.grants ?? [], "members.create");
    const targetGroups = body.data!.groups ?? [];
    if (
        creatableGroups !== null &&
        !targetGroups.some((groupId) => creatableGroups.includes(groupId))
    ) {
        return forbidden("members.create");
    }

    const member = await createMember({
        ...body.data!,
        updatedBy: event.locals.apiToken?.name ?? "api"
    });

    return created({ data: member }, `${event.url.origin}/api/v1/members/${member.id}`);
};
