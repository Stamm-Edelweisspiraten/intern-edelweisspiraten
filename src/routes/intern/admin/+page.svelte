<script>
    export let data;
    import { can } from "$lib/can";

    const perms = data.permissions ?? [];

    const tiles = [
        {
            name: "Benutzerverwaltung",
            href: "/intern/admin/user",
            desc: "Benutzer anlegen, bearbeiten und löschen.",
            perm: "user.view",
            icon: "people-fill"
        },
        {
            name: "Berechtigungen",
            href: "/intern/admin/permissions",
            desc: "Rollen und Zugriffsrechte verwalten.",
            perm: "system.settings.view",
            icon: "shield-lock-fill"
        },
        {
            name: "Gruppen",
            href: "/intern/admin/groups",
            desc: "Meuten und Sippen verwalten.",
            perm: "groups.view",
            icon: "diagram-3-fill"
        },
        {
            name: "Ämter",
            href: "/intern/admin/position",
            desc: "Ämter anlegen, zuordnen und löschen.",
            perm: "admin.view",
            icon: "briefcase-fill"
        },
        {
            name: "Einstellungen",
            href: "/intern/admin/settings",
            desc: "Stammesdaten und Systemoptionen konfigurieren.",
            perm: "system.settings.view",
            icon: "gear-fill"
        }
    ];

    const visibleTiles = tiles.filter((t) => can(perms, t.perm));
    const hasAnyAdmin = visibleTiles.length > 0;
</script>

{#if hasAnyAdmin}
    <div class="max-w-6xl mx-auto mt-16 space-y-8">
        <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
                <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Admin</p>
                <h1 class="text-4xl font-bold text-gray-900">Verwaltung</h1>
                <p class="text-sm text-gray-600 mt-1">Zentrale Module für Benutzer, Rechte und Stammesverwaltung.</p>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each visibleTiles as item}
                <a
                        href={item.href}
                        class="group p-6 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div class="p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                            <span class={`bi bi-${item.icon} text-xl`}></span>
                        </div>
                        <span class="bi bi-arrow-right-short text-2xl text-gray-400 group-hover:text-blue-600 transition"></span>
                    </div>
                    <h2 class="mt-4 text-xl font-semibold text-gray-900">{item.name}</h2>
                    <p class="mt-2 text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                </a>
            {/each}

            <div class="p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-300 shadow-inner opacity-90">
                <div class="flex items-center gap-3">
                    <div class="p-3 rounded-xl bg-gray-100 text-gray-500 border border-gray-200">
                        <span class="bi bi-box-seam text-xl"></span>
                    </div>
                    <h2 class="text-xl font-semibold text-gray-800">Coming soon</h2>
                </div>
                <p class="mt-2 text-sm text-gray-600">Weitere Module folgen.</p>
            </div>
        </div>
    </div>
{:else}
    <div class="max-w-3xl mx-auto mt-20 text-center space-y-4">
        <div class="text-5xl mb-2">🔒</div>
        <h1 class="text-3xl font-bold">Keine passenden Admin-Rechte</h1>
        <p class="text-gray-600">Du hast keinen Zugriff auf die Admin-Module.</p>
        <a href="/intern/dashboard" class="text-blue-600 font-semibold">Zurück zum Dashboard</a>
    </div>
{/if}
