<script lang="ts">
    import { can } from "$lib/can";
    export let data;

    const permissions = data.permissions ?? [];

    const cards = [
        {
            title: "Neue Bestellung",
            desc: "Kostenpflichtig bestellen und Rechnungen automatisch anlegen.",
            href: "/intern/kaemmerer/order/create",
            icon: "bi-plus-circle",
            tone: "blue"
        },
        {
            title: "Meine Bestellungen",
            desc: "Bestellungen der verknuepften Mitglieder.",
            href: "/intern/kaemmerer/order",
            icon: "bi-basket",
            tone: "gray"
        },
        {
            title: "Bestellungen",
            desc: "Alle Bestellungen verwalten (Status, Zahlung).",
            href: "/intern/kaemmerer/orders",
            icon: "bi-list-check",
            tone: "amber",
            perm: "kaemmerer.orders.view"
        },
        {
            title: "Artikel",
            desc: "Artikel anlegen, bearbeiten, archivieren.",
            href: "/intern/kaemmerer/articles",
            icon: "bi-box",
            tone: "blue",
            perm: "kaemmerer.articles.manage"
        },
        {
            title: "Lager",
            desc: "Bestaende einsehen und anpassen.",
            href: "/intern/kaemmerer/storage",
            icon: "bi-building",
            tone: "emerald",
            perm: "kaemmerer.storage.manage"
        }
    ].filter((card) => !card.perm || can(permissions, card.perm));
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-4xl font-bold text-gray-900">Uebersicht</h1>
            <p class="text-sm text-gray-600 mt-1">Schneller Zugriff auf Bestellungen, Artikel und Lager.</p>
        </div>
        <a
                href="/intern/kaemmerer/order/create"
                class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
        >
            <span class="bi bi-plus-circle"></span>
            Neue Bestellung
        </a>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each cards as card}
            <a
                    href={card.href}
                    class="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-amber-200 hover:shadow transition flex flex-col justify-between"
            >
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs uppercase tracking-wide text-gray-500">Navigation</p>
                        <h2 class="text-xl font-semibold text-gray-900 mt-1">{card.title}</h2>
                        <p class="text-sm text-gray-600 mt-2">{card.desc}</p>
                    </div>
                    <span class={`bi ${card.icon} text-2xl ${card.tone === "amber" ? "text-amber-600" : card.tone === "emerald" ? "text-emerald-600" : "text-blue-600"}`}></span>
                </div>
                <div class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                    Oeffnen <span class="bi bi-arrow-right"></span>
                </div>
            </a>
        {/each}
    </div>
</div>
