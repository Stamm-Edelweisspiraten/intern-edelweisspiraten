<script lang="ts">
    import { enhance } from "$app/forms";
    import type { SubmitFunction } from "@sveltejs/kit";

    export let data;

    let loading = false;

    const onSubmit: SubmitFunction = () => {
        loading = true;
    };
</script>

<div class="max-w-3xl mx-auto mt-12 p-10 bg-white rounded-2xl shadow-xl border border-gray-200">

    <h1 class="text-4xl font-bold mb-8 text-gray-900">
        Neuen Benutzer anlegen
    </h1>

    <form method="post" use:enhance={onSubmit} class="space-y-7">

        <!-- NAME -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
                    name="name"
                    type="text"
                    required
                    placeholder="Max Mustermann"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- EMAIL -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
                    name="email"
                    type="email"
                    required
                    placeholder="beispiel@mail.de"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
        </div>

        <!-- GROUPS -->
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
                Gruppen
            </label>

            <select
                    name="groups"
                    multiple
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                       focus:ring-2 focus:ring-blue-500 outline-none transition h-48"
            >
                {#each data.groups as group}
                    <option value={group.pk}>
                        {group.name}
                    </option>
                {/each}
            </select>

            <p class="text-xs text-gray-500 mt-1">
                Halte STRG (Windows/Linux) oder CMD (Mac), um mehrere auszuwählen.
            </p>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex items-center gap-4 pt-4">
            <a
                    href="/intern/admin/user"
                    class="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900
                       rounded-lg font-medium transition"
            >
                Abbrechen
            </a>

            <button
                    type="submit"
                    formaction="?/createUser"
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                       font-medium transition shadow"
                    disabled={loading}
            >
                {loading ? "Erstelle Benutzer..." : "Erstellen"}
            </button>
        </div>

    </form>

</div>
