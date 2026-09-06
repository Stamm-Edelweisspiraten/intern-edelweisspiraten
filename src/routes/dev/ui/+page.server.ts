import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Die Galerie ist ausschliesslich im Entwicklungsmodus erreichbar. */
export const load: PageServerLoad = async () => {
    if (!dev) throw error(404, "Nicht gefunden");
    return {};
};
