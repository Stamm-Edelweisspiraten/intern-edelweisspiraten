import crypto from "node:crypto";
import { error, fail, redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { Actions, PageServerLoad } from "./$types";
import { getMember } from "$lib/server/memberService";
import {
    createSignedToken,
    INVITE_MAX_AGE_SECONDS,
    INVITE_PURPOSE
} from "$lib/server/signedToken";
import { RATE_LIMITS, rateLimitKey, registerFailure, clearRateLimit, checkRateLimit } from "$lib/server/auth/rateLimit";

/**
 * Erster Schritt der Selbstregistrierung: Eingabe des Einladungscodes vom
 * ausgedruckten Einladungsschreiben.
 *
 * Bisher gab der load-Teil den sechsstelligen Code unauthentifiziert mit aus
 * -- wer die Adresse kannte, brauchte ihn also gar nicht. Zudem war die
 * Eingabe nicht begrenzt, sodass 10^6 Moeglichkeiten in kurzer Zeit
 * durchprobierbar waren, und der Code lief nie ab.
 */

export const load: PageServerLoad = async ({ params }) => {
    const member = await getMember(params.id);
    if (!member) throw error(404, "Einladung nicht gefunden");

    // Bewusst minimal: Name zur Bestaetigung, sonst nichts. Vorher wurden
    // hier Adresse, Geburtsdatum, alle E-Mail-Adressen und Telefonnummern
    // ohne jede Anmeldung ausgeliefert.
    return {
        member: {
            id: params.id,
            firstname: member.firstname,
            lastname: member.lastname
        }
    };
};

export const actions: Actions = {
    default: async ({ request, params, cookies, getClientAddress }) => {
        const memberId = params.id;
        const limitKey = rateLimitKey.invite(memberId, getClientAddress());

        const check = await checkRateLimit(limitKey, RATE_LIMITS.invite);
        if (!check.allowed) {
            return fail(429, {
                error: `Zu viele Versuche. Bitte in ${Math.ceil(check.retryAfterSeconds / 60)} Minuten erneut versuchen.`
            });
        }

        const form = await request.formData();
        const code = String(form.get("code") ?? "").replace(/\s+/g, "");

        const member = await getMember(memberId);
        if (!member) throw error(404, "Einladung nicht gefunden");

        const expected = member.inviteCode ?? "";
        const valid = expected.length > 0 && timingSafeEquals(expected, code);

        if (!valid) {
            const attempt = await registerFailure(limitKey, RATE_LIMITS.invite);
            return fail(400, {
                error: attempt.allowed
                    ? `Der Einladungscode ist nicht korrekt. Noch ${attempt.remaining} Versuche.`
                    : "Zu viele Fehlversuche. Bitte später erneut versuchen."
            });
        }

        if (member.inviteCodeExpiresAt && new Date(member.inviteCodeExpiresAt) < new Date()) {
            return fail(400, {
                error: "Dieser Einladungscode ist abgelaufen. Bitte wende dich an die Stammesführung."
            });
        }

        await clearRateLimit(limitKey);

        cookies.set(
            `join_verified_${memberId}`,
            createSignedToken({ purpose: INVITE_PURPOSE, memberId }, INVITE_MAX_AGE_SECONDS),
            {
                path: "/",
                httpOnly: true,
                secure: !dev,
                sameSite: "lax",
                maxAge: INVITE_MAX_AGE_SECONDS
            }
        );

        throw redirect(303, `/join/${memberId}/register`);
    }
};

/** Vergleich in konstanter Zeit, damit der Code nicht Stelle für Stelle erratbar ist. */
function timingSafeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
}
