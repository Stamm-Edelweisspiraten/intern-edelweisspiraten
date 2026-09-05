import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { badRequest, notFound, parseBody } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { articleUpdateSchema } from "$lib/server/api/schemas";
import { getArticle, updateArticle } from "$lib/server/kaemmerer/articleService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.articles.manage");
    if (denied) return denied;

    const article = await getArticle(event.params.id);
    if (!article) return notFound("Der Artikel");

    return resource(article);
};

export const PATCH: RequestHandler = async (event) => {
    const denied = requireScope(event, "kaemmerer.articles.manage");
    if (denied) return denied;

    const body = await parseBody(event, articleUpdateSchema);
    if (!body.ok) return body.response!;

    const result = await updateArticle(event.params.id, body.data!);
    if (!result.ok) return badRequest(result.error ?? "Speichern fehlgeschlagen.");

    return resource(await getArticle(event.params.id));
};
