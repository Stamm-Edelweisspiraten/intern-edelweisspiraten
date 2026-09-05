import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { noContent, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { memberUpdateSchema } from "$lib/server/api/schemas";
import { deleteMember, getMember, updateMember } from "$lib/server/memberService";

/** Einzelnes Mitglied. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.view");
    if (denied) return denied;

    const member = await getMember(event.params.id);
    if (!member) return notFound("Das Mitglied");

    return resource(member);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.edit");
    if (denied) return denied;

    const body = await parseBody(event, memberUpdateSchema);
    if (!body.ok) return body.response!;

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

    const ok = await deleteMember(event.params.id, event.locals.apiToken?.name ?? "api");
    if (!ok) return notFound("Das Mitglied");

    return noContent();
};
