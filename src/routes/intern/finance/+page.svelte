<script lang="ts">
    const tiles = [
        {
            name: "Jahresbeitraege",
            href: "/intern/finance/dues",
            desc: "Beitragslisten und Zahlungen im Blick behalten."
        },
        {
            name: "Geschaeftsjahre",
            href: "/intern/finance/fiscal-years",
            desc: "Jahreszeitraeume und Kontingente konfigurieren."
        }
    ];
</script>

<div class="max-w-5xl mx-auto mt-16">
    <h1 class="text-4xl font-bold text-gray-900 mb-3">Kasse</h1>
    <p class="text-gray-600 mb-8">Module rund um Beitraege und Finanzen.</p>

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

        <div class="p-8 bg-gray-50 rounded-2xl shadow-inner border border-dashed border-gray-300 cursor-not-allowed opacity-80 block">
            <h2 class="text-xl font-semibold text-gray-900 mb-2">-> Coming soon</h2>
            <p class="text-gray-600 text-sm">
                Weitere Module folgen.
            </p>
        </div>
    </div>
</div>
