<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Token = PageData["tokens"][number];

    let addOpen = $state(false);
    let scopeSearch = $state("");
    let deleteTarget = $state<Token | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);
    let copied = $state(false);

    /** Nur genau nach dem Anlegen vorhanden. */
    const freshToken = $derived((form as { token?: string } | null)?.token ?? null);

    const filteredScopes = $derived(
        data.permissions.filter((permission) =>
            permission.toLowerCase().includes(scopeSearch.trim().toLowerCase())
        )
    );

    async function copyToken() {
        if (!freshToken) return;
        try {
            await navigator.clipboard.writeText(freshToken);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            // Ohne Zugriff auf die Zwischenablage bleibt der Text markierbar.
            copied = false;
        }
    }
</script>

<svelte:head><title>API-Tokens – Administration</title></svelte:head>

{#snippet nameCell(token: Token)}
    <div class="flex items-center gap-2 flex-wrap">
        <span class="font-semibold">{token.name}</span>
        {#if token.revokedAt}
            <Badge tone="danger" size="xs" label="widerrufen" />
        {:else if token.inactive}
            <Badge tone="neutral" size="xs" label="abgelaufen" />
        {:else}
            <Badge tone="success" size="xs" label="aktiv" />
        {/if}
    </div>
{/snippet}

{#snippet scopesCell(token: Token)}
    <div class="flex flex-wrap gap-1">
        {#each token.scopes.slice(0, 4) as scope (scope)}
            <Badge tone="neutral" size="xs" label={scope} />
        {/each}
        {#if token.scopes.length > 4}
            <Badge tone="info" size="xs" label={`+${token.scopes.length - 4}`} />
        {/if}
    </div>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="API-Tokens"
        eyebrow="Administration"
        subtitle="Zugänge für Fremdsysteme. Ein Token kann nie mehr als die hier ausgewählten Berechtigungen."
        back={{ href: "/intern/admin" }}
    >
        {#snippet actions()}
            <Button href="/api/v1/openapi.json" variant="secondary" icon="file-earmark-code">
                Schnittstellenbeschreibung
            </Button>
            <Button variant="primary" icon="plus-circle" onclick={() => (addOpen = true)}>
                Token
            </Button>
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}

    {#if freshToken}
        <Card tone="success" title="Token erzeugt">
            <p class="text-sm text-fg-muted">
                Dieses Token wird <strong>nur jetzt</strong> angezeigt. Gespeichert ist nur sein
                Hash — wer es verliert, legt ein neues an.
            </p>
            <div class="mt-4 flex items-center gap-3 flex-wrap">
                <code
                    class="flex-1 min-w-0 px-4 py-3 rounded-control bg-surface border border-border-strong font-mono text-sm break-all"
                >
                    {freshToken}
                </code>
                <Button
                    variant="secondary"
                    icon={copied ? "check-lg" : "clipboard"}
                    onclick={copyToken}
                >
                    {copied ? "Kopiert" : "Kopieren"}
                </Button>
            </div>
        </Card>
    {:else if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    <Card title="Verwendung">
        <p class="text-sm text-fg-muted">
            Das Token wird als Kopfzeile gesendet. Die Antwort ist immer JSON; Fehler folgen
            Problem Details nach RFC 9457.
        </p>
        <pre
            class="mt-3 p-4 rounded-control bg-surface-sunken border border-border overflow-x-auto text-xs font-mono">curl -H "Authorization: Bearer ep_…" \
     https://…/api/v1/journal-entries</pre>
        <p class="text-sm text-fg-muted mt-3">
            Zugriffe aus einem Browser brauchen zusätzlich die Umgebungsvariable
            <code class="font-mono text-xs">API_CORS_ORIGINS</code> mit den erlaubten Herkünften —
            ohne sie ist der Zugriff aus fremden Seiten bewusst gesperrt.
        </p>
    </Card>

    <Card title="Tokens" meta={`${data.tokens.length} gesamt`} padding="none">
        <DataTable
            columns={[
                { key: "name", label: "Bezeichnung", cell: nameCell },
                { key: "prefix", label: "Anfang", value: (t) => `${t.prefix}…` },
                { key: "scopes", label: "Berechtigungen", cell: scopesCell },
                {
                    key: "lastUsed",
                    label: "Zuletzt benutzt",
                    value: (t) => (t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "nie")
                },
                {
                    key: "expires",
                    label: "Gültig bis",
                    value: (t) => (t.expiresAt ? formatDateTime(t.expiresAt) : "unbefristet")
                }
            ] satisfies Column<Token>[]}
            rows={data.tokens}
            getKey={(t) => t.id}
            cardTitle={(t) => t.name}
            cardSubtitle={(t) => `${t.prefix}…`}
            rowClass={(t) => (t.inactive ? "opacity-70" : "")}
            empty="Noch kein Token angelegt."
        >
            {#snippet actions(token)}
                {#if !token.revokedAt}
                    <form method="post" action="?/revoke" class="inline">
                        <input type="hidden" name="id" value={token.id} />
                        <Button type="submit" variant="warning" size="sm" icon="slash-circle">
                            Widerrufen
                        </Button>
                    </form>
                {/if}
                <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    ariaLabel="Token löschen"
                    onclick={() => {
                        deleteTarget = token;
                        deleteOpen = true;
                    }}
                />
            {/snippet}
        </DataTable>
    </Card>
</div>

<Modal bind:open={addOpen} title="API-Token anlegen" size="lg">
    <form method="post" action="?/create" id="token-add" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Bezeichnung" required hint="Wofür wird das Token benutzt?">
                {#snippet children({ id })}
                    <TextInput {id} name="name" placeholder="z. B. Website-Export" required />
                {/snippet}
            </FormField>
            <FormField label="Gültig bis" hint="Leer lassen für unbefristet.">
                {#snippet children({ id })}
                    <TextInput {id} name="expiresAt" type="date" />
                {/snippet}
            </FormField>
        </div>

        <div class="space-y-2">
            <div class="flex items-center justify-between gap-4 flex-wrap">
                <p class="text-sm font-semibold text-fg-muted">Berechtigungen</p>
                <SearchInput
                    bind:value={scopeSearch}
                    placeholder="Berechtigung suchen..."
                    label="Berechtigung suchen"
                />
            </div>

            <div
                class="max-h-64 overflow-y-auto border border-border rounded-control divide-y divide-border"
            >
                {#each filteredScopes as scope (scope)}
                    <label class="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-surface-muted">
                        <input
                            type="checkbox"
                            name="scopes"
                            value={scope}
                            class="border-border-strong"
                        />
                        <span class="font-mono text-sm text-fg">{scope}</span>
                    </label>
                {:else}
                    <p class="px-4 py-3 text-sm text-fg-subtle">Keine passende Berechtigung.</p>
                {/each}
            </div>

            <p class="text-xs text-fg-subtle">
                Gib nur das, was das Fremdsystem wirklich braucht. Ein Token mit
                <code class="font-mono">*</code> kann alles, was das Portal kann.
            </p>
        </div>
    </form>

    {#snippet footer()}
        <Button variant="secondary" onclick={() => (addOpen = false)}>Abbrechen</Button>
        <Button
            variant="primary"
            icon="key"
            onclick={() => document.forms.namedItem("token-add")?.requestSubmit()}
        >
            Token erzeugen
        </Button>
    {/snippet}
</Modal>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Token löschen?"
    message={`„${deleteTarget?.name ?? ""}“ wird dauerhaft entfernt. Systeme, die es benutzen, verlieren sofort den Zugriff.`}
    confirmLabel="Löschen"
    tone="danger"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>
