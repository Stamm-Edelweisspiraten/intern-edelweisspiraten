<script lang="ts">
    import { page } from "$app/state";
    import { can, canAny } from "$lib/can";
    import InternalFooter from "$lib/components/InternalFooter.svelte";
    import { SkipLink, ThemeToggle } from "$lib/components/ui";
    import type { Snippet } from "svelte";
    import type { LayoutData } from "./$types";

    let { data, children }: { data: LayoutData; children: Snippet } = $props();

    const permissions = $derived(data.permissions ?? []);
    /**
     * Fuer die Navigation zaehlen auch gruppenbezogene Rechte -- sonst faende
     * eine Gruppenleitung die Mitgliederverwaltung nicht im Menue.
     */
    const navPermissions = $derived(data.navPermissions ?? data.permissions ?? []);
    const impersonationActive = $derived(!!data.impersonator);

    interface NavItem {
        name: string;
        href: string;
        icon: string;
        /** Sichtbar, wenn eine dieser Berechtigungen vorliegt. */
        perms?: string[];
    }

    const NAV: NavItem[] = [
        { name: "Dashboard", href: "/intern/dashboard", icon: "speedometer2", perms: ["dashboard.view"] },
        { name: "Termine", href: "/intern/termine", icon: "calendar-event", perms: ["events.view"] },
        { name: "Dateien", href: "/intern/dateien", icon: "folder2-open", perms: ["files.view"] },
        { name: "Kämmerer", href: "/intern/kaemmerer", icon: "piggy-bank", perms: ["kaemmerer.access"] },
        {
            name: "Mitgliedverwaltung",
            href: "/intern/members",
            icon: "people",
            perms: ["members.view"]
        },
        {
            name: "Gruppen",
            href: "/intern/groups",
            icon: "diagram-3",
            perms: ["groups.view"]
        },
        { name: "Kasse", href: "/intern/finance", icon: "wallet2", perms: ["finance.view"] },
        { name: "Adminbereich", href: "/intern/admin", icon: "gear-fill", perms: ["admin.view"] }
    ];

    const visibleNav = $derived(
        NAV.filter((item) => !item.perms || canAny(navPermissions, item.perms))
    );

    let mobileOpen = $state(false);
    let collapsed = $state(false);

    /**
     * Aktive Route hervorheben. Vorher gab es keinerlei Markierung -- die
     * Navigation zeigte nie, wo man sich befindet.
     */
    function isActive(href: string): boolean {
        const path = page.url.pathname;
        return path === href || path.startsWith(`${href}/`);
    }

    // Menü bei Navigation schließen und Scrollen sperren, solange es offen ist.
    $effect(() => {
        if (!mobileOpen) return;

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") mobileOpen = false;
        };
        window.addEventListener("keydown", onKeydown);

        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKeydown);
        };
    });

    /** Kuerzel fuer die eingeklappte Seitenleiste, aus dem Namen abgeleitet. */
    const initials = $derived(
        (data.organization.shortName || data.organization.name)
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join("") || "IP"
    );

    const navLinkClass = (href: string) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
            isActive(href)
                ? "bg-primary-soft text-primary-soft-fg"
                : "text-fg-muted hover:bg-surface-muted hover:text-fg"
        }`;
</script>

<svelte:head>
    <title>Intern &ndash; {data.organization.shortName || data.organization.name}</title>
</svelte:head>

<SkipLink />

<!--
    Das Grundgerüst ist jetzt reines CSS-Grid: eine Zeile für das Banner, eine
    für den Inhalt. Vorher wurde die Bannerhöhe per JavaScript gemessen und als
    Inline-Stil auf vier Elemente geschrieben, was beim ersten Rendern zu einem
    sichtbaren Sprung führte -- und der Menü-Overlay lag wegen `fixed top-0`
    über dem Banner, sodass die Schaltfläche zum Beenden verdeckt war.
-->
<div class="min-h-screen grid grid-rows-[auto_1fr]">
    {#if data.impersonator}
        <div class="bg-warning-soft border-b border-warning-soft-border text-warning-soft-fg">
            <div class="max-w-6xl mx-auto px-4 py-2 sm:py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-center gap-3">
                    <span class="bi bi-person-badge-fill" aria-hidden="true"></span>
                    <div class="min-w-0">
                        <p class="text-sm font-semibold">Ansicht als anderer Benutzer</p>
                        <p class="text-xs">
                            Du siehst den internen Bereich als {data.user?.name ?? data.user?.email}.
                            Ursprünglich angemeldet: {data.impersonator.name || data.impersonator.email}
                        </p>
                    </div>
                </div>
                <form method="post" action="/intern/impersonate/stop" class="w-full sm:w-auto">
                    <button
                        type="submit"
                        class="inline-flex items-center gap-2 px-4 py-2 w-full sm:w-auto justify-center bg-warning text-primary-fg rounded-lg font-semibold shadow-sm hover:brightness-95 transition"
                    >
                        <span class="bi bi-arrow-counterclockwise" aria-hidden="true"></span>
                        Zurück zu meinem Zugang
                    </button>
                </form>
            </div>
        </div>
    {/if}

    <div class="relative flex min-h-0">
        <!-- Seitenleiste ab lg -->
        <aside
            class={`hidden lg:flex ${collapsed ? "w-20" : "w-72"} shrink-0 bg-surface border-r border-border flex-col transition-all duration-200 sticky top-0 self-start h-screen`}
        >
            <div class={`px-4 py-6 border-b border-border flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
                {#if !collapsed}
                    <div class="min-w-0 flex items-center gap-3">
                        {#if data.organization.logoFileId}
                            <img
                                src="/intern/admin/organisation/logo"
                                alt=""
                                class="h-9 w-9 object-contain shrink-0"
                            />
                        {/if}
                        <div class="min-w-0">
                            <p class="font-bold text-primary tracking-tight text-xl truncate">
                                {data.organization.shortName || data.organization.name}
                            </p>
                            <p class="text-sm text-fg-subtle mt-0.5">Interner Bereich</p>
                        </div>
                    </div>
                {:else if data.organization.logoFileId}
                    <img src="/intern/admin/organisation/logo" alt="" class="h-8 w-8 object-contain" />
                {:else}
                    <p class="font-bold text-primary text-lg">{initials}</p>
                {/if}
                <button
                    type="button"
                    class="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface hover:bg-surface-muted text-fg-muted transition"
                    onclick={() => (collapsed = !collapsed)}
                    aria-label={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
                    aria-expanded={!collapsed}
                >
                    <span class={`bi bi-chevron-${collapsed ? "right" : "left"}`} aria-hidden="true"></span>
                </button>
            </div>

            <nav class="flex-1 px-3 py-6 space-y-1 overflow-y-auto" aria-label="Hauptnavigation">
                {#each visibleNav as item (item.href)}
                    <a
                        href={item.href}
                        class={navLinkClass(item.href)}
                        aria-current={isActive(item.href) ? "page" : undefined}
                        title={collapsed ? item.name : undefined}
                    >
                        <span class={`bi bi-${item.icon} text-lg shrink-0`} aria-hidden="true"></span>
                        {#if !collapsed}<span class="truncate">{item.name}</span>{/if}
                    </a>
                {/each}
            </nav>

            <div class="p-3 border-t border-border space-y-2">
                <ThemeToggle theme={data.theme} {collapsed} />
                <a href="/intern/profil" class={navLinkClass("/intern/profil")} title={collapsed ? "Profil" : undefined}>
                    <span class="bi bi-person-circle text-lg shrink-0" aria-hidden="true"></span>
                    {#if !collapsed}<span>Profil</span>{/if}
                </a>
                <form method="post" action="/logout">
                    <button
                        type="submit"
                        class="flex items-center justify-center gap-2 w-full py-3 bg-danger text-primary-fg rounded-lg font-semibold hover:bg-danger-hover transition"
                        title={collapsed ? "Abmelden" : undefined}
                    >
                        <span class="bi bi-box-arrow-right" aria-hidden="true"></span>
                        {#if !collapsed}<span>Abmelden</span>{/if}
                    </button>
                </form>
            </div>
        </aside>

        <!-- Kopfzeile unter lg -->
        <header
            class="lg:hidden fixed top-0 left-0 right-0 z-30 bg-surface border-b border-border px-4 py-3 flex justify-between items-center"
            style={impersonationActive ? "position:sticky;" : ""}
        >
            <p class="text-lg font-bold text-primary">Intern</p>
            <button
                type="button"
                class="p-2 rounded-lg bg-primary-soft text-primary-soft-fg"
                onclick={() => (mobileOpen = true)}
                aria-label="Menü öffnen"
                aria-expanded={mobileOpen}
            >
                <span class="bi bi-list text-2xl" aria-hidden="true"></span>
            </button>
        </header>

        <!-- Menü unter lg -->
        {#if mobileOpen}
            <div class="lg:hidden fixed inset-0 z-40">
                <button
                    type="button"
                    class="absolute inset-0 bg-black/50"
                    aria-label="Menü schließen"
                    onclick={() => (mobileOpen = false)}
                ></button>

                <aside
                    class="absolute inset-x-0 top-0 z-50 bg-surface border-b border-border shadow-2xl p-5 max-h-[90vh] overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Navigation"
                >
                    <div class="flex justify-between items-center mb-6">
                        <div>
                            <p class="text-[11px] uppercase tracking-[0.2em] text-fg-subtle font-semibold">
                                Navigation
                            </p>
                            <p class="text-xl font-bold text-primary">Menü</p>
                        </div>
                        <button
                            type="button"
                            class="w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-surface-muted transition"
                            onclick={() => (mobileOpen = false)}
                            aria-label="Menü schließen"
                        >
                            <span class="bi bi-x-lg text-xl" aria-hidden="true"></span>
                        </button>
                    </div>

                    <nav class="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Hauptnavigation">
                        {#each visibleNav as item (item.href)}
                            <a
                                href={item.href}
                                onclick={() => (mobileOpen = false)}
                                aria-current={isActive(item.href) ? "page" : undefined}
                                class={`flex items-center gap-3 px-4 py-3 rounded-lg font-semibold border transition ${
                                    isActive(item.href)
                                        ? "border-primary-soft-border bg-primary-soft text-primary-soft-fg"
                                        : "border-border text-fg hover:bg-surface-muted"
                                }`}
                            >
                                <span class={`bi bi-${item.icon} text-lg`} aria-hidden="true"></span>
                                <span>{item.name}</span>
                            </a>
                        {/each}
                    </nav>

                    <div class="mt-6 space-y-2">
                        <ThemeToggle theme={data.theme} />
                        <div class="flex items-center gap-2">
                            <a
                                href="/intern/profil"
                                class="flex-1 px-4 py-3 bg-surface hover:bg-surface-muted border border-border text-fg rounded-lg font-semibold text-center transition"
                                onclick={() => (mobileOpen = false)}
                            >
                                <span class="bi bi-person-circle mr-2" aria-hidden="true"></span> Profil
                            </a>
                            <form method="post" action="/logout" class="flex-1">
                                <button
                                    type="submit"
                                    class="w-full px-4 py-3 bg-danger hover:bg-danger-hover text-primary-fg rounded-lg font-semibold transition"
                                >
                                    <span class="bi bi-box-arrow-right mr-2" aria-hidden="true"></span> Abmelden
                                </button>
                            </form>
                        </div>
                    </div>
                </aside>
            </div>
        {/if}

        <!--
            pt-16 unter lg schafft Platz für die fixierte Kopfzeile. Vorher
            stand hier nur pt-6, und die Seiten überlebten das nur zufällig
            durch ihr eigenes mt-16.
        -->
        <main id="hauptinhalt" class="flex-1 min-w-0 flex flex-col p-4 sm:p-6 pt-20 lg:pt-6">
            <div class="flex-1 w-full max-w-6xl mx-auto">
                {@render children()}
            </div>
            <div class="w-full max-w-6xl mx-auto">
                <InternalFooter />
            </div>
        </main>
    </div>
</div>
