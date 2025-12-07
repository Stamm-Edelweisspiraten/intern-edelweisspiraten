<script lang="ts">
    export let data;

    let editing = data.scope === "edit";

    let name = data.group?.name ?? "";
    let type = data.group?.type ?? "meute";
    let meeting_time = data.group?.meeting_time ?? "";
    let description = data.group?.description ?? "";
    let replyTo = data.group?.replyTo ?? "";
</script>

<div class="max-w-3xl mx-auto mt-12">

    <h1 class="text-4xl font-bold mb-8">
        {editing ? "Gruppe bearbeiten" : "Gruppe ansehen"}
    </h1>

    <form method="post" action="?/update" class="space-y-6">

        <!-- Name -->
        <div>
            <label class="font-medium">Name</label>
            <input
                    name="name"
                    bind:value={name}
                    required
                    disabled={!editing}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                    disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
            />
        </div>

        <!-- Typ -->
        <div>
            <label class="font-medium">Typ</label>
            <select
                    name="type"
                    bind:value={type}
                    required
                    disabled={!editing}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                    disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
            >
                <option value="meute">Meute</option>
                <option value="sippe">Sippe</option>
            </select>
        </div>

        <!-- Gruppenstunden -->
        <div>
            <label class="font-medium">Gruppenstunden</label>
            <input
                    name="meeting_time"
                    bind:value={meeting_time}
                    required
                    disabled={!editing}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                    disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
            />
        </div>

        <!-- Reply-To -->
        <div>
            <label class="font-medium">Reply-To (Pflicht für Mails)</label>
            <input
                    type="email"
                    name="replyTo"
                    bind:value={replyTo}
                    required
                    disabled={!editing}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                    disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
            />
        </div>

        <!-- Beschreibung -->
        <div>
            <label class="font-medium">Beschreibung</label>
            <textarea
                    name="description"
                    rows="4"
                    bind:value={description}
                    disabled={!editing}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white
                    disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-300"
            ></textarea>
        </div>

        <!-- BUTTONS -->
        <div class="pt-4 flex justify-between">
            {#if editing}
                <!-- SPEICHERN -->
                <button
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
                >
                    Speichern
                </button>

                <a
                        href="../{data.group.id}"
                        class="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg shadow"
                >
                    Abbrechen
                </a>
            {:else}
                <a
                        href="?scope=edit"
                        data-sveltekit-reload
                        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
                >
                    Bearbeiten
                </a>
            {/if}
        </div>

    </form>

</div>
