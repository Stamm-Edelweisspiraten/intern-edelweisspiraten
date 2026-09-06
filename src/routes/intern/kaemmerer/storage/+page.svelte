<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        DataTable,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        StatTile,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Article = PageData["articles"][number];

    /**
     * Bei Artikeln MIT Größen zählt der Mindestbestand JE GRÖSSE, nicht der
     * artikelweite Wert. Der artikelweite Mindestbestand gilt nur für Artikel
     * ohne Größen.
     */
    function isLow(article: Article): boolean {
        if (article.hasSizes) {
            return article.sizes.some((size) => (size.minStock ?? 0) > 0 && (size.stock ?? 0) < (size.minStock ?? 0));
        }
        return article.minStock > 0 && article.stock < article.minStock;
    }

    function sizeTone(size: Article["sizes"][number]): "neutral" | "success" | "warning" {
        const stock = size.stock ?? 0;
        const min = size.minStock ?? 0;
        if (min > 0 && stock < min) return "warning";
        return stock > 0 ? "success" : "neutral";
    }

    let search = $state("");

    const filtered = $derived(
        data.articles.filter((article) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return article.name.toLowerCase().includes(needle);
        })
    );

    const stats = $derived({
        count: data.articles.length,
        low: data.articles.filter(isLow).length,
        units: data.articles.reduce((sum, article) => sum + article.stock, 0)
    });

    // Bestandsdialog -------------------------------------------------------
    let target = $state<Article | null>(null);
    let stockOpen = $state(false);
    let size = $state("");
    let delta = $state<string | number>(1);
    let correction = $state<string | number>(0);

    function openStock(article: Article) {
        target = article;
        size = article.hasSizes ? (article.sizes[0]?.name ?? "") : "";
        delta = 1;
        correction = article.hasSizes ? (article.sizes[0]?.stock ?? 0) : article.stock;
        stockOpen = true;
    }
</script>

<svelte:head><title>Lager - Kämmerer</title></svelte:head>

{#snippet stockCell(article: Article)}
    {#if article.hasSizes}
        <div class="flex flex-wrap gap-1.5">
            <Badge tone="primary" size="xs" label={`Gesamt ${article.stock}`} />
            {#each article.sizes as entry (entry.name)}
                <Badge
                    tone={sizeTone(entry)}
                    size="xs"
                    label={`${entry.name}: ${entry.stock ?? 0}`}
                />
            {/each}
        </div>
    {:else}
        <span class="font-semibold text-fg">{article.stock}</span>
    {/if}
{/snippet}

{#snippet minStockCell(article: Article)}
    {#if article.hasSizes}
        <div class="flex flex-wrap gap-1.5">
            {#each article.sizes as entry (entry.name)}
                <Badge tone="neutral" size="xs" label={`${entry.name}: ${entry.minStock ?? 0}`} />
            {:else}
                <span class="text-fg-subtle">–</span>
            {/each}
        </div>
    {:else}
        <span class="text-fg-muted">{article.minStock}</span>
    {/if}
{/snippet}

{#snippet statusCell(article: Article)}
    {#if !article.active}
        <Badge tone="neutral" size="xs" label="Deaktiviert" />
    {:else if isLow(article)}
        <Badge tone="warning" size="xs" icon="exclamation-diamond" label="Niedriger Bestand" />
    {:else}
        <Badge tone="success" size="xs" icon="check-circle" label="OK" />
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Lager"
        eyebrow="Kämmerer"
        subtitle="Bestände einsehen, Zu- und Abgänge buchen sowie Inventur korrigieren."
        back={{ href: "/intern/kaemmerer" }}
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Artikel suchen..." label="Artikel durchsuchen" />
            <Button href="/intern/kaemmerer/storage/reorder" variant="primary" icon="cart-plus">
                Nachbestellliste
            </Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Artikel" value={stats.count} icon="box" />
        <StatTile
            label="Niedriger Bestand"
            value={stats.low}
            tone="warning"
            icon="exclamation-diamond"
            href="/intern/kaemmerer/storage/reorder"
        />
        <StatTile label="Einheiten gesamt" value={stats.units} tone="primary" icon="box-seam" />
    </div>

    <Card title="Artikel im Lager" meta={`${filtered.length} Einträge`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Artikel", value: (a) => a.name },
                { key: "stock", label: "Bestand", cell: stockCell },
                { key: "minStock", label: "Mindestbestand", cell: minStockCell },
                { key: "status", label: "Status", cell: statusCell }
            ] satisfies Column<Article>[]}
            rows={filtered}
            getKey={(a) => a.id}
            cardTitle={(a) => a.name}
            cardSubtitle={(a) => (a.hasSizes ? `${a.sizes.length} Größen` : undefined)}
            rowHref={(a) => `/intern/kaemmerer/articles/${a.id}`}
            rowClass={(a) => (isLow(a) ? "bg-warning-soft" : "")}
            empty={search ? "Kein passender Artikel gefunden." : "Keine Artikel vorhanden."}
        >
            {#snippet actions(article)}
                <Button
                    variant="secondary"
                    size="sm"
                    icon="sliders"
                    onclick={() => openStock(article)}
                >
                    Bestand
                </Button>
                <Button
                    href={`/intern/kaemmerer/articles/${article.id}`}
                    variant="ghost"
                    size="sm"
                    icon="box"
                >
                    Details
                </Button>
            {/snippet}
        </DataTable>
    </Card>
</div>

<Modal
    bind:open={stockOpen}
    title={target ? `Bestand: ${target.name}` : "Bestand"}
    description="Zu- und Abgang buchen oder den Bestand auf einen Inventurwert setzen."
>
    {#if target}
        {#if target?.hasSizes}
            <FormField label="Größe" hint="Bei Artikeln mit Größen wird je Größe gebucht.">
                {#snippet children({ id })}
                    <select
                        {id}
                        bind:value={size}
                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                    >
                        {#each target?.sizes ?? [] as entry (entry.name)}
                            <option value={entry.name}>
                                {entry.name} (Bestand {entry.stock ?? 0}, Mindestbestand {entry.minStock ?? 0})
                            </option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        {/if}

        <form method="post" action="?/adjust" class="space-y-3 pt-2 border-t border-border">
            <input type="hidden" name="id" value={target?.id ?? ""} />
            <input type="hidden" name="size" value={size} />

            <FormField label="Zu- oder Abgang" hint="Positive Zahl bucht zu, negative Zahl bucht ab.">
                {#snippet children({ id })}
                    <TextInput {id} name="delta" type="number" step="1" bind:value={delta} />
                {/snippet}
            </FormField>

            <div class="flex justify-end">
                <Button type="submit" variant="primary" icon="plus-slash-minus">Bestand anpassen</Button>
            </div>
        </form>

        <form method="post" action="?/correct" class="space-y-3 pt-4 border-t border-border">
            <input type="hidden" name="id" value={target?.id ?? ""} />
            <input type="hidden" name="size" value={size} />

            <FormField
                label="Inventurkorrektur"
                hint="Setzt den Bestand auf genau diesen Wert. Nicht kleiner als 0."
            >
                {#snippet children({ id })}
                    <TextInput {id} name="value" type="number" min={0} step="1" bind:value={correction} />
                {/snippet}
            </FormField>

            <div class="flex justify-end">
                <Button type="submit" variant="warning" icon="clipboard-check">Bestand korrigieren</Button>
            </div>
        </form>
    {/if}
</Modal>
