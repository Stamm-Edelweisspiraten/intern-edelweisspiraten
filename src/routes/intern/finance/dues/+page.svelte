<script lang="ts">
    const tiles = [
        {
            name: "Beitraege verwalten",
            href: "/intern/finance/dues/contributions",
            desc: "Mitgliedsbeitraege anpassen und Zahlungen nachhalten."
        }
    ];
</script>

<div class="max-w-5xl mx-auto mt-16">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">Jahresbeiträge</h1>
    <p class="text-gray-600 mb-8">Waehle ein Modul zur Verwaltung der Beiträge.</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {#each tiles as item}
            <a
                    href={item.href}
                    class="p-8 bg-white rounded-2xl shadow-md border border-gray-200 hover:shadow-lg hover:-translate-y-1 transition block"
            >
                <h2 class="text-xl font-semibold text-gray-900 mb-2">-> {item.name}</h2>
                <p class="text-gray-600 text-sm">
                    {item.desc}
                </p>
            </a>
        {/each}
    </div>
</div>
