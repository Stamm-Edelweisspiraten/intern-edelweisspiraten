<script lang="ts">
    import { Alert, Badge, Button, Card, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    interface SizeRow {
        name: string;
        /** Euro-Schreibweise für das Formular. */
        price: string;
        stock: number;
        minStock: number;
        orderUrl: string;
    }

    const asInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

    let sizes = $state<SizeRow[]>(
        data.article.sizes.map((size) => ({
            name: size.name,
            price: asInput(size.price),
            stock: size.stock ?? 0,
            minStock: size.minStock ?? 0,
            orderUrl: size.orderUrl ?? ""
        }))
    );

    function addSize() {
        sizes = [...sizes, { name: "", price: "0,00", stock: 0, minStock: 0, orderUrl: "" }];
    }

    function removeSize(index: number) {
        sizes = sizes.filter((_, i) => i !== index);
    }

    /** Was gespeichert wird: Preise als Euro-Text, der Server rechnet um. */
    const payload = $derived(
        sizes
            .filter((size) => size.name.trim().length > 0)
            .map((size) => ({
                name: size.name.trim(),
                price: size.price,
                stock: Number(size.stock) || 0,
                minStock: Number(size.minStock) || 0,
                orderUrl: size.orderUrl
            }))
    );

    const totalStock = $derived(
        data.article.hasSizes
            ? data.article.sizes.reduce((sum, size) => sum + (size.stock ?? 0), 0)
            : data.article.stock
    );
</script>

<svelte:head><title>{data.article.name} - Artikel</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title={data.article.name}
        eyebrow="Kämmerer"
        subtitle={data.article.description || "Artikel bearbeiten"}
        back={{ href: "/intern/kaemmerer/articles" }}
    >
        {#snippet badge()}
            {#if data.article.active}
                <Badge tone="success" label="Bestellbar" />
            {:else}
                <Badge tone="neutral" label="Deaktiviert" />
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    <Card title="Stammdaten">
        <form method="post" action="?/update" class="space-y-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Name" required>
                    {#snippet children({ id })}
                        <TextInput {id} name="name" value={data.article.name} required />
                    {/snippet}
                </FormField>

                <FormField label="Grundpreis" hint="Gilt, wenn eine Größe keinen eigenen Preis hat.">
                    {#snippet children({ id })}
                        <TextInput {id} name="price" inputmode="decimal" value={asInput(data.article.price)} />
                    {/snippet}
                </FormField>
            </div>

            <FormField label="Beschreibung">
                {#snippet children({ id })}
                    <TextInput {id} name="description" value={data.article.description} />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    label="Mindestbestand"
                    hint={data.article.hasSizes
                        ? "Bei Größen zählt der Mindestbestand je Größe."
                        : "Unterschreitung erscheint in der Nachbestellliste."}
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="minStock"
                            type="number"
                            min={0}
                            value={String(data.article.minStock)}
                            disabled={data.article.hasSizes}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Bestell-URL">
                    {#snippet children({ id })}
                        <TextInput {id} name="orderUrl" value={data.article.orderUrl} placeholder="https://..." />
                    {/snippet}
                </FormField>
            </div>

            <label class="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" name="active" checked={data.article.active} class="rounded border-border-strong" />
                Artikel ist bestellbar
            </label>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-fg-muted">Größen</legend>

                {#each sizes as size, index (index)}
                    <div class="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end p-3 rounded-xl border border-border">
                        <label class="text-xs text-fg-subtle">
                            Größe
                            <input
                                bind:value={size.name}
                                class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                            />
                        </label>
                        <label class="text-xs text-fg-subtle">
                            Preis
                            <input
                                bind:value={size.price}
                                inputmode="decimal"
                                class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                            />
                        </label>
                        <label class="text-xs text-fg-subtle">
                            Bestand
                            <input
                                type="number"
                                min="0"
                                bind:value={size.stock}
                                class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                            />
                        </label>
                        <label class="text-xs text-fg-subtle">
                            Mindestbestand
                            <input
                                type="number"
                                min="0"
                                bind:value={size.minStock}
                                class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                            />
                        </label>
                        <label class="text-xs text-fg-subtle">
                            Bestell-URL
                            <input
                                bind:value={size.orderUrl}
                                class="mt-1 w-full px-3 py-2 rounded-lg text-sm bg-surface text-fg border border-border-strong"
                            />
                        </label>
                        <Button variant="ghost" size="sm" icon="trash" onclick={() => removeSize(index)}>
                            Entfernen
                        </Button>
                    </div>
                {/each}

                <Button variant="secondary" size="sm" icon="plus-lg" onclick={addSize}>
                    Größe hinzufügen
                </Button>

                <input type="hidden" name="sizes" value={JSON.stringify(payload)} />
            </fieldset>

            <p class="text-sm text-fg-muted">
                Gesamtbestand: <strong class="text-fg">{totalStock}</strong>
                {#if data.article.hasSizes}
                    <span class="text-xs text-fg-subtle">(Summe der Größen)</span>
                {/if}
            </p>

            <div class="flex justify-end gap-3">
                <Button href="/intern/kaemmerer/articles" variant="secondary">Zurück</Button>
                <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
            </div>
        </form>
    </Card>

    {#if data.article.hasSizes}
        <Card title="Bestand je Größe" padding="none">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-surface-muted">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide">Größe</th>
                            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wide">Preis</th>
                            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wide">Bestand</th>
                            <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-fg-subtle uppercase tracking-wide">Mindestbestand</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        {#each data.article.sizes as size (size.name)}
                            <tr class="hover:bg-surface-muted transition">
                                <td class="px-6 py-3 text-sm text-fg">{size.name}</td>
                                <td class="px-6 py-3 text-sm text-right text-fg">{formatEuro(size.price)}</td>
                                <td class="px-6 py-3 text-sm text-right font-semibold text-fg">{size.stock ?? 0}</td>
                                <td class="px-6 py-3 text-sm text-right text-fg-muted">{size.minStock ?? 0}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card>
    {/if}
</div>
