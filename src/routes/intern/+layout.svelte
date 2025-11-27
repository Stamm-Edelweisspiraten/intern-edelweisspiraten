<script>
    export let data;
    import { can } from "$lib/can";

    // Navigation
    const navItems = [
        { name: "Dashboard", href: "/intern/dashboard", icon: "🏠" },
        { name: "Termine", href: "/intern/termine", icon: "📅" },
        { name: "Downloads", href: "/intern/downloads", icon: "📁" },
        { name: "Profil", href: "/intern/profil", icon: "👤" }
    ];

    let mobileOpen = false;
</script>

<div class="min-h-screen flex bg-gray-50">


    <!-- Sidebar desktop -->
    <aside class="hidden md:flex w-64 bg-white border-r border-gray-200 shadow-sm flex-col">

        <!-- Logo & Header -->
        <div class="px-6 py-7 border-b border-gray-200">
            <h1 class="text-2xl font-bold text-blue-600 tracking-tight">
                Edelweißpiraten
            </h1>
            <p class="text-sm text-gray-500 mt-1">
                Interner Bereich
            </p>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-1">
            {#each navItems as item}
                <a
                        href={item.href}
                        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium"
                >
                    <span class="text-xl">{item.icon}</span>
                    <span>{item.name}</span>
                </a>
            {/each}

            <!-- {#if can(data.permissions, "members.view")} -->
                <a
                        href="/intern/members"
                        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium"
                >
                    <span class="text-xl">👥</span>
                    <span>Mitgliedverwaltung</span>
                </a>
            <!-- {/if} -->

            <!-- {#if can(data.permissions, "admin.view")} -->
                <a
                        href="/intern/admin"
                        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium"
                >
                    <span class="text-xl">⚙️</span>
                    <span>Adminbereich</span>
                </a>
            <!-- {/if} -->

        </nav>

        <!-- Logout -->
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
                on:click={() => (mobileOpen = !mobileOpen)}
        >
            ☰
        </button>
    </header>

    <!-- Mobile Sidebar -->
    {#if mobileOpen}
        <aside
                class="md:hidden absolute top-16 left-0 right-0 bg-white border-b border-gray-200 shadow-lg p-4 z-50"
        >
            {#each navItems as item}
                <a
                        href={item.href}
                        class="block px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-medium transition"
                >
                    {item.icon} {item.name}
                </a>
            {/each}

            <a
                    href="/logout"
                    class="block mt-4 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-center"
            >
                Logout
            </a>
        </aside>
    {/if}

    <!-- Main Content -->
    <main class="flex-1 p-6">
        <slot />
    </main>

</div>
