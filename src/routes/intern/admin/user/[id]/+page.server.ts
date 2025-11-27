import type { Actions, PageServerLoad } from "./$types";
import { getUser, updateUser } from "$lib/server/userService";
import { getAllMembers } from "$lib/server/memberService";

export const load: PageServerLoad = async ({ params, url }) => {
    const user = await getUser(params.id);
    if (!user) throw new Error("User not found");

    const members = (await getAllMembers()).map((m) => ({
        id: m._id.toString(),
        firstname: m.firstname,
        lastname: m.lastname
    }));

    return {
        scope: url.searchParams.get("scope"),
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            memberId: user.memberId,
            createdAt: user.createdAt
        },
        members
    };
};

export const actions: Actions = {
    update: async ({ request }) => {
        const form = await request.formData();

        const id = form.get("id") as string;
        const name = form.get("name") as string;
        const email = form.get("email") as string;

        // WICHTIG: memberId korrekt auslesen
        let memberId = form.get("memberId") as string | null;

        // Wenn leer → Member entfernen
        if (!memberId || memberId.trim() === "") {
            memberId = null;
        }

        await updateUser(id, {
            name,
            email,
            memberId
        });

        return { success: true };
    }
};

