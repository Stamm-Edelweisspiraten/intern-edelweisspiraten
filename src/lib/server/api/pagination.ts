import type { RequestEvent } from "@sveltejs/kit";
import { json } from "./respond";

/**
 * Seitenweise Ausgabe.
 *
 * Alle Listen der API antworten in derselben Form -- ein Fremdsystem muss die
 * Blaetterlogik damit genau einmal schreiben:
 *
 *   { "data": [...], "meta": { "page": 1, "per_page": 50, "total": 137,
 *                              "total_pages": 3 } }
 */

export const DEFAULT_PER_PAGE = 50;
export const MAX_PER_PAGE = 200;

export interface Pagination {
    page: number;
    perPage: number;
    offset: number;
}

export function readPagination(event: RequestEvent): Pagination {
    const page = Math.max(1, Number(event.url.searchParams.get("page") ?? 1) || 1);
    const requested = Number(event.url.searchParams.get("per_page") ?? DEFAULT_PER_PAGE);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, requested || DEFAULT_PER_PAGE));

    return { page, perPage, offset: (page - 1) * perPage };
}

export function paginated<T>(data: T[], total: number, pagination: Pagination): Response {
    const totalPages = Math.max(1, Math.ceil(total / pagination.perPage));

    return json(
        {
            data,
            meta: {
                page: pagination.page,
                per_page: pagination.perPage,
                total,
                total_pages: totalPages
            }
        },
        {
            headers: {
                "x-total-count": String(total),
                "x-page": String(pagination.page),
                "x-per-page": String(pagination.perPage)
            }
        }
    );
}

/** Fuer Listen ohne Blaettern -- gleiche Huelle, damit die Form einheitlich bleibt. */
export function collection<T>(data: T[]): Response {
    return json({
        data,
        meta: { page: 1, per_page: data.length, total: data.length, total_pages: 1 }
    });
}

/** Einzelne Ressource. */
export function resource<T>(data: T): Response {
    return json({ data });
}

/** Datumsangaben aus der Abfragezeichenkette, z. B. ?from=2026-01-01. */
export function readDate(event: RequestEvent, key: string): Date | null {
    const raw = event.url.searchParams.get(key);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}
