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
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Article = PageData["articles"][number];

    interface SizeRow {
        name: string;
        /** Euro-Schreibweise für das Formular; der Server rechnet in Cents um. */
        price: string;
        stock: number;
        minStock: number;
        orderUrl: string;
    }

    const asInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

    function sizesPayload(rows: SizeRow[]) {
        return rows
            .filter((row) => row.name.trim().length > 0)
            .map((row) => ({
                name: row.name.trim(),
                price: row.price,
                stock: Number(row.stock) || 0,
                minStock: Number(row.minStock) || 0,
                orderUrl: row.orderUrl
            }));
    }

    function emptySize(): SizeRow {
        return { name: "", price: "0,00", stock: 0, minStock: 0, orderUrl: "" };
    }

    let search = $state("");

    const filtered = $derived(
        data.articles.filter((article) => {
            const needle = search.trim().toLowerCase();
            if (!needle) return true;
            return `${article.name} ${article.description}`.toLowerCase().includes(needle);
        })
    );

    const stats = $derived({
        total: data.articles.length,
        active: data.articles.filter((article) => article.active).length,
        inactive: data.articles.filter((article) => !article.active).length
    });

    // Anlegen --------------------------------------------------------------
    let createSizes = $state<SizeRow[]>([]);

    // Bearbeiten -----------------------------------------------------------
    let editing = $state<Article | null>(null);
    let editOpen = $state(false);
    let editSizes = $state<SizeRow[]>([]);

    function openEdit(article: Article) {
        editing = article;
        // Die Größen MÜSSEN mitgesendet werden -- ein leeres Feld würde sie
        // serverseitig löschen und den abgeleiteten Bestand auf 0 setzen.
        editSizes = article.sizes.map((size) => ({
            name: size.name,
            price: asInput(size.price),
            stock: size.stock ?? 0,
            minStock: size.minStock ?? 0,
            orderUrl: size.orderUrl ?? ""
        }));
        editOpen = true;
    }
</script>

<svelte:head><title>Artikel - Kämmerer</title></svelte:head>

