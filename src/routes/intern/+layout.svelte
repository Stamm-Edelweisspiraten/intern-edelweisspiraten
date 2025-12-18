<script lang="ts">
    export let data;
    import { can } from "$lib/can";
    import { onMount } from "svelte";
    import InternalFooter from "$lib/components/InternalFooter.svelte";

    const permissions = data.permissions ?? [];
    const impersonationActive = !!data.impersonator;

    let bannerEl: HTMLDivElement | null = null;
    let bannerHeight = 0;
    $: impersonationOffset = impersonationActive ? bannerHeight : 0;

    const baseNav = [
        { name: "Dashboard", href: "/intern/dashboard", icon: "speedometer2", perm: "dashboard.view" },
        { name: "Termine", href: "/intern/termine", icon: "calendar-event" },
        { name: "Downloads", href: "/intern/downloads", icon: "cloud-download" }
    ];

    const extraNav = [
        { name: "Kaemmerer", href: "/intern/kaemmerer", perm: "kaemmerer.access", icon: "piggy-bank" },
        { name: "Mitgliedverwaltung", href: "/intern/members", perm: "members.view", icon: "people" },
        { name: "Gruppen", href: "/intern/groups", perm: "groups.view", icon: "diagram-3" },
        { name: "Kasse", href: "/intern/finance", perm: "finance.view", icon: "wallet2" },
        { name: "Adminbereich", href: "/intern/admin", perm: "admin.view", icon: "gear-fill" }
    ];

    const canViewMembers = can(permissions, "members.view") || can(permissions, "members.group.view");
    const canViewGroups = can(permissions, "groups.view") || can(permissions, "groups.group.view");

    const visibleNav = [
        ...baseNav.filter((item) => !item.perm || can(permissions, item.perm)),
        ...extraNav.filter((item) => {
            if (item.name === "Mitgliedverwaltung") return canViewMembers;
            if (item.name === "Gruppen") return canViewGroups;
            return can(permissions, item.perm);
        })
    ];

    let mobileOpen = false;
    let collapsed = false;

    const measureBanner = () => {
        bannerHeight = bannerEl?.offsetHeight ?? 0;
    };

    onMount(() => {
        measureBanner();
        const onResize = () => measureBanner();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });

    $: if (impersonationActive) {
        measureBanner();
    } else {
        bannerHeight = 0;
    }
</script>

<svelte:head>
    <title>Intern - Stamm Edelweisspiraten</title>
</svelte:head>

