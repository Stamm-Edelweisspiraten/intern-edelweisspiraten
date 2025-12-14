<script lang="ts">
    export let data;
    const article = data.article;
    let sizes = article.sizes ?? [];
    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;

    const addSize = () => {
        sizes = [...sizes, { name: "", price: 0, stock: 0 }];
    };
    const removeSize = (idx: number) => {
        sizes = sizes.filter((_, i) => i !== idx);
    };
    $: normalizedSizes = sizes
        .filter((s) => s.name.trim())
        .map((s) => ({ ...s, price: Number(s.price) || 0, stock: Number(s.stock) || 0 }));
</script>

<div class="max-w-5xl mx-auto mt-14 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">{article.name}</h1>
            <p class="text-sm text-gray-600 mt-1">Artikel bearbeiten und Groessen anpassen.</p>
        </div>
        <a href="/intern/kaemmerer/articles" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
            <span class="bi bi-arrow-left"></span>
            Zurueck
        </a>
    </div>

    <form method="post" action="?/update" class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Name
                <input name="name" value={article.name} type="text" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" required />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Preis (Standard)
                <input name="price" value={article.price} type="number" step="0.01" min="0" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1 md:col-span-2">
                Beschreibung
                <input name="description" value={article.description} type="text" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Mindestbestand
                <input name="minStock" value={article.minStock ?? 0} type="number" step="1" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="active" checked={article.active !== false} class="h-4 w-4" /> Aktiv
            </label>
        </div>

        <div class="border-t border-gray-200 pt-4 space-y-3">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Groessen</h2>
                <button type="button" class="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50" on:click={addSize}>
                    <span class="bi bi-plus-circle"></span> Groesse hinzufuegen
                </button>
            </div>
            {#if normalizedSizes.length === 0}
                <p class="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-3 py-2">Keine Groessen hinterlegt.</p>
            {:else}
                <div class="space-y-2">
                    {#each sizes as size, idx}
                        <div class="grid grid-cols-1 md:grid-cols-6 gap-2 items-center bg-gray-50 border border-gray-100 rounded-xl p-3">
                            <input class="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Name" bind:value={size.name} />
                            <input class="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Preis" type="number" step="0.01" bind:value={size.price} />
                            <input class="md:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Bestand" type="number" step="1" bind:value={size.stock} />
                            <button type="button" class="text-sm text-red-500 hover:text-red-600" on:click={() => removeSize(idx)}>Entfernen</button>
                        </div>
                    {/each}
                </div>
            {/if}
            <input type="hidden" name="sizes" value={JSON.stringify(normalizedSizes)} />
            <p class="text-xs text-gray-500">Speichern aktualisiert Groessen, Preise und Bestaende. Leere Namen werden ignoriert.</p>
        </div>

        <div class="flex items-center justify-between">
            <div class="text-sm text-gray-500">Gesamtbestand: {article.sizes?.length ? article.sizes.reduce((sum: number, s: any) => sum + (Number(s.stock) || 0), 0) : (article.stock ?? 0)}</div>
            <button type="submit" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                <span class="bi bi-save"></span>
                Speichern
            </button>
        </div>
    </form>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-3">Vorschau</h2>
        <p class="text-sm text-gray-700">Standardpreis: {euro(article.price)}</p>
        {#if article.sizes?.length}
            <div class="mt-2 flex flex-wrap gap-2">
                {#each article.sizes as size}
                    <span class="px-3 py-2 text-sm rounded-xl border border-sky-200 bg-sky-50 text-sky-800 font-semibold">{size.name} – {euro(size.price)} · {size.stock ?? 0} Stk</span>
                {/each}
            </div>
        {/if}
    </div>
</div>
