import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { noContent, notFound, parseBody } from "$lib/server/api/respond";
import { collection, resource } from "$lib/server/api/pagination";
import { groupUpdateSchema } from "$lib/server/api/schemas";
import { deleteGroup, getGroup, updateGroup } from "$lib/server/groupService";
import { getMembersByGroup } from "$lib/server/memberService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "groups.view");
    if (denied) return denied;

    const group = await getGroup(event.params.id);
    if (!group) return notFound("Die Gruppe");

    // Auf Wunsch mit Mitgliedern: ?include=members
    if (event.url.searchParams.get("include") === "members") {
        const members = await getMembersByGroup(group.id);
        return resource({ ...group, members });
    }

    return resource(group);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "groups.edit");
    if (denied) return denied;

    const body = await parseBody(event, groupUpdateSchema);
    if (!body.ok) return body.response!;

    const ok = await updateGroup(event.params.id, body.data!);
    if (!ok) return notFound("Die Gruppe");

    return resource(await getGroup(event.params.id));
};

export const DELETE: RequestHandler = async (event) => {
    const denied = requireScope(event, "groups.delete");
    if (denied) return denied;

    const ok = await deleteGroup(event.params.id);
    if (!ok) return notFound("Die Gruppe");

    return noContent();
};
