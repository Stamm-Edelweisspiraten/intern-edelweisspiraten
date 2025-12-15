<script>
    export let data;
    import { can } from "$lib/can";

    const permissions = data.permissions ?? [];

    const baseNav = [
        { name: "Dashboard", href: "/intern/dashboard", icon: "speedometer2" },
        { name: "Termine", href: "/intern/termine", icon: "calendar-event" },
        { name: "Downloads", href: "/intern/downloads", icon: "cloud-download" },
        { name: "Kasse", href: "/intern/finance", icon: "wallet2" },
        { name: "Profil", href: "/intern/profil", icon: "person-circle" }
    ];

    const extraNav = [
        { name: "Kaemmerer", href: "/intern/kaemmerer", perm: "kaemmerer.access", icon: "piggy-bank" },
        { name: "Mitgliedverwaltung", href: "/intern/members", perm: "members.view", icon: "people" },
        { name: "Gruppen", href: "/intern/groups", perm: "groups.view", icon: "diagram-3" },
        { name: "Adminbereich", href: "/intern/admin", perm: "admin.view", icon: "gear-fill" }
    ];

    const visibleNav = [
        ...baseNav,
        ...extraNav.filter((item) => can(permissions, item.perm))
    ];

    let mobileOpen = false;
</script>

<div class="min-h-screen flex bg-transparent">

    <!-- Sidebar desktop -->
    <aside class="hidden lg:flex w-72 h-screen fixed left-0 top-0 bg-white border-r border-gray-200 shadow-sm flex-col">

        <!-- Header -->
        <div class="px-6 py-7 border-b border-gray-200">
            <h1 class="text-2xl font-bold text-blue-600 tracking-tight">Edelweisspiraten</h1>
            <p class="text-sm text-gray-500 mt-1">Interner Bereich</p>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {#each visibleNav as item}
                <a
                        href={item.href}
                        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium"
                >
                    <i class={`bi bi-${item.icon} text-lg text-gray-400`} aria-hidden="true"></i>
                    <span class="text-base">{item.name}</span>
                </a>
            {/each}
        </nav>

        <!-- Logout area fixed bottom -->
        <div class="p-4 border-t border-gray-200">
            <a
                    href="/logout"
                    class="block w-full text-center py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition"
            >
                Logout
            </a>
        </div>
    </aside>


    <!-- Mobile Header -->
    <header class="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm px-4 py-4 flex justify-between items-center z-30">
        <h1 class="text-xl font-bold text-blue-600">Intern</h1>

        <button
                class="p-2 rounded-lg bg-blue-50 text-blue-600"
                on:click={() => (mobileOpen = true)}
                aria-label="Menü öffnen"
        >
            <i class="bi bi-list text-2xl"></i>
        </button>
    </header>


    <!-- Mobile Sidebar -->
    <div class={`fixed inset-0 z-40 transition ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <div
                class={`absolute inset-0 bg-black bg-opacity-40 transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
                on:click={() => (mobileOpen = false)}
        ></div>

        <aside
                class={`fixed top-0 left-0 h-full w-full bg-white border-b border-gray-200 shadow-2xl p-5 z-50 transform transition-transform duration-200 ${mobileOpen ? "translate-y-0" : "-translate-y-full"}`}
        >
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold text-blue-600">Menü</h2>
                <button class="text-3xl leading-none" on:click={() => (mobileOpen = false)} aria-label="Menü schließen">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {#each visibleNav as item}
                    <a
                            href={item.href}
                            on:click={() => (mobileOpen = false)}
                            class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium transition border border-gray-100"
                    >
                        <i class={`bi bi-${item.icon} text-lg text-gray-400`} aria-hidden="true"></i>
                        <span>{item.name}</span>
                    </a>
                {/each}
            </div>

            <div class="mt-6">
                <a
                        href="/logout"
                        class="block w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-center"
                >
                    Logout
                </a>
            </div>
        </aside>
    </div>


    <!-- Main Content -->
    <main class="flex-1 p-6 pt-20 lg:pt-6 lg:ml-72">
        <div class="container">
            <slot/>
        </div>
    </main>

</div>
