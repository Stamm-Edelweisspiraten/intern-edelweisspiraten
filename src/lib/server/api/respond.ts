import type { RequestEvent } from "@sveltejs/kit";
import { z } from "zod";

/**
 * Einheitliche Antworten der REST-API.
 *
 * Fehler folgen RFC 9457 (Problem Details): ein JSON-Objekt mit type, title,
 * status und detail. Damit weiss eine Gegenstelle ohne Absprache, wo die
 * Fehlermeldung steht -- die Alternative waeren die ueblichen frei erfundenen
 * Fehlerformate, die jedes Fremdsystem einzeln lernen muss.
 */

const PROBLEM_TYPE = "https://datatracker.ietf.org/doc/html/rfc9457";

export interface ProblemOptions {
    status: number;
    title: string;
    detail?: string;
    /** Feldbezogene Fehler bei einer fehlgeschlagenen Pruefung. */
    errors?: Record<string, string[]>;
    headers?: Record<string, string>;
}

export function problem(options: ProblemOptions): Response {
    return new Response(
        JSON.stringify({
            type: PROBLEM_TYPE,
            title: options.title,
            status: options.status,
            ...(options.detail ? { detail: options.detail } : {}),
            ...(options.errors ? { errors: options.errors } : {})
        }),
        {
            status: options.status,
            headers: {
                "content-type": "application/problem+json; charset=utf-8",
                "cache-control": "no-store",
                ...(options.headers ?? {})
            }
        }
    );
}

export const badRequest = (detail: string) =>
    problem({ status: 400, title: "Ungültige Anfrage", detail });

export const unauthorized = (detail = "Es wurde kein gültiges Token übermittelt.") =>
    problem({
        status: 401,
        title: "Nicht angemeldet",
        detail,
        headers: { "www-authenticate": 'Bearer realm="api"' }
    });

export const forbidden = (scope: string) =>
    problem({
        status: 403,
        title: "Keine Berechtigung",
        detail: `Für diesen Zugriff wird die Berechtigung „${scope}“ benötigt.`
    });

export const notFound = (what = "Der angeforderte Eintrag") =>
    problem({ status: 404, title: "Nicht gefunden", detail: `${what} existiert nicht.` });

export const methodNotAllowed = (allowed: string[]) =>
    problem({
        status: 405,
        title: "Methode nicht erlaubt",
        headers: { allow: allowed.join(", ") }
    });

export const conflict = (detail: string) =>
    problem({ status: 409, title: "Konflikt", detail });

export const unprocessable = (detail: string, errors?: Record<string, string[]>) =>
    problem({ status: 422, title: "Eingabe nicht verarbeitbar", detail, errors });

export const tooManyRequests = (retryAfterSeconds: number) =>
    problem({
        status: 429,
        title: "Zu viele Anfragen",
        detail: `Bitte in ${retryAfterSeconds} Sekunden erneut versuchen.`,
        headers: { "retry-after": String(retryAfterSeconds) }
    });

export const serverError = (detail = "Unerwarteter Fehler.") =>
    problem({ status: 500, title: "Serverfehler", detail });

// ---------------------------------------------------------------------------
// Erfolgsantworten
// ---------------------------------------------------------------------------

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    return new Response(JSON.stringify(data), {
        status: init.status ?? 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...(init.headers ?? {})
        }
    });
}

export function created(data: unknown, location?: string) {
    return json(data, { status: 201, headers: location ? { location } : {} });
}

export function noContent() {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

// ---------------------------------------------------------------------------
// Eingabe lesen und pruefen
// ---------------------------------------------------------------------------

export interface ParsedBody<T> {
    ok: boolean;
    data?: T;
    response?: Response;
}

/**
 * Liest den JSON-Rumpf und prueft ihn gegen ein Schema.
 *
 * Bei einem Fehler kommt eine fertige Antwort zurueck statt einer Ausnahme --
 * so bleibt jede Route ein geradliniges `if (!body.ok) return body.response`.
 */
export async function parseBody<T>(
    event: RequestEvent,
    schema: z.ZodType<T>
): Promise<ParsedBody<T>> {
    const contentType = event.request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        return {
            ok: false,
            response: badRequest("Der Rumpf muss als application/json gesendet werden.")
        };
    }

    let raw: unknown;
    try {
        raw = await event.request.json();
    } catch {
        return { ok: false, response: badRequest("Der Rumpf ist kein gültiges JSON.") };
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of result.error.issues) {
            const key = issue.path.join(".") || "_";
            errors[key] = [...(errors[key] ?? []), issue.message];
        }
        return {
            ok: false,
            response: unprocessable("Die Eingabe ist unvollständig oder fehlerhaft.", errors)
        };
    }

    return { ok: true, data: result.data };
}
