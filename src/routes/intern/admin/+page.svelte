<script>
    export let data;
    import { can } from "$lib/can";

    const perms = data.permissions ?? [];

    const tiles = [
        {
            name: "Benutzerverwaltung",
            href: "/intern/admin/user",
            desc: "Benutzer anlegen, bearbeiten und löschen.",
            perm: "user.view"
        },
        {
            name: "Berechtigungen",
            href: "/intern/admin/permissions",
            desc: "Rollen und Zugriffsrechte verwalten.",
            perm: "system.settings.view"
        },
        {
            name: "Gruppen",
            href: "/intern/admin/groups",
            desc: "Meuten und Sippen verwalten.",
            perm: "groups.view"
        },
        {
            name: "Einstellungen",
            href: "/intern/admin/settings",
            desc: "Stammesdaten und Systemoptionen konfigurieren.",
            perm: "system.settings.view"
        }
    ];

    const visibleTiles = tiles.filter((t) => can(perms, t.perm));

    const hasAnyAdmin = visibleTiles.length > 0;
</script>

{#if hasAnyAdmin}
    <div class="max-w-5xl mx-auto mt-16">
        <h1 class="text-4xl font-bold text-gray-900 mb-10">
            Verwaltung
        </h1>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {#each visibleTiles as item}
                <a
                        href={item.href}
                        class="p-8 bg-white rounded-2xl shadow-md border border-gray-200
                       hover:shadow-lg hover:-translate-y-1 transition block"
                >
                    <h2 class="text-xl font-semibold text-gray-900 mb-2">• {item.name}</h2>
                    <p class="text-gray-600 text-sm">
                        {item.desc}
                    </p>
                </a>
            {/each}

            <div
                    class="p-8 bg-gray-50 rounded-2xl shadow-inner border border-dashed border-gray-300
                   cursor-not-allowed opacity-80 block"
            >
                <h2 class="text-xl font-semibold text-gray-900 mb-2">• Coming soon</h2>
                <p class="text-gray-600 text-sm">
                    Weitere Module folgen in Kürze.
                </p>
            </div>
        </div>
    </div>
{:else}
    <div class="max-w-3xl mx-auto mt-20 text-center">
        <div class="text-5xl mb-4">🔒</div>
        <h1 class="text-3xl font-bold mb-2">Keine passenden Admin-Rechte</h1>
        <p class="text-gray-600 mb-6">Du hast keinen Zugriff auf die Admin-Module.</p>
        <a href="/intern/dashboard" class="text-blue-600 font-semibold">Zurück zum Dashboard</a>
    </div>
{/if}
