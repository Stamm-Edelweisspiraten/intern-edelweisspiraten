<script lang="ts">
    import { Badge, Card, EmptyState, PageHeader } from "$lib/components/ui";
    import { formatDateTime } from "$lib/format";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    const ACTION_TONES = {
        create: "success",
        update: "info",
        delete: "danger"
    } as const;

    const ACTION_LABELS = {
        create: "Angelegt",
        update: "Geändert",
        delete: "Gelöscht"
    } as const;

    /** Werte lesbar darstellen statt roher JSON-Ausgabe. */
    function display(value: unknown): string {
        if (value === null || value === undefined || value === "") return "—";
        if (Array.isArray(value)) {
            return value.length === 0 ? "—" : value.map(display).join(", ");
        }
        if (typeof value === "object") return JSON.stringify(value);
        if (typeof value === "boolean") return value ? "ja" : "nein";
        return String(value);
    }
</script>

<svelte:head><title>Änderungen - {data.member.firstname} {data.member.lastname}</title></svelte:head>

<div class="max-w-3xl mx-auto space-y-8">
    <PageHeader
        title="Änderungsprotokoll"
        eyebrow="Mitglied"
        subtitle={`${data.member.firstname} ${data.member.lastname}${data.member.fahrtenname ? ` („${data.member.fahrtenname}“)` : ""}`}
        back={{ href: `/intern/members/${data.member.id}`, label: "Zum Mitglied" }}
    />

    {#if data.member.updatedAt}
        <p class="text-sm text-fg-subtle">
            Zuletzt geändert {formatDateTime(data.member.updatedAt)}
            {#if data.member.updatedBy}von {data.member.updatedBy}{/if}
        </p>
    {/if}

    {#if (data.logs ?? []).length === 0}
        <Card>
            <EmptyState
                icon="clock-history"
                title="Keine Änderungen protokolliert"
                description="Sobald Daten dieses Mitglieds geändert werden, erscheinen sie hier."
            />
        </Card>
    {:else}
        <div class="space-y-3">
            {#each data.logs as log (log.createdAt + log.action)}
                <Card padding="sm">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <p class="text-sm text-fg-muted">
                            {formatDateTime(log.createdAt)} · {log.user}
                        </p>
                        <Badge
                            tone={ACTION_TONES[log.action as keyof typeof ACTION_TONES] ?? "neutral"}
                            size="xs"
                            label={ACTION_LABELS[log.action as keyof typeof ACTION_LABELS] ?? log.action}
                        />
                    </div>

                    {#if log.changes && log.changes.length > 0}
                        <div class="mt-3 overflow-x-auto">
                            <table class="w-full text-sm">
                                <caption class="sr-only">Geänderte Felder</caption>
                                <thead>
                                    <tr>
                                        <th scope="col" class="text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide pb-1">Feld</th>
                                        <th scope="col" class="text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide pb-1">Vorher</th>
                                        <th scope="col" class="text-left text-xs font-semibold text-fg-subtle uppercase tracking-wide pb-1">Nachher</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border">
                                    {#each log.changes as change (change.field)}
                                        <tr>
                                            <td class="py-1.5 pr-3 font-semibold text-fg align-top">{change.field}</td>
                                            <td class="py-1.5 pr-3 text-fg-muted align-top break-words">{display(change.before)}</td>
                                            <td class="py-1.5 text-fg align-top break-words">{display(change.after)}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {:else}
                        <p class="mt-2 text-sm text-fg-subtle">Keine Felddetails vorhanden.</p>
                    {/if}
                </Card>
            {/each}
        </div>
    {/if}
</div>
