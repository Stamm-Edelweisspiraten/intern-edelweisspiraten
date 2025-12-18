<script lang="ts">
    export let data;

    const euro = (v: number) => `${(Number(v) || 0).toFixed(2)} EUR`;

    const articles = data.articles ?? [];
    const members = data.members ?? [];

    type Item = { articleId?: string; name: string; price: number; quantity: number; size?: string };

    const priceFor = (article: any, size?: string) => {
        if (size && Array.isArray(article?.sizes)) {
            const match = article.sizes.find((s: any) => s.name === size);
            if (match) return Number(match.price) || 0;
        }
        return Number(article?.price) || 0;
    };

    const firstSize = (article: any) => article?.sizes?.[0]?.name ?? "";
    const getArticle = (id?: string) => articles.find((a: any) => a.id === id);

    let items: Item[] = [{
        articleId: articles[0]?.id,
        name: articles[0]?.name ?? "",
        size: firstSize(articles[0]) || undefined,
        price: priceFor(articles[0], firstSize(articles[0])),
        quantity: 1
    }];
    let selectedMemberId: string = members[0]?.id ?? "";
    let error = "";

    const addItem = () => {
        const defaultSize = firstSize(articles[0]);
        items = [...items, {
            articleId: articles[0]?.id,
            name: articles[0]?.name ?? "",
            size: defaultSize || undefined,
            price: priceFor(articles[0], defaultSize),
            quantity: 1
        }];
    };

    const removeItem = (idx: number) => {
        items = items.filter((_, i) => i !== idx);
    };

    const updateArticle = (idx: number, id: string) => {
        const article = articles.find((a: any) => a.id === id);
        const defaultSize = firstSize(article);
        items = items.map((item, i) => i === idx ? {
            ...item,
            articleId: id,
            name: article?.name ?? "",
            size: defaultSize || undefined,
            price: priceFor(article, defaultSize)
        } : item);
    };

    const updateSize = (idx: number, size: string) => {
        const article = getArticle(items[idx]?.articleId);
        items = items.map((item, i) => i === idx ? {
            ...item,
            size: size || undefined,
            price: priceFor(article, size) || item.price
        } : item);
    };

    $: normalizedItems = items.map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
        total: (Number(i.price) || 0) * (Number(i.quantity) || 0)
    }));

    $: total = normalizedItems.reduce((sum, i) => sum + i.total, 0);

    const selectMember = (id: string) => {
        selectedMemberId = id;
    };
</script>

<div class="max-w-6xl mx-auto mt-16 space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h1 class="text-4xl font-bold text-gray-900">Neue Bestellung</h1>
            <p class="text-sm text-gray-600 mt-1">Artikel auswaehlen, Mitglieder zuweisen, Rechnungen werden automatisch erstellt.</p>
        </div>
        <a
                href="/intern/kaemmerer"
                class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
        >
            <span class="bi bi-arrow-left"></span>
            Zurueck
        </a>
    </div>

    <form method="post" class="space-y-6">
        <input type="hidden" name="items" value={JSON.stringify(normalizedItems.map(({ total, ...rest }) => rest))} />
        <input type="hidden" name="memberNames" value={JSON.stringify(selectedMemberId ? [members.find((m: any) => m.id === selectedMemberId)?.name ?? ""] : [])} />
        {#if selectedMemberId}
            <input type="hidden" name="memberIds" value={selectedMemberId} />
        {/if}

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Artikel</h2>
                <button type="button" class="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-800"
                        on:click={addItem}>
                    <span class="bi bi-plus-circle"></span>
                    Artikel hinzufuegen
                </button>
            </div>
            <div class="space-y-3">
                {#each items as item, idx}
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-center border border-gray-100 rounded-xl p-3">
                        <div class="md:col-span-2">
                            <label class="text-sm text-gray-700">Artikel</label>
                            <select class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={item.articleId} on:change={(e) => updateArticle(idx, (e.target as HTMLSelectElement).value)}>
                                {#each articles as a}
                                    <option value={a.id}>{a.name} ({euro(a.price)})</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label class="text-sm text-gray-700">Groesse</label>
                            {#if getArticle(item.articleId)?.sizes?.length}
                                <select
                                        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                        value={item.size ?? ""}
                                        on:change={(e) => updateSize(idx, (e.target as HTMLSelectElement).value)}
                                >
                                    {#each getArticle(item.articleId)?.sizes ?? [] as size}
                                        <option value={size.name} selected={item.size === size.name}>{size.name} ({euro(size.price)})</option>
                                    {/each}
                                </select>
                            {:else}
                                <div class="w-full border border-dashed border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">Keine Groesse</div>
                            {/if}
                        </div>
                        <div>
                            <label class="text-sm text-gray-700">Menge</label>
                            <input type="number" min="1" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" bind:value={item.quantity} />
                        </div>
                        <div class="md:col-span-1 w-full flex items-center justify-end md:block text-right ml-auto md:ml-0 md:justify-self-end">
                            <div>
                                <p class="text-xs text-gray-500">Zwischensumme</p>
                                <p class="text-sm font-semibold text-gray-900">{euro((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p>
                            </div>
                            {#if items.length > 1}
                                <button type="button" class="text-sm text-red-500 hover:text-red-600" on:click={() => removeItem(idx)}>
                                    Entfernen
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Mitglieder</h2>
                <span class="text-sm text-gray-500">{selectedMemberId ? "1 ausgewaehlt" : "Keins ausgewaehlt"}</span>
            </div>
            {#if members.length === 0}
                <p class="text-sm text-gray-500">Keine verknuepften Mitglieder gefunden.</p>
            {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {#each members as member}
                        <label class={`flex items-center justify-between px-4 py-3 border rounded-xl cursor-pointer hover:bg-gray-50 ${selectedMemberId === member.id ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}>
                            <div>
                                <p class="font-semibold text-gray-900">{member.name}</p>
                            </div>
                            <input type="radio" name="memberSelect" class="h-5 w-5" value={member.id} checked={selectedMemberId === member.id} on:change={() => selectMember(member.id)} />
                        </label>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-3">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Uebersicht</h2>
                <span class="text-sm text-gray-500">{items.length} Artikel</span>
            </div>
            <div class="divide-y divide-gray-100 text-sm">
                {#each normalizedItems as item}
                    <div class="flex items-center justify-between py-2">
                        <div>
                            <p class="font-semibold text-gray-900">{item.name || "Artikel"}</p>
                            <p class="text-xs text-gray-500">{item.quantity} x {euro(item.price)} {item.size ? `(${item.size})` : ""}</p>
                        </div>
                        <p class="font-semibold text-gray-900">{euro(item.total)}</p>
                    </div>
                {/each}
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-gray-200">
                <span class="text-sm font-semibold text-gray-700">Gesamt</span>
                <span class="text-2xl font-bold text-amber-600">{euro(total)}</span>
            </div>
        </div>

        {#if error}
            <p class="text-sm text-red-600">{error}</p>
        {/if}

        <div class="flex items-center justify-end gap-3">
            <a href="/intern/kaemmerer" class="px-4 py-3 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">Abbrechen</a>
            <button type="submit" class="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm">
                <span class="bi bi-bag-check"></span>
                Kostenpflichtig bestellen
            </button>
        </div>
    </form>
</div>
