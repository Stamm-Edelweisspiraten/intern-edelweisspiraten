<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        EmptyState,
        FormField,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import { formatDateTime } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /** Die Adresse kommt genau einmal zurück, direkt nach dem Anlegen. */
    const freshUrl = $derived((form as { url?: string } | null)?.url ?? "");

    let copied = $state(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(freshUrl);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            // Ohne Zugriff auf die Zwischenablage bleibt der Text zum Markieren
            // stehen -- das genügt.
        }
    }
</script>

<svelte:head><title>Kalender abonnieren - Intern</title></svelte:head>

<div class="max-w-3xl mx-auto space-y-8">
    <PageHeader
        title="Kalender abonnieren"
        eyebrow="Profil"
        subtitle="Termine im eigenen Kalenderprogramm – automatisch aktuell."
        back={{ href: "/intern/termine", label: "Zu den Terminen" }}
    />

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}

    {#if freshUrl}
        <Alert tone="success" title="Abonnement angelegt">
            {#snippet children()}
                <p class="text-sm mb-3">
                    Diese Adresse wird <strong>nur jetzt</strong> angezeigt. Trage sie in deinem
                    Kalenderprogramm unter „Kalender abonnieren“ ein.
                </p>

                <div class="flex items-start gap-2 flex-wrap">
                    <code
                        class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface border border-border text-xs break-all"
                    >
                        {freshUrl}
                    </code>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={copied ? "check-lg" : "clipboard"}
                        onclick={copy}
                    >
                        {copied ? "Kopiert" : "Kopieren"}
                    </Button>
                </div>
            {/snippet}
        </Alert>
    {:else if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    <Card title="Neues Abonnement" subtitle="Am besten eines je Gerät.">
        <form method="post" action="?/create" class="space-y-4">
            <FormField
                label="Bezeichnung"
                hint="Damit du später weißt, welches Gerät du widerrufst."
            >
                {#snippet children({ id })}
                    <TextInput {id} name="label" placeholder="Telefon" />
                {/snippet}
            </FormField>

            <div class="flex justify-end">
                <Button type="submit" variant="primary" icon="calendar-plus">
                    Adresse erzeugen
                </Button>
            </div>
        </form>
    </Card>

    <Card title="Bestehende Abonnements" meta={`${data.tokens.length} aktiv`}>
        {#if data.tokens.length === 0}
            <EmptyState
                icon="calendar-x"
                title="Noch kein Abonnement"
                description="Erzeuge oben eine Adresse und trage sie in deinem Kalenderprogramm ein."
            />
        {:else}
            <ul class="divide-y divide-border">
                {#each data.tokens as token (token.id)}
                    <li class="py-3 flex items-center justify-between gap-3 flex-wrap">
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-fg">{token.label}</p>
                            <p class="text-xs text-fg-subtle">
                                Angelegt {formatDateTime(token.createdAt)}
                                {#if token.lastUsedAt}
                                    · zuletzt abgerufen {formatDateTime(token.lastUsedAt)}
                                {:else}
                                    · noch nie abgerufen
                                {/if}
                            </p>
                        </div>

                        <div class="flex items-center gap-2">
                            {#if !token.lastUsedAt}
                                <Badge tone="neutral" size="xs" label="Ungenutzt" />
                            {/if}
                            <form method="post" action="?/revoke">
                                <input type="hidden" name="tokenId" value={token.id} />
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm"
                                    icon="x-circle"
                                    ariaLabel={`Abonnement ${token.label} widerrufen`}
                                >
                                    Widerrufen
                                </Button>
                            </form>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}
    </Card>

    <Alert
        tone="info"
        title="Was im Kalender landet"
        message="Nur die Termine, die für dich freigegeben sind – dieselben wie in der Übersicht. Vergangene Termine bleiben ein Jahr stehen. Wer die Adresse hat, sieht deine Termine: gib sie nicht weiter, und widerrufe sie bei Verlust des Geräts."
    />
</div>
