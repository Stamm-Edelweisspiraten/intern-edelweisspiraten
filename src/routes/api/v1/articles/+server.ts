import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { created, parseBody } from "$lib/server/api/respond";
import { collection } from "$lib/server/api/pagination";
import { articleCreateSchema } from "$lib/server/api/schemas";
import { createArticle, listArticles } from "$lib/server/kaemmerer/articleService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.articles.manage");
    if (denied) return denied;

    return collection(await listArticles(event.url.searchParams.get("inactive") === "true"));
};

export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.articles.manage");
    if (denied) return denied;

    const body = await parseBody(event, articleCreateSchema);
    if (!body.ok) return body.response!;

    const article = await createArticle(body.data!);
    return created({ data: article }, `${event.url.origin}/api/v1/articles/${article.id}`);
};
