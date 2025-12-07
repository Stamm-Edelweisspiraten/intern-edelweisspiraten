<script>
    export let data;
    import { can } from "$lib/can";

    const permissions = data.permissions ?? [];

    const baseNav = [
        { name: "Dashboard", href: "/intern/dashboard" },
        { name: "Termine", href: "/intern/termine" },
        { name: "Downloads", href: "/intern/downloads" },
        { name: "Profil", href: "/intern/profil" }
    ];

    const extraNav = [
        { name: "Mitgliedverwaltung", href: "/intern/members", perm: "members.view" },
        { name: "Gruppen", href: "/intern/groups", perm: "groups.view" },
        { name: "Adminbereich", href: "/intern/admin", perm: "admin.view" }
    ];

    const visibleNav = [
        ...baseNav,
        ...extraNav.filter((item) => can(permissions, item.perm))
    ];

    let mobileOpen = false;
</script>

<div class="min-h-screen flex bg-gray-50">

    <!-- Sidebar desktop -->
    <aside class="hidden md:flex w-64 h-screen fixed left-0 top-0 bg-white border-r border-gray-200 shadow-sm flex-col">

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
                    <span class="text-xl">•</span>
                    <span>{item.name}</span>
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
    <header class="md:hidden w-full bg-white border-b border-gray-200 shadow-sm px-4 py-4 flex justify-between items-center">
        <h1 class="text-xl font-bold text-blue-600">Intern</h1>

        <button
                class="p-2 rounded-lg bg-blue-50 text-blue-600"
                on:click={() => (mobileOpen = true)}
        >
            ☰
        </button>
    </header>


    <!-- Mobile Sidebar -->
    {#if mobileOpen}
        <div class="fixed inset-0 bg-black bg-opacity-40 z-40" on:click={() => (mobileOpen = false)}></div>

        <aside
                class="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 shadow-lg p-4 z-50 transform transition-transform duration-200"
        >
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold text-blue-600">Menü</h2>
                <button class="text-2xl" on:click={() => (mobileOpen = false)}>×</button>
            </div>

            {#each visibleNav as item}
                <a
                        href={item.href}
                        on:click={() => (mobileOpen = false)}
                        class="block px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium transition"
                >
                    {item.name}
                </a>
            {/each}

            <a
                    href="/logout"
                    class="block mt-6 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-center"
            >
                Logout
            </a>
        </aside>
    {/if}


    <!-- Main Content -->
    <main class="flex-1 p-6 md:ml-64">
        <slot/>
    </main>

</div>
