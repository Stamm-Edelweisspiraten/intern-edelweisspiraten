<script lang="ts">
    let name = "";
    let type = "meute";
    let meeting_time = "";
    let description = "";
</script>

<div class="max-w-3xl mx-auto mt-12">
    <h1 class="text-4xl font-bold mb-8">Neue Gruppe anlegen</h1>

    <form method="post" class="space-y-6">

        <div>
            <label class="font-medium">Name</label>
            <input
                    name="name"
                    bind:value={name}
                    required
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
        </div>

        <div>
            <label class="font-medium">Typ</label>
            <select
                    name="type"
                    bind:value={type}
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
                <option value="meute">Meute</option>
                <option value="sippe">Sippe</option>
            </select>
        </div>

        <div>
            <label class="font-medium">Gruppenstunden</label>
            <input
                    name="meeting_time"
                    placeholder="z. B. Monday 4:30 PM"
                    bind:value={meeting_time}
                    required
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
        </div>

        <div>
            <label class="font-medium">Beschreibung</label>
            <textarea
                    name="description"
                    bind:value={description}
                    rows="4"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            ></textarea>
        </div>

        <button
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow"
        >
            Gruppe erstellen
        </button>

    </form>
</div>
