<script>
    export let data;

    const userinfo = data.user?.userinfo ?? {
        email: "",
        name: "",
        groups: []
    }
    const groups = data.user?.userinfo?.groups ?? [];
</script>

<div class="max-w-3xl mx-auto bg-white rounded-xl shadow p-8 space-y-8">

    <!-- HEADER -->
    <div>
        <h2 class="text-3xl font-bold text-gray-800 mb-2">
            Benutzerprofil
        </h2>
        <p class="text-gray-500">
            Übersicht aller Daten, die dein Authentik-Login übermittelt hat.
        </p>
    </div>

    <!-- BASISDATEN -->
    <section>
        <h3 class="text-xl font-semibold text-blue-700 mb-3">Allgemeine Daten</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div>
                <p class="text-sm text-gray-500">Name</p>
                <p class="text-gray-800 font-medium">
                    {userinfo?.name ?? "-"}
                </p>
            </div>

            <div>
                <p class="text-sm text-gray-500">E-Mail</p>
                <p class="text-gray-800 font-medium">
                    {userinfo.email ?? "–"}
                </p>
            </div>

        </div>
    </section>

    <!-- ROLLEN -->
    <section>
        <h3 class="text-xl font-semibold text-blue-700 mb-3">Rollen / Gruppen</h3>

        {#if groups.length > 0}
            <div class="flex flex-wrap gap-3">
                {#each groups as role}
                    <span class="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold shadow-sm capitalize">
                        {role}
                    </span>
                {/each}
            </div>
        {:else}
            <p class="text-gray-600">Keine Rollen zugewiesen.</p>
        {/if}
    </section>

    <!-- JWT TECHNISCHE DETAILS -->
    <section>
        <h3 class="text-xl font-semibold text-blue-700 mb-3">Technische JWT-Daten</h3>

        <div class="space-y-2">
            {#each Object.entries(userinfo) as [key, value]}
                {#if !["email", "name", "groups", "sub", "iss"].includes(key)}
                    <div class="bg-gray-50 px-4 py-3 rounded-md border border-gray-200">
                        <p class="text-sm text-gray-500">{key}</p>
                        <p class="text-gray-800 font-mono break-all text-sm">
                            {value}
                        </p>
                    </div>
                {/if}
            {/each}
        </div>
    </section>

</div>
