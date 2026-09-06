import type { RequestHandler } from "./$types";
import { json } from "$lib/server/api/respond";
import { matchesPermission } from "$lib/permissions/match";
import { listTemplates } from "$lib/server/pdf/registry";
import { z } from "zod";

/**
 * Selbstbeschreibung der PDF-Vorlagen.
 *
 * Eine Gegenstelle kann so herausfinden, welche Vorlagen es gibt und welche
 * Angaben jede erwartet -- ohne dass jemand die Liste in einer Dokumentation
 * pflegt, die veraltet.
 *
 * Geliefert wird, was **dieses Token** erzeugen darf. Ein eigener Scope wird
 * dafür nicht verlangt: `handleApiRequest` weist jede Anfrage ohne gültiges
 * Token bereits mit 401 ab, und ein willkürlich gewählter Scope (vorher
 * `dashboard.view`) hätte ein Token mit `finance.view` von der Liste
 * ausgesperrt, obwohl es vier der Vorlagen benutzen kann.
 */
export const GET: RequestHandler = async (event) => {
    const scopes = event.locals.permissions ?? [];

    const templates = listTemplates().filter((template) =>
        matchesPermission(scopes, template.permission)
    );

    return json({
        data: templates.map((template) => ({
            name: template.name,
            title: template.title,
            description: template.description,
            permission: template.permission,
            /**
             * Das zod-Schema als JSON Schema. z.toJSONSchema gibt es seit
             * zod 4; fällt es aus, bleibt das Feld leer statt die ganze Liste
             * scheitern zu lassen.
             */
            schema: toJsonSchema(template.schema),
            endpoint: `/api/v1/pdf/${template.name}`
        })),
        meta: {
            /**
             * Damit ein Aufrufer eine leere Liste einordnen kann: sie heißt
             * nicht „es gibt keine Vorlagen“, sondern „dieses Token darf
             * keine erzeugen“.
             */
            total: templates.length,
            available: listTemplates().length
        }
    });
};

function toJsonSchema(schema: z.ZodType): unknown {
    try {
        return z.toJSONSchema(schema, { io: "input" });
    } catch {
        return null;
    }
}
