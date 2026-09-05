import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { created, parseBody } from "$lib/server/api/respond";
import { paginated, readPagination } from "$lib/server/api/pagination";
import { memberCreateSchema } from "$lib/server/api/schemas";
import { createMember, getAllMembers, searchMembers } from "$lib/server/memberService";

/** Mitglieder. */

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.view");
    if (denied) return denied;

    const query = event.url.searchParams.get("q") ?? "";
    const all = query ? await searchMembers(query) : await getAllMembers();

    const pagination = readPagination(event);
    const page = all.slice(pagination.offset, pagination.offset + pagination.perPage);

    return paginated(page, all.length, pagination);
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "members.create");
    if (denied) return denied;

    const body = await parseBody(event, memberCreateSchema);
    if (!body.ok) return body.response!;

    const member = await createMember({
        ...body.data!,
        updatedBy: event.locals.apiToken?.name ?? "api"
    });

    return created({ data: member }, `${event.url.origin}/api/v1/members/${member.id}`);
};
