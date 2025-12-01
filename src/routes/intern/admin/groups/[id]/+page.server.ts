import { getGroup, updateGroup } from "$lib/server/groupService";

export async function load({ params, url }) {
    const group = await getGroup(params.id);

    if (!group) {
        return {
            group: null,
            scope: null
        };
    }

    return {
        group,
        scope: url.searchParams.get("scope")  // "edit" oder null
    };
}

export const actions = {
    update: async ({ params, request }) => {
        const form = await request.formData();

        await updateGroup(params.id, {
            name: form.get("name"),
            type: form.get("type") as "sippe" | "meute",
            meeting_time: form.get("meeting_time"),
            description: form.get("description")
        });

        return { success: true };
    }
};
