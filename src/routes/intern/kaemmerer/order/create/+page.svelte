<script lang="ts">
    import { Alert, Badge, Button, Card, EmptyState, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Article = PageData["articles"][number];

    interface Line {
        articleId: string;
        size: string;
        quantity: number;
    }

    function articleById(id: string): Article | undefined {
        return data.articles.find((article) => article.id === id);
    }

    function firstSize(article: Article | undefined): string {
        return article?.sizes[0]?.name ?? "";
    }

    /** Nur zur Vorschau -- verbindlich rechnet der Server aus dem Artikel. */
    function unitPrice(line: Line): number {
        const article = articleById(line.articleId);
        if (!article) return 0;
        if (line.size) {
            const size = article.sizes.find((entry) => entry.name === line.size);
            if (size) return size.price || article.price;
        }
        return article.price;
    }

    function newLine(): Line {
        const article = data.articles[0];
        return { articleId: article?.id ?? "", size: firstSize(article), quantity: 1 };
    }

    /** Startwerte als Funktion, damit die Initialisierung data nicht einfriert. */
    function initialLines(): Line[] {
        return data.articles.length > 0 ? [newLine()] : [];
    }

    function initialMembers(): string[] {
        return data.members.length === 1 ? [data.members[0].id] : [];
    }

    let lines = $state<Line[]>(initialLines());
    let selectedMembers = $state<string[]>(initialMembers());

    function addLine() {
        lines = [...lines, newLine()];
    }

    function removeLine(index: number) {
        lines = lines.filter((_, i) => i !== index);
    }

    function setArticle(index: number, articleId: string) {
        const article = articleById(articleId);
        lines[index].articleId = articleId;
        lines[index].size = firstSize(article);
    }

    /**
     * Was gesendet wird: ausschliesslich articleId, size und quantity. Der
     * Preis wird bewusst NICHT mitgeschickt -- der Server loest ihn aus dem
     * Artikel auf.
     */
    const payload = $derived(
        lines
            .filter((line) => line.articleId && Number(line.quantity) > 0)
            .map((line) => ({
                articleId: line.articleId,
                size: line.size || null,
                quantity: Number(line.quantity) || 0
            }))
    );

    const total = $derived(
        lines.reduce((sum, line) => sum + unitPrice(line) * (Number(line.quantity) || 0), 0)
    );

    const ready = $derived(payload.length > 0 && selectedMembers.length > 0);

    /** Die Aktion leitet bei Erfolg um; success ist daher optional. */
    const feedback = $derived(form as { error?: string; success?: string } | null | undefined);
</script>

<svelte:head><title>Neue Bestellung - Kämmerer</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Neue Bestellung"
        eyebrow="Kämmerer"
        subtitle="Artikel auswählen, Mitglieder zuweisen — die Rechnungen entstehen automatisch."
        back={{ href: "/intern/kaemmerer/order", label: "Zurück zu meinen Bestellungen" }}
    />

    {#if feedback?.error}<Alert tone="danger" message={feedback.error} />{/if}
    {#if feedback?.success}<Alert tone="success" message={feedback.success} />{/if}

    {#if data.articles.length === 0}
        <Card>
            <EmptyState
                icon="box"
                title="Keine bestellbaren Artikel"
                description="Derzeit ist kein Artikel zur Bestellung freigegeben. Bitte wende dich an den Kämmerer."
            />
        </Card>
    {:else if data.members.length === 0}
        <Card>
            <EmptyState
                icon="person-x"
                title="Kein Mitglied verknüpft"
                description="Mit deinem Konto ist kein Mitglied verknüpft. Ohne verknüpftes Mitglied kann keine Bestellung angelegt werden."
            />
        </Card>
    {:else}
        <form method="post" class="space-y-8">
            <input type="hidden" name="items" value={JSON.stringify(payload)} />

            <Card title="Artikel" meta={`${lines.length} Positionen`}>
                {#snippet actions()}
                    <Button variant="secondary" size="sm" icon="plus-circle" onclick={addLine}>
                        Position hinzufügen
                    </Button>
                {/snippet}

                <div class="space-y-3">
                    {#each lines as line, index (index)}
                        {@const article = articleById(line.articleId)}
                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl border border-border bg-surface-muted">
                            <FormField label="Artikel" class="md:col-span-5">
                                {#snippet children({ id })}
                                    <select
                                        {id}
                                        value={line.articleId}
                                        onchange={(event) => setArticle(index, event.currentTarget.value)}
                                        class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                                    >
                                        {#each data.articles as option (option.id)}
                                            <option value={option.id}>
                                                {option.name} ({formatEuro(option.price)})
                                            </option>
                                        {/each}
                                    </select>
                                {/snippet}
                            </FormField>

                            <FormField label="Größe" class="md:col-span-3">
                                {#snippet children({ id })}
                                    {#if article && article.sizes.length > 0}
                                        <select
                                            {id}
                                            bind:value={line.size}
                                            class="w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm"
                                        >
                                            {#each article.sizes as size (size.name)}
                                                <option value={size.name}>
                                                    {size.name} ({formatEuro(size.price || article.price)})
                                                </option>
                                            {/each}
                                        </select>
                                    {:else}
                                        <TextInput {id} value="Keine Größen" disabled readonly />
                                    {/if}
                                {/snippet}
                            </FormField>

                            <FormField label="Menge" class="md:col-span-2">
                                {#snippet children({ id })}
                                    <TextInput {id} type="number" min={1} max={100} bind:value={lines[index].quantity} />
                                {/snippet}
                            </FormField>

                            <div class="md:col-span-2 flex items-center justify-between gap-2">
                                <div class="min-w-0">
                                    <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">Summe</p>
                                    <p class="text-sm font-semibold text-fg">
                                        {formatEuro(unitPrice(line) * (Number(line.quantity) || 0))}
                                    </p>
                                </div>
                                {#if lines.length > 1}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon="trash"
                                        ariaLabel={`Position ${index + 1} entfernen`}
                                        onclick={() => removeLine(index)}
                                    />
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <p class="text-sm text-fg-subtle py-6 text-center">
                            Noch keine Position ausgewählt.
                        </p>
                    {/each}
                </div>
            </Card>

            <Card
                title="Mitglieder"
                subtitle="Die Bestellung wird auf die ausgewählten Mitglieder gebucht."
                meta={`${selectedMembers.length} ausgewählt`}
            >
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {#each data.members as member (member.id)}
                        <label
                            class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-muted transition cursor-pointer"
                        >
                            <span class="text-sm font-semibold text-fg">{member.name}</span>
                            <input
                                type="checkbox"
                                name="memberIds"
                                value={member.id}
                                bind:group={selectedMembers}
                                class="h-5 w-5 rounded border-border-strong"
                            />
                        </label>
                    {/each}
                </div>
            </Card>

            <Card title="Übersicht" meta={`${payload.length} Positionen`}>
                <ul class="divide-y divide-border">
                    {#each lines as line}
                        {@const article = articleById(line.articleId)}
                        <li class="flex items-center justify-between gap-3 py-2">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-fg">{article?.name ?? "Artikel"}</p>
                                <p class="text-xs text-fg-subtle">
                                    {Number(line.quantity) || 0} × {formatEuro(unitPrice(line))}
                                    {#if line.size}<span> · Größe {line.size}</span>{/if}
                                </p>
                            </div>
                            <p class="text-sm font-semibold text-fg">
                                {formatEuro(unitPrice(line) * (Number(line.quantity) || 0))}
                            </p>
                        </li>
                    {/each}
                </ul>

                <div class="flex items-center justify-between pt-4 mt-2 border-t border-border">
                    <span class="text-sm font-semibold text-fg-muted">Gesamt</span>
                    <span class="text-2xl font-bold text-primary">{formatEuro(total)}</span>
                </div>

                {#if !ready}
                    <p class="mt-3">
                        <Badge tone="warning" icon="exclamation-triangle" label="Bitte Position und Mitglied wählen" />
                    </p>
                {/if}
            </Card>

            <div class="flex items-center justify-end gap-3 flex-wrap">
                <Button href="/intern/kaemmerer/order" variant="secondary">Abbrechen</Button>
                <Button type="submit" variant="primary" icon="bag-check" disabled={!ready}>
                    Kostenpflichtig bestellen
                </Button>
            </div>
        </form>
    {/if}
</div>
