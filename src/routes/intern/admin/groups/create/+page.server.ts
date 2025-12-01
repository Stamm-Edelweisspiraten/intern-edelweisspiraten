import { createGroup } from "$lib/server/groupService";

export const actions = {
    default: async ({ request }) => {
        const form = await request.formData();

        await createGroup({
            name: form.get("name") as string,
            type: form.get("type") as "meute" | "sippe",
            meeting_time: form.get("meeting_time") as string,
            description: form.get("description") as string
        });

        return { success: true };
    }
};
