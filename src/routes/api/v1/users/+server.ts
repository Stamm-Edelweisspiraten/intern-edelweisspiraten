import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { collection } from "$lib/server/api/pagination";
import { conflict, created, parseBody, unprocessable } from "$lib/server/api/respond";
import { userCreateSchema } from "$lib/server/api/schemas";
import { toPublicUser } from "$lib/server/api/publicUser";
import { createUser, getAllUsers } from "$lib/server/userService";

export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "user.view");
    if (denied) return denied;

    const users = await getAllUsers();

    return collection(users.map(toPublicUser));
};

/**
 * Einen Zugang anlegen.
 *
 * Der Zugang entsteht als `invited` und ohne Passwort. Die Einladung
 * verschickt diese Route NICHT: ein Fremdsystem legt Zugaenge oft im Voraus
 * an, und ein Zustellfehler duerfte die Anlage nicht scheitern lassen. Der
 * Versand erfolgt ueber die Detailseite ("Einladung erneut senden").
 */
export const POST: RequestHandler = async (event) => {
    const denied = requireScope(event, "user.create");
    if (denied) return denied;

    const body = await parseBody(event, userCreateSchema);
    if (!body.ok) return body.response!;

    const input = body.data!;
    const result = await createUser({
        name: input.name,
        email: input.email,
        type: input.type,
        roleIds: input.roleIds,
        memberIds: input.memberIds,
        status: input.status ?? "invited"
    });

    if (!result.ok || !result.user) {
        const message = result.error ?? "Der Zugang konnte nicht angelegt werden.";
        // Die belegte Adresse ist ein Konflikt mit dem Bestand, kein
        // Eingabefehler -- 409 statt 422.
        if (message.includes("existiert bereits")) return conflict(message);
        return unprocessable(message);
    }

    return created(
        { data: toPublicUser(result.user) },
        `${event.url.origin}/api/v1/users/${result.user.id}`
    );
};
