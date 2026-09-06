<script lang="ts">
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { page } from "$app/state";
    import {
        Alert, Badge, Button, Card, ConfirmDialog, DataTable,
        PageHeader, SearchInput, Select, StatTile
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { calculateAge, formatDate } from "$lib/format";
    import { readHint } from "$lib/hints";
    import { addToast } from "$lib/toastStore";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Member = PageData["members"][number];

    /**
     * Diese Seite trug bis zuletzt `export const csr = false` -- Suche,
     * Filter, Mehrfachauswahl und Hinweise waren damit im Betrieb komplett
     * funktionslos. Mit den Runes hydriert die Seite wieder.
     *
     * Die Mehrfachauswahl stand bis hierher nur im Kommentar: es gab genau
     * EINE Action (`delete`). Sie kommt jetzt aus DataTable, damit Tabelle und
     * Kartenansicht dieselbe Auswahl teilen.
     */

    let search = $state("");
    let groupFilter = $state("");
    let statusFilter = $state("");
    let deleteTarget = $state<Member | null>(null);
    let deleteOpen = $state(false);
    let deleteForm = $state<HTMLFormElement | null>(null);

    /** Ausgewaehlte Mitglieder, zweiseitig an die Tabelle gebunden. */
    let selected = $state<string[]>([]);
    let bulkDeleteOpen = $state(false);
    let bulkDeleteForm = $state<HTMLFormElement | null>(null);
    let linkFormat = $state("csv");
    let busy = $state<"" | "renew" | "delete">("");

    /** Rueckmeldung einer Weiterleitung (z.B. nach dem Loeschen). */
    const hint = $derived(readHint(page.url.searchParams.get("hinweis")));

    const feedback = $derived(form as { error?: string; success?: string } | null);

    const canCreate = $derived(data.canCreate);

    /**
     * Zustaendigkeit je Mitglied statt einer pauschalen Aussage: `null` heisst
     * stammesweit, sonst zaehlt, ob das Mitglied in einer der Gruppen ist.
     */
    function allowedFor(scope: string[] | null, groups: string[]): boolean {
        if (scope === null) return true;
        return groups.some((id) => scope.includes(id));
    }

    /**
     * Die gesetzten Filter wandern in die Adresse des PDFs, damit die
     * ausgedruckte Liste dasselbe zeigt wie der Bildschirm. Die Volltextsuche
     * bleibt aussen vor -- sie laeuft im Browser und waere serverseitig eine
     * zweite Umsetzung derselben Regeln.
     */
    const listPdfHref = $derived.by(() => {
        const params = new URLSearchParams();
        if (groupFilter) params.set("gruppe", groupFilter);
        if (statusFilter) params.set("status", statusFilter);
        const query = params.toString();
        return `/intern/members/liste.pdf${query ? `?${query}` : ""}`;
    });

    const canEditMember = $derived((member: Member) =>
        allowedFor(data.editableGroups, member.groups)
    );
    const canDeleteMember = $derived((member: Member) =>
        allowedFor(data.deletableGroups, member.groups)
    );

    const groupNameById = $derived(
        new Map(data.groupNames.map((group) => [group.id, group.name]))
    );

    const statuses = $derived(
        Array.from(new Set(data.members.map((m) => m.status).filter(Boolean))).sort()
    );

    const groupOptions = $derived(
        data.groups.map((group) => ({ value: group.id, label: group.name }))
    );
    const statusOptions = $derived(statuses.map((status) => ({ value: status, label: status })));

    const filtered = $derived(
        data.members.filter((member) => {
            if (groupFilter && !member.groups.includes(groupFilter)) return false;
            if (statusFilter && member.status !== statusFilter) return false;

            const needle = search.trim().toLowerCase();
            if (!needle) return true;

            const haystack = [
                member.firstname,
                member.lastname,
                member.fahrtenname,
                member.stand,
                member.status,
                ...(member.emails ?? []).map((e: { email: string }) => e.email),
                ...member.groups.map((id: string) => groupNameById.get(id) ?? "")
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(needle);
        })
    );

    const stats = $derived({
        total: data.members.length,
        active: data.members.filter((m) => m.status === "aktiv").length,
        minors: data.members.filter((m) => {
            const age = calculateAge(m.birthday);
            return age !== null && age < 18;
        }).length
    });

    // -----------------------------------------------------------------------
    // Mehrfachauswahl
    // -----------------------------------------------------------------------

    /**
     * Auswaehlbar ist, woran sich ueberhaupt etwas tun laesst. Ein Mitglied,
     * das nur angesehen werden darf, gehoert in keine Sammelaktion -- sonst
     * antwortet der Server auf eine sichtbare Schaltflaeche mit 403.
     */
    const selectDisabled = $derived(
        (member: Member) => !canEditMember(member) && !canDeleteMember(member)
    );

    const selectedMembers = $derived(data.members.filter((m) => selected.includes(m.id)));

    /** Sammelaktionen gelten nur, wenn sie fuer JEDE Zeile der Auswahl erlaubt sind. */
    const canDeleteSelection = $derived(
        selectedMembers.length > 0 && selectedMembers.every(canDeleteMember)
    );
    const canRenewSelection = $derived(
        selectedMembers.length > 0 && selectedMembers.every(canEditMember)
    );

    const selectableVisible = $derived(filtered.filter((m) => !selectDisabled(m)));

    const emailHref = $derived(`/intern/email?members=${selected.join(",")}`);

    function selectAllVisible() {
        selected = [...new Set([...selected, ...selectableVisible.map((m) => m.id)])];
    }

    function clearSelection() {
        selected = [];
    }

    function askDelete(member: Member) {
        deleteTarget = member;
        deleteOpen = true;
    }

    /**
     * Einladungslink in die Zwischenablage.
     *
     * Der Link selbst ist kein Geheimnis; ohne gueltigen Code nuetzt er aber
     * nichts, deshalb der Hinweis statt eines stillen Kopierens.
     */
    async function copyInviteLink(member: Member) {
        const name = `${member.firstname} ${member.lastname}`.trim();

        if (member.inviteStatus === "fehlt") {
            addToast(`Für ${name} ist kein Einladungscode hinterlegt.`, "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(`${data.inviteBaseUrl}/join/${member.id}`);
            addToast(
                member.inviteStatus === "abgelaufen"
                    ? `Link für ${name} kopiert – der Code ist abgelaufen.`
                    : `Einladungslink für ${name} kopiert.`,
                member.inviteStatus === "abgelaufen" ? "info" : "success"
            );
        } catch {
            addToast("Der Link konnte nicht kopiert werden.", "error");
        }
    }

    /** Nach jeder Sammelaktion die Tabelle nachziehen, sonst steht sie veraltet da. */
    function bulkSubmit(kind: "renew" | "delete") {
        return () => {
            busy = kind;
            return async ({ result, update }: { result: { type: string }; update: (options?: { reset?: boolean }) => Promise<void> }) => {
                await update({ reset: false });
                await invalidateAll();
                if (result.type === "success") selected = [];
                busy = "";
            };
        };
    }

    const STATUS_TONES: Record<string, "success" | "warning" | "neutral"> = {
        aktiv: "success",
        passiv: "warning"
    };

    const INVITE_TONES = {
        gueltig: "success",
        abgelaufen: "warning",
        fehlt: "neutral"
    } as const;

    const INVITE_LABELS = {
        gueltig: "gültig",
        abgelaufen: "abgelaufen",
        fehlt: "kein Code"
    } as const;
</script>

<svelte:head><title>Mitglieder - Intern</title></svelte:head>

{#snippet nameCell(member: Member)}
    <a href={`/intern/members/${member.id}`} class="font-semibold text-fg hover:text-primary transition">
        {member.firstname} {member.lastname}
    </a>
    {#if member.fahrtenname}
        <span class="block text-xs text-fg-subtle">„{member.fahrtenname}“</span>
    {/if}
{/snippet}

{#snippet groupsCell(member: Member)}
    {#if member.groups.length === 0}
        <span class="text-fg-subtle">–</span>
    {:else}
        <div class="flex flex-wrap gap-1">
            {#each member.groups as groupId (groupId)}
                <Badge tone="neutral" size="xs" label={groupNameById.get(groupId) ?? "Unbekannt"} />
            {/each}
        </div>
    {/if}
{/snippet}

{#snippet statusCell(member: Member)}
    <Badge tone={STATUS_TONES[member.status] ?? "neutral"} size="xs" label={member.status || "–"} />
{/snippet}

{#snippet inviteCell(member: Member)}
    <Badge
        tone={INVITE_TONES[member.inviteStatus]}
        size="xs"
        label={INVITE_LABELS[member.inviteStatus]}
    />
    {#if member.inviteStatus !== "fehlt" && member.inviteExpiresAt}
        <span class="block text-xs text-fg-subtle tabular-figures">
            bis {formatDate(member.inviteExpiresAt)}
        </span>
    {/if}
{/snippet}

{#snippet ageCell(member: Member)}
    {@const age = calculateAge(member.birthday)}
    <span class="text-sm">{age !== null ? `${age} Jahre` : "–"}</span>
    <span class="block text-xs text-fg-subtle">{formatDate(member.birthday)}</span>
{/snippet}

<div class="space-y-8">
    <PageHeader
        title="Mitgliedverwaltung"
        eyebrow="Intern"
        subtitle="Alle Mitglieder des Stammes mit Gruppen, Stand und Kontaktdaten."
    >
        {#snippet actions()}
            <SearchInput bind:value={search} placeholder="Name, Gruppe, E-Mail..." label="Mitglieder durchsuchen" />
            <Button href={listPdfHref} variant="secondary" icon="file-earmark-pdf">
                Liste als PDF
            </Button>
            {#if canCreate}
                <Button href="/intern/members/create" variant="primary" icon="person-plus">
                    Mitglied anlegen
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if hint}<Alert tone={hint.tone} message={hint.message} />{/if}
    {#if feedback?.error}<Alert tone="danger" message={feedback.error} />{/if}
    {#if feedback?.success}<Alert tone="success" message={feedback.success} />{/if}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Mitglieder" value={stats.total} tone="primary" icon="people" />
        <StatTile label="Aktiv" value={stats.active} tone="success" icon="person-check" />
        <StatTile label="Unter 18" value={stats.minors} tone="neutral" icon="person-hearts" />
    </div>

    {#if selected.length > 0}
        <Card
            tone="primary"
            title={selected.length === 1 ? "1 Mitglied ausgewählt" : `${selected.length} Mitglieder ausgewählt`}
            subtitle="Die Aktionen gelten für die gesamte Auswahl."
        >
            {#snippet actions()}
                <Button
                    variant="ghost"
                    size="sm"
                    icon="check-all"
                    onclick={selectAllVisible}
                    disabled={selectableVisible.length === 0}
                >
                    Alle sichtbaren auswählen
                </Button>
                <Button variant="ghost" size="sm" icon="x-lg" onclick={clearSelection}>
                    Auswahl aufheben
                </Button>
            {/snippet}

            <div class="flex flex-wrap items-end gap-3">
                <!--
                    Reines Formular ohne use:enhance: die Antwort ist eine
                    Datei, und eine Form-Action kann keine liefern. So
                    funktioniert der Weg auch ohne JavaScript.
                -->
                <form
                    method="post"
                    action="/intern/members/einladungslinks"
                    class="flex flex-wrap items-end gap-2"
                >
                    {#each selected as id (id)}
                        <input type="hidden" name="ids" value={id} />
                    {/each}

                    <label class="text-xs text-fg-muted">
                        Format
                        <Select
                            bind:value={linkFormat}
                            name="format"
                            class="mt-1"
                            options={[
                                { value: "csv", label: "CSV (Excel)" },
                                { value: "json", label: "JSON" },
                                { value: "txt", label: "Textdatei" }
                            ]}
                        />
                    </label>

                    <Button type="submit" variant="secondary" icon="download">
                        Einladungslinks herunterladen
                    </Button>
                </form>

                <Button href={emailHref} variant="secondary" icon="envelope">
                    E-Mail schreiben
                </Button>

                <form method="post" action="?/renewInvites" use:enhance={bulkSubmit("renew")}>
                    {#each selected as id (id)}
                        <input type="hidden" name="ids" value={id} />
                    {/each}
                    <Button
                        type="submit"
                        variant="secondary"
                        icon="arrow-repeat"
                        loading={busy === "renew"}
                        disabled={!canRenewSelection || busy !== ""}
                        title={canRenewSelection
                            ? undefined
                            : "Für mindestens ein ausgewähltes Mitglied fehlt das Änderungsrecht."}
                    >
                        Einladungscodes erneuern
                    </Button>
                </form>

                <Button
                    variant="danger"
                    icon="trash"
                    loading={busy === "delete"}
                    disabled={!canDeleteSelection || busy !== ""}
                    onclick={() => (bulkDeleteOpen = true)}
                    title={canDeleteSelection
                        ? undefined
                        : "Für mindestens ein ausgewähltes Mitglied fehlt das Löschrecht."}
                >
                    Löschen
                </Button>
            </div>
        </Card>
    {/if}

    <Card padding="none">
        {#snippet header()}
            <div class="flex flex-wrap gap-3 items-end">
                <label class="text-xs text-fg-subtle">
                    Gruppe
                    <Select
                        bind:value={groupFilter}
                        options={groupOptions}
                        placeholder="Alle Gruppen"
                        class="mt-1"
                    />
                </label>

                <label class="text-xs text-fg-subtle">
                    Status
                    <Select
                        bind:value={statusFilter}
                        options={statusOptions}
                        placeholder="Alle"
                        class="mt-1"
                    />
                </label>

                {#if groupFilter || statusFilter || search}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="x-lg"
                        onclick={() => {
                            groupFilter = "";
                            statusFilter = "";
                            search = "";
                        }}
                    >
                        Filter zurücksetzen
                    </Button>
                {/if}
            </div>
        {/snippet}

        {#snippet actions()}
            <Badge tone="info" size="xs" label={`${filtered.length} von ${data.members.length}`} />
        {/snippet}

        <DataTable
            columns={[
                { key: "name", label: "Name", cell: nameCell },
                { key: "stand", label: "Stand", value: (m) => m.stand || "–" },
                { key: "groups", label: "Gruppen", cell: groupsCell },
                { key: "age", label: "Alter", cell: ageCell },
                { key: "status", label: "Status", cell: statusCell },
                { key: "invite", label: "Einladung", cell: inviteCell }
            ] satisfies Column<Member>[]}
            rows={filtered}
            getKey={(m) => m.id}
            cardTitle={(m) => `${m.firstname} ${m.lastname}`}
            cardSubtitle={(m) => m.stand || undefined}
            selectable
            bind:selected
            selectLabel={(m) => `${m.firstname} ${m.lastname} auswählen`}
            selectDisabled={selectDisabled}
            empty={search || groupFilter || statusFilter
                ? "Keine Mitglieder passen zu den Filtern."
                : "Noch keine Mitglieder erfasst."}
        >
            {#snippet actions(member)}
                <Button
                    href={`/intern/members/${member.id}`}
                    variant="secondary"
                    size="sm"
                    icon={canEditMember(member) ? "pencil" : "eye"}
                >
                    {canEditMember(member) ? "Bearbeiten" : "Ansehen"}
                </Button>

                <!-- Wer das Mitglied hier sieht, darf auch die Einladung holen. -->
                <Button
                    variant="ghost"
                    size="sm"
                    icon="clipboard"
                    ariaLabel={`Einladungslink für ${member.firstname} ${member.lastname} kopieren`}
                    title="Einladungslink kopieren"
                    onclick={() => copyInviteLink(member)}
                />

                <Button
                    href={`/intern/members/${member.id}/invite.pdf`}
                    variant="ghost"
                    size="sm"
                    icon="file-earmark-pdf"
                    ariaLabel={`Einladung für ${member.firstname} ${member.lastname} herunterladen`}
                />

                {#if canDeleteMember(member)}
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        ariaLabel={`${member.firstname} ${member.lastname} löschen`}
                        onclick={() => askDelete(member)}
                    />
                {/if}
            {/snippet}
        </DataTable>
    </Card>
</div>

<form method="post" action="?/delete" bind:this={deleteForm} class="hidden">
    <input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
</form>

<form
    method="post"
    action="?/deleteSelected"
    bind:this={bulkDeleteForm}
    class="hidden"
    use:enhance={bulkSubmit("delete")}
>
    {#each selected as id (id)}
        <input type="hidden" name="ids" value={id} />
    {/each}
</form>

<ConfirmDialog
    bind:open={deleteOpen}
    title="Mitglied löschen?"
    message={deleteTarget
        ? `${deleteTarget.firstname} ${deleteTarget.lastname} wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
        : ""}
    confirmLabel="Endgültig löschen"
    onconfirm={() => deleteForm?.requestSubmit()}
    oncancel={() => (deleteTarget = null)}
/>

<ConfirmDialog
    bind:open={bulkDeleteOpen}
    title="Auswahl löschen?"
    message={selected.length === 1
        ? "Das ausgewählte Mitglied wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
        : `${selected.length} Mitglieder werden dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
    confirmLabel="Endgültig löschen"
    onconfirm={() => bulkDeleteForm?.requestSubmit()}
/>
