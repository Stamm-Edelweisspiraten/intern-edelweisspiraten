<script lang="ts">
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        DataTable,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        SearchInput,
        StatTile,
        TextInput
    } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import { formatEuro } from "$lib/money";
    import { applyTheme, type Theme } from "$lib/theme";

    /**
     * Komponenten-Galerie zur visuellen Abnahme in Hell und Dunkel.
     * Nur im Entwicklungsmodus erreichbar (siehe +page.server.ts).
     */

    interface Row {
        id: string;
        name: string;
        gruppe: string;
        betrag: number;
        status: "offen" | "bezahlt";
    }

    const rows: Row[] = [
        { id: "1", name: "Anna Müller", gruppe: "Wölflinge", betrag: 4500, status: "offen" },
        { id: "2", name: "Ben Schäfer", gruppe: "Jungpfadfinder", betrag: 6000, status: "bezahlt" },
        { id: "3", name: "Clara Groß", gruppe: "Pfadfinder", betrag: 12550, status: "offen" }
    ];

    const columns: Column<Row>[] = [
        { key: "name", label: "Name", value: (r) => r.name },
        { key: "gruppe", label: "Gruppe", value: (r) => r.gruppe },
        { key: "betrag", label: "Betrag", align: "right", value: (r) => formatEuro(r.betrag) },
        { key: "status", label: "Status", cell: status }
    ];

    let search = $state("");
    let modalOpen = $state(false);
    let confirmOpen = $state(false);
    let textValue = $state("");
    let theme = $state<Theme>("system");

    function setTheme(next: Theme) {
        theme = next;
        applyTheme(next);
    }
</script>

