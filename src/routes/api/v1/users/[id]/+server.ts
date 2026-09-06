import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { notFound } from "$lib/server/api/respond";
import { resource } from "$lib/server/api/pagination";
import { toPublicUser } from "$lib/server/api/publicUser";
import { getUser } from "$lib/server/userService";

/**
 * Einzelner Zugang, nur lesend.
 *
 * Die Route ist das Ziel der Location-Kopfzeile von `POST /api/v1/users` --
 * ohne sie zeigte ein 201 auf eine Adresse, die mit 404 antwortete.
 *
 * Aendern und Loeschen bleiben bewusst der Oberflaeche vorbehalten: beides
 * zieht Sitzungen, Rollen und den Rechte-Cache nach sich (siehe
 * `updateUser` und `deleteUser` in userService), und dafuer gibt es bisher
 * keinen Bedarf aus einem Fremdsystem. Wer sie ergaenzt, muss den
 * Selbstsperr-Schutz der Detailseite mit uebernehmen.
 */
export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "user.view");
    if (denied) return denied;

    const user = await getUser(event.params.id);
    if (!user) return notFound("Der Zugang");

    return resource(toPublicUser(user));
};
