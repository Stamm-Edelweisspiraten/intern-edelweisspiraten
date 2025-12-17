<script lang="ts">
    export let data;
    const articles = data.articles ?? [];

    const sizeTotal = (sizes: { stock?: number }[] = []) =>
        sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

    const articleStock = (article: any) => article?.sizes?.length ? sizeTotal(article.sizes) : Number(article?.stock) || 0;
    const lowStock = (article: any) => (article?.minStock ?? 0) > 0 && articleStock(article) < (article?.minStock ?? 0);

    const totalArticles = articles.length;
    const lowCount = articles.filter((a: any) => lowStock(a)).length;
    const totalUnits = articles.reduce((sum: number, a: any) => sum + articleStock(a), 0);
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <p class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Kaemmerer</p>
            <h1 class="text-3xl font-bold text-gray-900">Lager</h1>
            <p class="text-sm text-gray-600 mt-1">Bestaende und Warnstufen im Blick.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
            <a href="/intern/kaemmerer/storage/reorder" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-semibold border border-blue-200 shadow-sm transition">
                <span class="bi bi-list-check"></span>
                Bestellliste
            </a>
            <a href="/intern/kaemmerer" class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition">
                <span class="bi bi-arrow-left"></span>
                Zurueck
            </a>
        </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p class="text-sm text-gray-500">Artikel</p>
            <p class="text-2xl font-semibold text-gray-900 mt-1">{totalArticles}</p>
        </div>
        <div class="p-4 bg-white border border-amber-200 rounded-xl shadow-sm">
            <p class="text-sm text-amber-700 flex items-center gap-2"><span class="bi bi-exclamation-diamond"></span> Niedrig</p>
            <p class="text-2xl font-semibold text-amber-700 mt-1">{lowCount}</p>
        </div>
        <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p class="text-sm text-gray-500">Einheiten gesamt</p>
            <p class="text-2xl font-semibold text-gray-900 mt-1">{totalUnits}</p>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="px-6 py-4 flex items-center justify-between flex-wrap gap-3">
            <h2 class="text-lg font-semibold text-gray-900">Artikel im Lager</h2>
            <span class="text-sm text-gray-500">{articles.length} Eintraege</span>
        </div>
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Bestand</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Mindestbestand</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktion</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                {#if articles.length === 0}
                    <tr>
                        <td colspan="5" class="px-6 py-6 text-center text-sm text-gray-500">Keine Artikel vorhanden.</td>
                    </tr>
                {:else}
                    {#each articles as article}
                        <tr class={`hover:bg-gray-50 transition ${lowStock(article) ? "bg-amber-50/60" : ""}`}>
                            <td class="px-6 py-4 text-gray-900 font-semibold">{article.name}</td>
                            <td class="px-6 py-4 text-gray-700">
                                {#if article.sizes?.length}
                                    <div class="flex flex-wrap gap-2">
                                        <div class="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
                                            <p class="text-[11px] uppercase tracking-wide text-gray-500">Gesamt</p>
                                            <p class="text-sm font-semibold text-gray-900">{sizeTotal(article.sizes)}</p>
                                        </div>
                                        {#each article.sizes as size}
                                            <div class={`px-3 py-2 rounded-xl border ${Number(size.stock) === 0 ? "border-amber-200 bg-amber-50/60 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
                                                <div class="text-xs font-semibold uppercase tracking-wide">{size.name}</div>
                                                <div class="text-sm font-semibold">{size.stock ?? 0}</div>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    {article.stock ?? 0}
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-gray-700">
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-1 text-xs rounded-full border border-gray-200 bg-gray-50">{article.minStock ?? 0}</span>
                                    <span class="text-xs text-gray-500">min</span>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                {#if lowStock(article)}
                                    <span class="px-3 py-1 text-xs font-semibold rounded-full border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1">
                                        <span class="bi bi-exclamation-diamond"></span> Niedriger Bestand
                                    </span>
                                {:else}
                                    <span class="px-3 py-1 text-xs font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                                        <span class="bi bi-check-circle"></span> OK
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 space-y-2">
                                <form method="post" action="?/adjust" class="flex items-center flex-wrap gap-2 text-xs">
                                    <input type="hidden" name="id" value={article.id} />
                                    {#if article.sizes?.length}
                                        <select name="size" class="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-blue-500">
                                            {#each article.sizes as size}
                                                <option value={size.name}>{size.name} ({size.stock ?? 0})</option>
                                            {/each}
                                        </select>
                                    {/if}
                                    <input type="number" name="delta" step="1" class="w-24 border border-gray-300 rounded-lg px-2 py-2" placeholder="+/-" />
                                    <button type="submit" class="px-3 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Anpassen</button>
                                </form>
                                <a href={`/intern/kaemmerer/articles/${article.id}`} class="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                                    <span class="bi bi-box"></span>
                                    Details
                                </a>
                            </td>
                        </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>

        <div class="md:hidden px-4 pb-5 space-y-4">
            {#if articles.length === 0}
                <p class="text-sm text-gray-500 px-2">Keine Artikel vorhanden.</p>
            {:else}
                {#each articles as article}
                    <div class={`border rounded-2xl p-4 shadow-sm space-y-3 ${lowStock(article) ? "border-amber-200 bg-amber-50/60" : "border-gray-200 bg-white"}`}>
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-base font-semibold text-gray-900">{article.name}</p>
                                {#if article.sizes?.length}
                                    <p class="text-xs text-gray-500 mt-1">Gesamt: {sizeTotal(article.sizes)}</p>
                                {:else}
                                    <p class="text-xs text-gray-500 mt-1">Bestand: {article.stock ?? 0}</p>
                                {/if}
                            </div>
                            {#if lowStock(article)}
                                <span class="px-3 py-1 text-[11px] font-semibold rounded-full border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1">
                                    <span class="bi bi-exclamation-diamond"></span> Niedrig
                                </span>
                            {:else}
                                <span class="px-3 py-1 text-[11px] font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                                    <span class="bi bi-check-circle"></span> OK
                                </span>
                            {/if}
                        </div>

                        {#if article.sizes?.length}
                            <div class="flex flex-wrap gap-2">
                                {#each article.sizes as size}
                                    <span class={`px-2 py-1 text-[11px] rounded-full border ${Number(size.stock) === 0 ? "border-amber-200 bg-amber-50/60 text-amber-800" : "border-sky-200 bg-sky-50 text-sky-800"} inline-flex items-center gap-2`}>
                                        {size.name}: {size.stock ?? 0}
                                    </span>
                                {/each}
                            </div>
                        {/if}

                        <div class="flex flex-wrap gap-2 text-xs text-gray-700">
                            <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 inline-flex items-center gap-2">
                                <span class="bi bi-exclamation-diamond text-gray-500"></span> Mindestbestand {article.minStock ?? 0}
                            </span>
                            <span class="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 inline-flex items-center gap-2">
                                <span class="bi bi-box-seam text-gray-500"></span> Gesamt {articleStock(article)}
                            </span>
                        </div>

                        <div class="space-y-2">
                            <form method="post" action="?/adjust" class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <input type="hidden" name="id" value={article.id} />
                                {#if article.sizes?.length}
                                    <select name="size" class="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500">
                                        {#each article.sizes as size}
                                            <option value={size.name}>{size.name} ({size.stock ?? 0})</option>
                                        {/each}
                                    </select>
                                {/if}
                                <input type="number" name="delta" step="1" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="+/-" />
                                <button type="submit" class="px-3 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:col-span-2">Anpassen</button>
                            </form>
                            <a href={`/intern/kaemmerer/articles/${article.id}`} class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                                <span class="bi bi-box"></span>
                                Details
                            </a>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