{#snippet sizeEditor(rows: SizeRow[], add: () => void, remove: (index: number) => void)}
    <fieldset class="space-y-3">
        <legend class="text-sm font-semibold text-fg-muted">Größen (optional)</legend>

        {#each rows as row, index (index)}
            <div class="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end p-3 rounded-xl border border-border">
                <FormField label="Größe">
                    {#snippet children({ id })}
                        <TextInput {id} bind:value={rows[index].name} placeholder="z.B. S" />
                    {/snippet}
                </FormField>
                <FormField label="Preis">
                    {#snippet children({ id })}
                        <TextInput {id} bind:value={rows[index].price} inputmode="decimal" placeholder="12,50" />
                    {/snippet}
                </FormField>
                <FormField label="Bestand">
                    {#snippet children({ id })}
                        <TextInput {id} type="number" min={0} bind:value={rows[index].stock} />
                    {/snippet}
                </FormField>
                <FormField label="Mindestbestand">
                    {#snippet children({ id })}
                        <TextInput {id} type="number" min={0} bind:value={rows[index].minStock} />
                    {/snippet}
                </FormField>
                <FormField label="Bestell-URL">
                    {#snippet children({ id })}
                        <TextInput {id} bind:value={rows[index].orderUrl} placeholder="https://..." />
                    {/snippet}
                </FormField>
                <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    ariaLabel={`Größe ${index + 1} entfernen`}
                    onclick={() => remove(index)}
                >
                    Entfernen
                </Button>
            </div>
        {:else}
            <p class="text-sm text-fg-subtle">Keine Größen hinterlegt — es gilt der Grundpreis.</p>
        {/each}

        <Button variant="secondary" size="sm" icon="plus-lg" onclick={add}>Größe hinzufügen</Button>
    </fieldset>
{/snippet}

{#snippet nameCell(article: Article)}
    <div class="space-y-1">
        <a
            href={`/intern/kaemmerer/articles/${article.id}`}
            class="font-semibold text-fg hover:text-primary transition"
        >
            {article.name}
        </a>
        {#if article.description}
            <p class="text-xs text-fg-subtle">{article.description}</p>
        {/if}
        {#if article.orderUrl}
            <a
                href={article.orderUrl}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
                <span class="bi bi-link-45deg" aria-hidden="true"></span>
                Bestell-Link
            </a>
        {/if}
        {#if article.hasSizes}
            <div class="flex flex-wrap gap-1.5 pt-1">
                {#each article.sizes as size (size.name)}
                    <Badge tone="info" size="xs" label={`${size.name} · ${formatEuro(size.price || article.price)}`} />
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

{#snippet stockCell(article: Article)}
    <div class="space-y-0.5">
        <span class="font-semibold text-fg">{article.stock}</span>
        {#if article.hasSizes}
            <p class="text-xs text-fg-subtle">Summe der Größen</p>
        {/if}
    </div>
{/snippet}

{#snippet minStockCell(article: Article)}
    {#if article.hasSizes}
        <div class="flex flex-wrap gap-1.5">
            {#each article.sizes as size (size.name)}
                <Badge tone="neutral" size="xs" label={`${size.name}: ${size.minStock ?? 0}`} />
            {:else}
                <span class="text-fg-subtle">–</span>
            {/each}
        </div>
    {:else}
        <span class="text-fg-muted">{article.minStock}</span>
    {/if}
{/snippet}

{#snippet statusCell(article: Article)}
    {#if article.active}
        <Badge tone="success" size="xs" label="Bestellbar" />
    {:else}
        <Badge tone="neutral" size="xs" label="Deaktiviert" />
    {/if}
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Artikel"
        eyebrow="Kämmerer"
        subtitle="Artikel anlegen, bearbeiten und deaktivieren."
        back={{ href: "/intern/kaemmerer" }}
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Artikel suchen..." label="Artikel durchsuchen" />
            <Button href="#artikel-anlegen" variant="primary" icon="plus-circle">Neuer Artikel</Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Artikel gesamt" value={stats.total} icon="box" />
        <StatTile label="Bestellbar" value={stats.active} tone="success" icon="check-circle" />
        <StatTile label="Deaktiviert" value={stats.inactive} tone="neutral" icon="slash-circle" />
    </div>

    <section id="artikel-anlegen">
        <Card
            title="Neuer Artikel"
            subtitle="Grunddaten erfassen. Größen können jederzeit ergänzt werden."
        >
            <form method="post" action="?/create" class="space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Name" required>
                        {#snippet children({ id })}
                            <TextInput {id} name="name" required placeholder="Halstuch" />
                        {/snippet}
                    </FormField>

                    <FormField label="Grundpreis" hint="Gilt, wenn eine Größe keinen eigenen Preis hat.">
                        {#snippet children({ id })}
                            <TextInput {id} name="price" inputmode="decimal" value="0,00" placeholder="12,50" />
                        {/snippet}
                    </FormField>
                </div>

                <FormField label="Beschreibung">
                    {#snippet children({ id })}
                        <TextInput {id} name="description" placeholder="Kurze Beschreibung" />
                    {/snippet}
                </FormField>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Bestand" hint="Wird bei Artikeln mit Größen aus den Größen berechnet.">
                        {#snippet children({ id })}
                            <TextInput {id} name="stock" type="number" min={0} value="0" />
                        {/snippet}
                    </FormField>

                    <FormField label="Mindestbestand" hint="Bei Größen zählt der Mindestbestand je Größe.">
                        {#snippet children({ id })}
                            <TextInput {id} name="minStock" type="number" min={0} value="0" />
                        {/snippet}
                    </FormField>
                </div>

                <FormField label="Bestell-URL">
                    {#snippet children({ id })}
                        <TextInput {id} name="orderUrl" placeholder="https://..." />
                    {/snippet}
                </FormField>

                {@render sizeEditor(
                    createSizes,
                    () => (createSizes = [...createSizes, emptySize()]),
                    (index) => (createSizes = createSizes.filter((_, i) => i !== index))
                )}

                <input type="hidden" name="sizes" value={JSON.stringify(sizesPayload(createSizes))} />

                <div class="flex justify-end gap-3 flex-wrap pt-2 border-t border-border">
                    <Button type="submit" variant="primary" icon="check-lg">Artikel anlegen</Button>
                </div>
            </form>
        </Card>
    </section>

    <Card title="Alle Artikel" meta={`${filtered.length} Einträge`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Artikel", cell: nameCell },
                { key: "price", label: "Grundpreis", align: "right", value: (a) => formatEuro(a.price) },
                { key: "stock", label: "Bestand", align: "right", cell: stockCell },
                { key: "minStock", label: "Mindestbestand", cell: minStockCell },
                { key: "status", label: "Status", cell: statusCell }
            ] satisfies Column<Article>[]}
            rows={filtered}
            getKey={(a) => a.id}
            cardTitle={(a) => a.name}
            cardSubtitle={(a) => a.description || undefined}
            rowClass={(a) => (a.active ? "" : "opacity-60")}
            empty={search ? "Kein passender Artikel gefunden." : "Noch keine Artikel angelegt."}
        >
            {#snippet actions(article)}
                <Button variant="secondary" size="sm" icon="pencil" onclick={() => openEdit(article)}>
                    Bearbeiten
                </Button>
                <Button
                    href={`/intern/kaemmerer/articles/${article.id}`}
                    variant="ghost"
                    size="sm"
                    icon="box"
                >
                    Details
                </Button>
                <form method="post" action="?/toggle">
                    <input type="hidden" name="id" value={article.id} />
                    <input type="hidden" name="active" value={article.active ? "false" : "true"} />
                    <Button
                        type="submit"
                        variant={article.active ? "ghost" : "success"}
                        size="sm"
                        icon={article.active ? "slash-circle" : "check-circle"}
                    >
                        {article.active ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                </form>
            {/snippet}
        </DataTable>
    </Card>
</div>


<Modal
    bind:open={editOpen}
    title={editing ? `${editing.name} bearbeiten` : "Artikel bearbeiten"}
    description="Der Bestand wird nicht hier, sondern im Lager gepflegt."
    size="lg"
>
    {#if editing}
        <form method="post" action="?/update" class="space-y-5">
            <input type="hidden" name="id" value={editing?.id ?? ""} />

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Name" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="name" value={editing?.name ?? ""} required />
                    {/snippet}
                </FormField>

                <FormField label="Grundpreis" hint="Gilt, wenn eine Größe keinen eigenen Preis hat.">
                    {#snippet children({ id })}
                        <TextInput {id} name="price" inputmode="decimal" value={asInput(editing?.price ?? 0)} />
                    {/snippet}
                </FormField>
            </div>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <TextInput {id} name="description" value={editing?.description ?? ""} />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    label="Mindestbestand"
                    hint={editing?.hasSizes
                        ? "Bei Größen zählt der Mindestbestand je Größe."
                        : "Unterschreitung erscheint in der Nachbestellliste."}
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="minStock"
                            type="number"
                            min={0}
                            value={String(editing?.minStock ?? 0)}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Bestell-URL">
                    {#snippet children({ id })}
                        <TextInput {id} name="orderUrl" value={editing?.orderUrl ?? ""} placeholder="https://..." />
                    {/snippet}
                </FormField>
            </div>

            {@render sizeEditor(
                editSizes,
                () => (editSizes = [...editSizes, emptySize()]),
                (index) => (editSizes = editSizes.filter((_, i) => i !== index))
            )}

            <input type="hidden" name="sizes" value={JSON.stringify(sizesPayload(editSizes))} />

            <p class="text-sm text-fg-muted">
                Aktueller Bestand: <strong class="text-fg">{editing?.stock ?? 0}</strong>
                {#if editing?.hasSizes}
                    <span class="text-xs text-fg-subtle">(Summe der Größen)</span>
                {/if}
            </p>

            <div class="flex justify-end gap-3 flex-wrap pt-2 border-t border-border">
                <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
                <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
            </div>
        </form>
    {/if}
</Modal>
