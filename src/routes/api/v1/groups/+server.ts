import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { groupCreateSchema } from "$lib/server/api/schemas";
import { createGroup, getAllGroups } from "$lib/server/groupService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "groups.view");
    if (denied) return denied;
    return collection(await getAllGroups());
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "groups.create");
    if (denied) return denied;

    const body = await parseBody(event, groupCreateSchema);
    if (!body.ok) return body.response!;

    const group = await createGroup(body.data!);
    return created({ data: group }, `${event.url.origin}/api/v1/groups/${group.id}`);
};
