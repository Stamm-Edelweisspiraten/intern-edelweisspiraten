import { getAllGroups, deleteGroup } from "$lib/server/groupService";

export async function load() {
    const groups = await getAllGroups();
    return { groups };
}

export const actions = {
    delete: async ({ request }) => {
        const form = await request.formData();
        const id = form.get("id") as string;

        await deleteGroup(id);

        return { success: true };
    }
};