{#snippet status(row: Row)}
    <Badge tone={row.status === "bezahlt" ? "success" : "warning"} label={row.status === "bezahlt" ? "Bezahlt" : "Offen"} />
{/snippet}

<svelte:head><title>UI-Galerie</title></svelte:head>

<div class="max-w-6xl mx-auto px-4 py-12 space-y-10">
    <PageHeader
        title="UI-Galerie"
        eyebrow="Entwicklung"
        subtitle="Alle gemeinsamen Komponenten in hellem und dunklem Design."
    >
        {#snippet actions()}
            <Button variant="secondary" icon="sun" onclick={() => setTheme("light")}>Hell</Button>
            <Button variant="secondary" icon="moon-stars" onclick={() => setTheme("dark")}>Dunkel</Button>
            <Button variant="secondary" icon="circle-half" onclick={() => setTheme("system")}>System</Button>
        {/snippet}
    </PageHeader>

    <Card title="Buttons" subtitle="Alle Varianten und Zustände">
        <div class="flex flex-wrap gap-3">
            <Button variant="primary" icon="plus-circle">Primär</Button>
            <Button variant="secondary" icon="arrow-left">Sekundär</Button>
            <Button variant="success" icon="check-circle">Erfolg</Button>
            <Button variant="warning" icon="exclamation-triangle">Warnung</Button>
            <Button variant="danger" icon="trash">Löschen</Button>
            <Button variant="ghost" icon="three-dots">Ghost</Button>
            <Button variant="primary" loading>Lädt</Button>
            <Button variant="primary" disabled>Deaktiviert</Button>
            <Button variant="secondary" size="sm">Klein</Button>
        </div>
    </Card>

    <Card title="Kennzahlen">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Einnahmen" value={formatEuro(452300)} tone="success" icon="arrow-down-circle" />
            <StatTile label="Ausgaben" value={formatEuro(128750)} tone="danger" icon="arrow-up-circle" />
            <StatTile label="Offen" value={formatEuro(23400)} tone="warning" icon="hourglass-split" hint="7 Rechnungen" />
            <StatTile label="Saldo" value={formatEuro(323550)} tone="primary" icon="wallet2" />
        </div>
    </Card>

    <Card title="Hinweise">
        <div class="space-y-3">
            <Alert tone="info" title="Information" message="Beitragssätze wurden aktualisiert." />
            <Alert tone="success" title="Gespeichert" message="Die Änderungen wurden übernommen." />
            <Alert tone="warning" title="Achtung" message="Für dieses Jahr fehlen noch Beiträge." />
            <Alert tone="danger" title="Fehler" message="Der Betrag konnte nicht gelesen werden." />
        </div>
    </Card>

    <Card title="Abzeichen">
        <div class="flex flex-wrap gap-2">
            <Badge tone="neutral" label="Neutral" />
            <Badge tone="primary" label="Primär" />
            <Badge tone="info" label="Info" />
            <Badge tone="success" label="Erfolg" icon="check" />
            <Badge tone="warning" label="Offen" />
            <Badge tone="danger" label="Abgang" />
            <Badge tone="primary" size="xs" label="Aktuelles Jahr" />
        </div>
    </Card>

    <Card title="Formularfelder" subtitle="Label und Feld sind korrekt verknüpft">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Vorname" required>
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} bind:value={textValue} placeholder="Anna" />
                {/snippet}
            </FormField>
            <FormField label="E-Mail" hint="Wird für den Login verwendet.">
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} type="email" placeholder="anna@example.org" />
                {/snippet}
            </FormField>
            <FormField label="Betrag" error="Bitte einen gültigen Betrag eingeben.">
                {#snippet children({ id, describedBy, invalid })}
                    <TextInput {id} {describedBy} {invalid} placeholder="12,50" inputmode="decimal" />
                {/snippet}
            </FormField>
            <FormField label="Suche">
                {#snippet children()}
                    <SearchInput bind:value={search} class="sm:w-full" />
                {/snippet}
            </FormField>
        </div>
    </Card>

    <Card title="Tabelle" subtitle="Eine Definition, zwei Darstellungen — ab xl Tabelle, darunter Karten" padding="none">
        <DataTable
            {columns}
            {rows}
            getKey={(r) => r.id}
            cardTitle={(r) => r.name}
            cardSubtitle={(r) => r.gruppe}
            caption="Beispieldaten"
        >
            {#snippet actions(row)}
                <Button variant="secondary" size="sm" icon="pencil" ariaLabel={`${row.name} bearbeiten`} />
                <Button variant="success" size="sm" icon="check-lg">Bezahlt</Button>
            {/snippet}
        </DataTable>
    </Card>

    <Card title="Leere Zustände" padding="none">
        <DataTable columns={columns} rows={[]} getKey={(r) => r.id} empty="Keine Buchungen vorhanden." />
        <EmptyState
            icon="inbox"
            title="Noch keine Bestellungen"
            description="Sobald eine Bestellung angelegt wurde, erscheint sie hier."
        >
            {#snippet action()}
                <Button variant="primary" icon="plus-circle">Bestellung anlegen</Button>
            {/snippet}
        </EmptyState>
    </Card>

    <Card title="Dialoge">
        <div class="flex flex-wrap gap-3">
            <Button variant="primary" onclick={() => (modalOpen = true)}>Dialog öffnen</Button>
            <Button variant="danger" onclick={() => (confirmOpen = true)}>Löschen (mit Rückfrage)</Button>
        </div>
    </Card>
</div>

<Modal bind:open={modalOpen} title="Transaktion erfassen" description="Escape schließt, Tab bleibt im Dialog.">
    <FormField label="Bezeichnung">
        {#snippet children({ id })}
            <TextInput {id} placeholder="Jahresbeitrag" />
        {/snippet}
    </FormField>
    <FormField label="Betrag">
        {#snippet children({ id })}
            <TextInput {id} placeholder="12,50" inputmode="decimal" />
        {/snippet}
    </FormField>
    {#snippet footer()}
        <Button variant="secondary" onclick={() => (modalOpen = false)}>Abbrechen</Button>
        <Button variant="primary" onclick={() => (modalOpen = false)}>Speichern</Button>
    {/snippet}
</Modal>

<ConfirmDialog
    bind:open={confirmOpen}
    title="Wirklich löschen?"
    message="Diese Aktion kann nicht rückgängig gemacht werden."
    confirmLabel="Endgültig löschen"
    onconfirm={() => {}}
/>
