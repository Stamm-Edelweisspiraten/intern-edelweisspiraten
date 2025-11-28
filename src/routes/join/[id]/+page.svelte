<script lang="ts">
    export let data;
    export let form;
</script>

<div class="max-w-md mx-auto mt-20 p-8 bg-white rounded-xl shadow border">
    <h1 class="text-3xl font-bold mb-6 text-center">
        Beitritt für {data.member.firstname} {data.member.lastname}
    </h1>

    <form method="post" class="space-y-6">

        <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">
                Einladungscode
            </label>
            <input
                    type="text"
                    name="code"
                    maxlength="6"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50"
                    placeholder="z.B. 927341"
                    required
            />
        </div>

        {#if form?.error}
            <p class="text-red-600 text-center">{form.error}</p>
        {/if}

        <button
                type="submit"
                class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
            Weiter
        </button>
    </form>
</div>
