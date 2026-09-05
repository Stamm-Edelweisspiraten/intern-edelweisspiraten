import type { RequestEvent } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { matchesPermission } from "$lib/permissions/match";
import { RATE_LIMITS, rateLimitKey, registerFailure } from "$lib/server/auth/rateLimit";
import { resolveApiToken } from "./tokens";
import { forbidden, problem, serverError, tooManyRequests, unauthorized } from "./respond";

/**
 * Abzweig fuer /api im Hook.
 *
 * Der HTML-Gate leitet nicht angemeldete Zugriffe auf /login um. Fuer ein
 * Fremdsystem waere das die schlechteste aller Antworten: Status 200 mit
 * einer Anmeldeseite. Hier gilt deshalb: kein Token -> 401 als JSON.
 *
 * Oeffentlich sind nur die Selbstauskunft (/api/v1) und die
 * Schnittstellenbeschreibung (/api/v1/openapi.json).
 */

const PUBLIC_API_PATHS = new Set(["/api", "/api/v1", "/api/v1/", "/api/v1/openapi.json"]);

function corsOrigins(): string[] {
    return (env.API_CORS_ORIGINS ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/**
 * CORS-Kopfzeilen. Ohne API_CORS_ORIGINS wird kein Zugriff aus dem Browser
 * erlaubt -- ein pauschales "*" waere fuer eine API mit Schreibzugriff die
 * falsche Voreinstellung.
 */
function corsHeaders(event: RequestEvent): Record<string, string> {
    const origin = event.request.headers.get("origin");
    if (!origin) return {};

    const allowed = corsOrigins();
    if (!allowed.includes(origin)) return {};

    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600",
        vary: "Origin"
    };
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
    for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
    }
    return response;
}

export async function handleApiRequest(
    event: RequestEvent,
    resolve: (event: RequestEvent) => Response | Promise<Response>
): Promise<Response> {
    const cors = corsHeaders(event);

    if (event.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }

    const path = event.url.pathname;

    if (!PUBLIC_API_PATHS.has(path)) {
        const token = await resolveApiToken(event.request.headers.get("authorization"));

        if (!token) {
            // Fehlversuche je IP zaehlen, damit Tokens nicht durchprobiert
            // werden koennen.
            await registerFailure(rateLimitKey.ip(event.getClientAddress()), RATE_LIMITS.loginPerIp);
            return withHeaders(unauthorized(), cors);
        }

        const limit = await registerFailure(rateLimitKey.apiToken(token.id), RATE_LIMITS.api);
        if (!limit.allowed) {
            return withHeaders(tooManyRequests(limit.retryAfterSeconds), cors);
        }

        event.locals.apiToken = token;
        // Ein Token gilt immer stammesweit -- es haengt an keiner Gruppe.
        event.locals.permissions = token.scopes;
        event.locals.grants = token.scopes.map((permission) => ({ permission, groupId: null }));
    }

    try {
        const response = await resolve(event);
        return withHeaders(response, cors);
    } catch (err) {
        // SvelteKit-Fehler (error(), redirect()) durchreichen, alles andere
        // als 500 beantworten -- eine HTML-Fehlerseite waere hier nutzlos.
        const status = (err as { status?: number })?.status;
        if (typeof status === "number" && status >= 300 && status < 600) {
            const body = (err as { body?: { message?: string } })?.body;
            return withHeaders(
                problem({ status, title: body?.message ?? "Fehler" }),
                cors
            );
        }
        console.error("API-Fehler:", err);
        return withHeaders(serverError(), cors);
    }
}

/**
 * Erzwingt einen Scope innerhalb einer API-Route.
 *
 * Gibt eine fertige Antwort zurueck statt zu werfen, damit jede Route die
 * Pruefung sichtbar am Anfang stehen hat: `const denied = requireScope(...);
 * if (denied) return denied;`
 */
export function requireScope(event: RequestEvent, scope: string): Response | null {
    if (matchesPermission(event.locals.permissions, scope)) return null;
    return forbidden(scope);
}
