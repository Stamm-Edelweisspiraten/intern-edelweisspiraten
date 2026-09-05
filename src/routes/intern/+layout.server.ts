import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
    return {
        permissions: locals.permissions ?? [],
        user: locals.user,
        impersonator: locals.impersonator,
        theme: locals.theme
    };
};