<div class="min-h-screen flex bg-transparent" style={`padding-top:${impersonationOffset}px;`}>
    {#if data.impersonator}
        <div class="fixed top-0 left-0 right-0 z-50 bg-amber-100 border-b border-amber-200 text-amber-900" bind:this={bannerEl}>
            <div class="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-center gap-3">
                    <span class="bi bi-person-badge-fill text-amber-700"></span>
                    <div>
                        <p class="text-sm font-semibold">Impersonation aktiv</p>
                        <p class="text-xs text-amber-800">
                            Du siehst den internen Bereich als {data.user?.userinfo?.name ?? data.user?.userinfo?.email}. Original: {data.impersonator?.name ?? data.impersonator?.email}
                        </p>
                    </div>
                </div>
                <form method="post" action="/intern/impersonate/stop" class="flex items-center gap-2 w-full sm:w-auto">
                    <button
                            type="submit"
                            class="inline-flex items-center gap-2 px-4 py-2 w-full sm:w-auto justify-center text-center bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold shadow-sm"
                    >
                        <span class="bi bi-arrow-counterclockwise"></span>
                        Zurueck zu meinem Benutzer
                    </button>
                </form>
            </div>
        </div>
    {/if}

    <!-- Sidebar desktop -->
    <aside
            class={`hidden lg:flex ${collapsed ? "w-20" : "w-72"} fixed left-0 bg-white border-r border-gray-200 shadow-sm flex-col transition-all duration-200`}
            style={`top:${impersonationOffset}px; height: calc(100vh - ${impersonationOffset}px);`}
    >

        <!-- Header -->
        <div class={`px-4 py-6 border-b border-gray-200 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
            <div class={`${collapsed ? "text-center" : ""}`}>
                <h1 class={`font-bold text-blue-600 tracking-tight ${collapsed ? "text-xl" : "text-2xl"}`}>{collapsed ? "EP" : "Edelweisspiraten"}</h1>
                {#if !collapsed}
                    <p class="text-sm text-gray-500 mt-1">Interner Bereich</p>
                {/if}
            </div>
            <button
                    class="hidden lg:inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                    on:click={() => (collapsed = !collapsed)}
                    aria-label={collapsed ? "Sidebar oeffnen" : "Sidebar einklappen"}
            >
                <i class={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-left"}`}></i>
            </button>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {#each visibleNav as item}
                <a
                        href={item.href}
                        class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium"
                        title={collapsed ? item.name : ""}
                >
                    <i class={`bi bi-${item.icon} text-lg text-gray-400`} aria-hidden="true"></i>
                    <span class={`text-base ${collapsed ? "hidden" : "block"}`}>{item.name}</span>
                </a>
            {/each}
        </nav>

        <!-- Logout area fixed bottom -->
        <div class="p-4 border-t border-gray-200 space-y-2">
            <a
                    href="/intern/profil"
                    class="flex items-center justify-center gap-2 w-full text-center py-3 bg-white hover:bg-gray-50 text-gray-800 rounded-lg font-semibold transition border border-gray-200"
                    title={collapsed ? "Profil" : ""}
            >
                <span class="bi bi-person-circle"></span> <span class={collapsed ? "hidden" : "inline"}>Profil</span>
            </a>
            <a
                    href="/logout"
                    class="flex items-center justify-center gap-2 w-full text-center py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold transition shadow-md drop-shadow-[0_4px_10px_rgba(239,68,68,0.35)]"
                    title={collapsed ? "Logout" : ""}
            >
                <span class="bi bi-box-arrow-right"></span> <span class={collapsed ? "hidden" : "inline"}>Logout</span>
            </a>
        </div>
    </aside>


    <!-- Mobile Header -->
    <header class="lg:hidden fixed left-0 right-0 bg-white border-b border-gray-200 shadow-sm px-4 py-4 flex justify-between items-center z-40"
            style={`top:${impersonationOffset}px;`}>
        <h1 class="text-xl font-bold text-blue-600">Intern</h1>

        <button
                class="p-2 rounded-lg bg-blue-50 text-blue-600"
                on:click={() => (mobileOpen = true)}
                aria-label="Menue oeffnen"
        >
            <i class="bi bi-list text-2xl"></i>
        </button>
    </header>


    <!-- Mobile Sidebar -->
    <div class={`fixed inset-0 z-40 transition ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
         style={`top:${impersonationOffset}px; height: calc(100vh - ${impersonationOffset}px);`}
         aria-hidden={!mobileOpen}>
        <div
                class={`absolute inset-0 bg-black bg-opacity-40 transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
                on:click={() => (mobileOpen = false)}
        ></div>

        <aside
                class={`fixed top-0 left-0 h-full w-full bg-white border-b border-gray-200 shadow-2xl p-5 z-50 transform transition-transform duration-200 ${mobileOpen ? "translate-y-0" : "-translate-y-full"}`}
                role="dialog"
                aria-modal="true"
        >
            <div class="flex justify-between items-center mb-6">
                <div>
                    <p class="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-semibold">Navigation</p>
                    <h2 class="text-xl font-bold text-blue-600">Menue</h2>
                </div>
                <button class="text-3xl leading-none" on:click={() => (mobileOpen = false)} aria-label="Menue schliessen">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pb-4">
                {#each visibleNav as item}
                    <a
                            href={item.href}
                            on:click={() => (mobileOpen = false)}
                            class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-800 hover:bg-blue-50 hover:text-blue-600 font-semibold transition border border-gray-200 active:translate-y-[1px]"
                    >
                        <i class={`bi bi-${item.icon} text-lg text-gray-400`} aria-hidden="true"></i>
                        <span>{item.name}</span>
                    </a>
                {/each}
            </div>

            <div class="mt-6 space-y-2">
                <div class="flex items-center gap-2">
                    <a
                            href="/intern/profil"
                            class="flex-1 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-lg font-semibold text-center"
                            on:click={() => (mobileOpen = false)}
                    >
                        <span class="bi bi-person-circle mr-2"></span> Profil
                    </a>
                    <a
                            href="/logout"
                            class="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-semibold text-center shadow-md drop-shadow-[0_4px_10px_rgba(239,68,68,0.35)]"
                    >
                        <span class="bi bi-box-arrow-right mr-2"></span> Logout
                    </a>
                </div>
            </div>
        </aside>
    </div>


    <!-- Main Content -->
    <main class={`flex-1 min-h-screen flex flex-col p-6 pt-6 lg:pt-6 ${collapsed ? "lg:ml-20" : "lg:ml-72"} transition-all duration-200`}>
        <div class={`${collapsed ? "w-full px-2" : "container"} flex-1 flex flex-col`}>
            <div class="flex-1">
                <slot/>
            </div>
            <InternalFooter/>
        </div>
    </main>

</div>
