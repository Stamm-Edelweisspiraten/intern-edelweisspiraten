<script lang="ts">
    export let data;
    const articles = data.articles ?? [];
    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;
    let newSizes: { name: string; price: number; stock?: number; orderUrl?: string }[] = [];
    const addSizeRow = () => {
        newSizes = [...newSizes, { name: "", price: 0, stock: 0 }];
    };
    const removeSizeRow = (idx: number) => {
        newSizes = newSizes.filter((_, i) => i !== idx);
    };
    $: normalizedSizes = newSizes
        .filter((s) => s.name.trim())
        .map((s) => ({ ...s, stock: Number(s.stock) || 0, price: Number(s.price) || 0 }));
    const formatSizeList = (sizes: { name?: string; price?: number; stock?: number; orderUrl?: string }[] = []) =>
        sizes
            .map((s) => `${s.name ?? ""}=${Number(s.price) || 0}|${Number(s.stock) || 0}${s.orderUrl ? `|${s.orderUrl}` : ""}`)
            .filter(Boolean)
            .join(", ");
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Artikel verwalten</h1>
            <p class="text-sm text-gray-600 mt-1">Anlegen, Bearbeiten, Archivieren.</p>
        </div>
        <a href="/intern/kaemmerer" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
            <span class="bi bi-arrow-left"></span>
            Zurueck
        </a>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 class="text-lg font-semibold text-gray-900">Neuer Artikel</h2>
        <form method="post" action="?/create" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Name
                <input name="name" type="text" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" required />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Preis
                <input name="price" type="number" step="0.01" min="0" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Beschreibung
                <input name="description" type="text" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="text-sm text-gray-700 flex flex-col gap-1">
                Bestell-URL (gesamt)
                <input name="orderUrl" type="url" placeholder="https://..." class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </label>
            <div class="grid grid-cols-2 gap-3">
                <label class="text-sm text-gray-700 flex flex-col gap-1">
                    Bestand
                    <input name="stock" type="number" step="1" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </label>
                <label class="text-sm text-gray-700 flex flex-col gap-1">
                    Mindestbestand
                    <input name="minStock" type="number" step="1" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </label>
            </div>
            <div class="md:col-span-2 space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-gray-700">Groessen (optional)</span>
                    <button type="button" class="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" on:click={addSizeRow}>
                        <span class="bi bi-plus-circle"></span> Groesse hinzufuegen
                    </button>
                </div>
                {#if newSizes.length === 0}
                    <p class="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-3 py-2">Keine Groessen hinterlegt.</p>
                {:else}
                    <div class="space-y-2">
                        {#each newSizes as size, idx}
                            <div class="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                                <input name={`size-name-${idx}`} placeholder="z.B. S" class="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={size.name} />
                                <input name={`size-price-${idx}`} type="number" step="0.01" class="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={size.price} />
                                <input name={`size-stock-${idx}`} type="number" step="1" class="sm:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={size.stock} placeholder="Bestand" />
                                <input name={`size-url-${idx}`} type="url" placeholder="Bestell-URL" class="sm:col-span-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={size.orderUrl} />
                                <button type="button" class="text-sm text-red-500 hover:text-red-600" on:click={() => removeSizeRow(idx)}>Entfernen</button>
                            </div>
                        {/each}
                    </div>
                {/if}
                <input type="hidden" name="sizes" value={JSON.stringify(normalizedSizes)} />
                <p class="text-xs text-gray-500">Format: Name, Preis, Bestand und optionale Bestell-URL pro Groesse. Preise koennen pro Groesse variieren.</p>
            </div>
            <div class="md:col-span-2 flex justify-end">
                <button type="submit" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                    <span class="bi bi-save"></span>
                    Speichern
                </button>
            </div>
        </form>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Artikel</h2>
            <span class="text-sm text-gray-500">{articles.length} Eintraege</span>
        </div>
        <div class="hidden xl:block overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Preis</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Bestand</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktionen</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if articles.length === 0}
                    <tr>
                        <td colspan="5" class="px-6 py-6 text-center text-sm text-gray-500">Keine Artikel vorhanden.</td>
                    </tr>
                {:else}
                    {#each articles as article}
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-6 py-4 text-gray-900 font-semibold">
                                {article.name}
                                <div class="text-xs text-gray-500">{article.description}</div>
                                {#if article.orderUrl}
                                    <div class="text-xs mt-1">
                                        <a class="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800" href={article.orderUrl} target="_blank" rel="noreferrer">
                                            <span class="bi bi-link-45deg"></span> Gesamt-Bestelllink
                                        </a>
                                    </div>
                                {/if}
                                {#if article.sizes?.length}
                                    <div class="flex flex-wrap gap-2 mt-2">
                                        {#each article.sizes as size}
                                            <span class="px-2 py-1 text-[11px] rounded-full border border-sky-200 bg-sky-50 text-sky-800 font-semibold inline-flex items-center gap-2">
                                                {size.name} ({euro(size.price)})
                                                {#if size.orderUrl}
                                                    <a href={size.orderUrl} target="_blank" rel="noreferrer" class="text-blue-700 hover:text-blue-800">
                                                        <span class="bi bi-box-arrow-up-right"></span>
                                                    </a>
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-gray-900 font-semibold">{euro(article.price)}</td>
                            <td class="px-6 py-4 text-gray-700">{article.stock ?? 0}</td>
                            <td class="px-6 py-4">
                                {#if article.active !== false}
                                    <span class="px-3 py-1 text-xs font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">Aktiv</span>
                                {:else}
                                    <span class="px-3 py-1 text-xs font-semibold rounded-full border border-gray-200 bg-gray-50 text-gray-600">Inaktiv</span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 space-y-2">
                                <div class="flex flex-wrap gap-2">
                                    <a href={`/intern/kaemmerer/articles/${article.id}`} class="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                                        <span class="bi bi-box"></span>
                                        Details
                                    </a>
                                </div>
                                <form method="post" action="?/update" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                                    <input type="hidden" name="id" value={article.id} />
                                    <input type="text" name="name" value={article.name} class="border border-gray-300 rounded-lg px-2 py-1 lg:col-span-2" />
                                    <input type="number" step="0.01" name="price" value={article.price} class="border border-gray-300 rounded-lg px-2 py-1" />
                                    <input type="number" name="minStock" value={article.minStock ?? 0} class="border border-gray-300 rounded-lg px-2 py-1" />
                                    <input type="text" name="sizes" value={formatSizeList(article.sizes)} placeholder="S=0|5|https://..." class="border border-gray-300 rounded-lg px-2 py-1 lg:col-span-2 sm:col-span-2" />
                                    <input type="text" name="orderUrl" value={article.orderUrl ?? ""} placeholder="Gesamt-Bestell-URL" class="border border-gray-300 rounded-lg px-2 py-1 lg:col-span-2 sm:col-span-2" />
                                    <input type="text" name="description" value={article.description} class="border border-gray-300 rounded-lg px-2 py-1 lg:col-span-4 sm:col-span-2" />
                                    <button type="submit" class="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold lg:col-span-1 sm:col-span-2">Update</button>
                                </form>
                                <div class="flex items-center gap-2 text-xs">
                                    <form method="post" action="?/toggle">
                                        <input type="hidden" name="id" value={article.id} />
                                        <input type="hidden" name="active" value={article.active === false ? "true" : "false"} />
                                        <button type="submit" class="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-semibold">
                                            {article.active === false ? "Aktivieren" : "Deaktivieren"}
                                        </button>
                                    </form>
                                    <form method="post" action="?/stock" class="flex items-center gap-1">
                                        <input type="hidden" name="id" value={article.id} />
                                        <input type="number" name="delta" step="1" class="w-20 border border-gray-300 rounded-lg px-2 py-1" placeholder="+/-" />
                                        <button type="submit" class="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-semibold">Bestand anpassen</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>

        <div class="xl:hidden px-4 pb-6 space-y-4">
            {#if articles.length === 0}
                <p class="text-sm text-gray-500 px-2 pb-2">Keine Artikel vorhanden.</p>
            {:else}
                {#each articles as article}
                    <div class="border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="space-y-1">
                                <p class="text-lg font-semibold text-gray-900">{article.name}</p>
                                {#if article.description}
                                    <p class="text-sm text-gray-600">{article.description}</p>
                                {/if}
                                {#if article.orderUrl}
                                    <a class="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-800" href={article.orderUrl} target="_blank" rel="noreferrer">
                                        <span class="bi bi-link-45deg"></span> Gesamt-Bestelllink
                                    </a>
                                {/if}
                            </div>
                            {#if article.active !== false}
                                <span class="px-3 py-1 text-[11px] font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">Aktiv</span>
                            {:else}
                                <span class="px-3 py-1 text-[11px] font-semibold rounded-full border border-gray-200 bg-gray-50 text-gray-600">Inaktiv</span>
                            {/if}
                        </div>

                        <div class="flex items-center flex-wrap gap-3 text-sm text-gray-700">
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50">
                                <span class="bi bi-cash-coin text-gray-500"></span> {euro(article.price)}
                            </span>
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50">
                                <span class="bi bi-box-seam text-gray-500"></span> Bestand: {article.stock ?? 0}
                            </span>
                            <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50">
                                <span class="bi bi-exclamation-diamond text-gray-500"></span> Min: {article.minStock ?? 0}
                            </span>
                        </div>

                        {#if article.sizes?.length}
                            <div class="flex flex-wrap gap-2">
                                {#each article.sizes as size}
                                    <span class="px-2 py-1 text-[11px] rounded-full border border-sky-200 bg-sky-50 text-sky-800 font-semibold inline-flex items-center gap-2">
                                        {size.name} ({euro(size.price)})
                                        {#if size.orderUrl}
                                            <a href={size.orderUrl} target="_blank" rel="noreferrer" class="text-blue-700 hover:text-blue-800">
                                                <span class="bi bi-box-arrow-up-right"></span>
                                            </a>
                                        {/if}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        <div class="space-y-2">
                            <a href={`/intern/kaemmerer/articles/${article.id}`} class="w-full inline-flex justify-center items-center gap-2 px-3 py-2 text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                                <span class="bi bi-box"></span>
                                Details
                            </a>
                            <form method="post" action="?/update" class="grid grid-cols-1 gap-2 text-xs">
                                <input type="hidden" name="id" value={article.id} />
                                <input type="text" name="name" value={article.name} class="border border-gray-300 rounded-lg px-3 py-2" placeholder="Name" />
                                <div class="grid grid-cols-2 gap-2">
                                    <input type="number" step="0.01" name="price" value={article.price} class="border border-gray-300 rounded-lg px-3 py-2" placeholder="Preis" />
                                    <input type="number" name="minStock" value={article.minStock ?? 0} class="border border-gray-300 rounded-lg px-3 py-2" placeholder="Mindestbestand" />
                                </div>
                                <input type="text" name="sizes" value={formatSizeList(article.sizes)} placeholder="S=0|5|https://..." class="border border-gray-300 rounded-lg px-3 py-2" />
                                <input type="text" name="orderUrl" value={article.orderUrl ?? ""} placeholder="Gesamt-Bestell-URL" class="border border-gray-300 rounded-lg px-3 py-2" />
                                <input type="text" name="description" value={article.description} class="border border-gray-300 rounded-lg px-3 py-2" placeholder="Beschreibung" />
                                <button type="submit" class="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold">Update</button>
                            </form>
                            <div class="flex flex-col gap-2 text-xs">
                                <form method="post" action="?/toggle" class="flex items-center gap-2">
                                    <input type="hidden" name="id" value={article.id} />
                                    <input type="hidden" name="active" value={article.active === false ? "true" : "false"} />
                                    <button type="submit" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-semibold">
                                        {article.active === false ? "Aktivieren" : "Deaktivieren"}
                                    </button>
                                </form>
                                <form method="post" action="?/stock" class="flex items-center gap-2">
                                    <input type="hidden" name="id" value={article.id} />
                                    <input type="number" name="delta" step="1" class="w-24 border border-gray-300 rounded-lg px-3 py-2" placeholder="+/-" />
                                    <button type="submit" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 font-semibold">Bestand anpassen</button>
                                </form>
                            </div>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
