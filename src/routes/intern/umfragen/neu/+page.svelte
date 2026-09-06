<script lang="ts">
    import { onMount } from "svelte";
    import { enhance } from "$app/forms";
    import {
        Alert,
        Badge,
        Button,
        Card,
        FormField,
        PageHeader,
        Select,
        TextInput,
        Textarea
    } from "$lib/components/ui";
    import { formatDate } from "$lib/format";
    import FieldEditor from "../FieldEditor.svelte";
    import type { ActionData, PageData } from "./$types";

    /**
     * Assistent für eine neue Umfrage.
     *
     * EIN Formular, zwei Abschnitte, EIN Speichervorgang. Der Schritt ist
     * reine Anzeige: die Abschnitte werden mit `hidden` weggeblendet und
     * bleiben dabei im Formular stehen -- ein `{#if}` würde die Felder aus
     * dem Baum nehmen, und der Server bekäme im zweiten Schritt keine
     * Eckdaten mehr.
     *
     * Ohne JavaScript stehen beide Abschnitte untereinander; „Weiter" und
     * „Zurück" erscheinen gar nicht erst, und am Ende stehen die beiden
     * Absende-Knöpfe. Deshalb trägt hier auch KEIN Feld `required`: ein
     * Pflichtfeld in einem weggeblendeten Abschnitt bricht die Prüfung des
     * Browsers ab, ohne dass jemand sieht, woran es liegt. Geprüft wird beim
     * „Weiter" selbst -- und in jedem Fall auf dem Server.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    /**
     * Erst nach dem Einhängen im Browser gibt es Schritte. Vor dem Einhängen
     * -- und für jeden ohne JavaScript -- steht alles untereinander.
     */
    let hydrated = $state(false);
    onMount(() => (hydrated = true));

    let step = $state(1);
    let pending = $state(false);

    /** Was der Browser vor dem „Weiter" prüft; der Server prüft es erneut. */
    let title = $state("");
    let selectedShares = $state<string[]>([]);
    let stepError = $state("");

    const ownGroups = $derived(new Set(data.manageGroups ?? []));

    /** Ist mindestens eine Gruppe gewählt, für die das Recht gilt? */
    const ownGroupChosen = $derived(
        selectedShares.some(
            (entry) => entry.startsWith("group:") && ownGroups.has(entry.slice("group:".length))
        )
    );

    function toStep(next: number) {
        if (next === 2) {
            if (!title.trim()) {
                stepError = "Bitte einen Titel angeben.";
                return;
            }
            if (data.needsGroupShare && !ownGroupChosen) {
                stepError =
                    "Bitte mindestens eine Gruppe freigeben, für die du Umfragen verwalten darfst.";
                return;
            }
        }

        stepError = "";
        step = next;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const eventOptions = $derived(
        data.events.map((entry) => ({
            value: entry.id,
            label: `${formatDate(entry.startsAt)} – ${entry.title}`
        }))
    );

    const shareBlocks = $derived([
        { kind: "group", label: "Gruppen", entries: data.shareOptions.groups },
        { kind: "position", label: "Ämter", entries: data.shareOptions.positions },
        { kind: "role", label: "Rollen", entries: data.shareOptions.roles },
        { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }
    ]);
</script>

<svelte:head><title>Neue Umfrage - Intern</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title="Neue Umfrage"
        eyebrow="Beteiligung"
        subtitle="Eckdaten und Fragen in einem Zug – gespeichert wird erst am Ende."
        back={{ href: "/intern/umfragen", label: "Zur Übersicht" }}
    >
        {#snippet badge()}
            {#if hydrated}
                <Badge tone="primary" size="xs" label={`Schritt ${step} von 2`} />
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if stepError}<Alert tone="danger" message={stepError} />{/if}

    <form
        method="post"
        action="?/create"
        class="space-y-6"
        use:enhance={({ cancel }) => {
            /*
             * Die Absende-Knöpfe stehen im zweiten Abschnitt und sind im
             * ersten nur weggeblendet -- im Baum bleiben sie. Die
             * Eingabetaste in einem Feld des ersten Abschnitts würde damit
             * absenden und die Umfrage anlegen, bevor eine Frage feststeht.
             * Sie blättert stattdessen weiter.
             */
            if (hydrated && step !== 2) {
                cancel();
                toStep(2);
                return;
            }

            pending = true;
            return async ({ update }) => {
                await update();
                pending = false;
            };
        }}
    >
        <!-- Schritt 1: Eckdaten -->
        <div class:hidden={hydrated && step !== 1}>
            <Card title="Eckdaten" subtitle="Worum geht es, wer antwortet und bis wann?">
                <div class="space-y-4">
                    <FormField label="Titel" required>
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="title"
                                bind:value={title}
                                maxlength={200}
                                placeholder="z. B. Essenswünsche Sommerlager"
                            />
                        {/snippet}
                    </FormField>

                    <FormField label="Beschreibung" hint="Steht über den Fragen.">
                        {#snippet children({ id, describedBy })}
                            <Textarea {id} {describedBy} name="description" rows={3} />
                        {/snippet}
                    </FormField>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            label="Wer antwortet?"
                            hint="„Je Mitglied“ für Rückmeldungen, die Eltern für ihre Kinder abgeben."
                        >
                            {#snippet children({ id, describedBy })}
                                <Select
                                    {id}
                                    {describedBy}
                                    name="audience"
                                    value="user"
                                    options={[
                                        { value: "user", label: "Je Zugang" },
                                        { value: "member", label: "Je verknüpftem Mitglied" }
                                    ]}
                                />
                            {/snippet}
                        </FormField>

                        <FormField
                            label="Termin"
                            hint="Freiwillig – verbindet die Umfrage mit einem Termin."
                        >
                            {#snippet children({ id, describedBy })}
                                <Select
                                    {id}
                                    {describedBy}
                                    name="eventId"
                                    options={eventOptions}
                                    placeholder="– kein Termin –"
                                />
                            {/snippet}
                        </FormField>

                        <FormField
                            label="Geöffnet ab"
                            hint="Leer lassen: sofort nach dem Veröffentlichen."
                        >
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name="opensAt"
                                    type="datetime-local"
                                />
                            {/snippet}
                        </FormField>

                        <FormField
                            label="Geschlossen ab"
                            hint="Danach nimmt die Umfrage keine Antwort mehr an."
                        >
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name="closesAt"
                                    type="datetime-local"
                                />
                            {/snippet}
                        </FormField>
                    </div>

                    <fieldset class="space-y-2">
                        <legend class="text-sm font-semibold text-fg-muted">Art der Erhebung</legend>

                        <label class="flex items-start gap-3 text-sm text-fg">
                            <input
                                type="checkbox"
                                name="anonymous"
                                class="mt-1 rounded-control border-border-strong"
                            />
                            <span>
                                Anonym
                                <span class="block text-xs text-fg-subtle">
                                    Die Antwort wird ohne Absender gespeichert. Sie lässt sich
                                    danach weder ändern noch zurücknehmen – das gilt auch für die
                                    Verwaltung.
                                </span>
                            </span>
                        </label>

                        <label class="flex items-start gap-3 text-sm text-fg">
                            <input
                                type="checkbox"
                                name="multiplePerUser"
                                class="mt-1 rounded-control border-border-strong"
                            />
                            <span>
                                Mehrfach absenden erlaubt
                                <span class="block text-xs text-fg-subtle">
                                    Formular statt Umfrage: dieselbe Person darf beliebig oft
                                    absenden.
                                </span>
                            </span>
                        </label>
                    </fieldset>

                    <fieldset class="space-y-2">
                        <legend class="text-sm font-semibold text-fg-muted">Freigaben</legend>
                        <p class="text-xs text-fg-subtle">
                            {#if data.needsGroupShare}
                                Du verwaltest Umfragen nur für einzelne Gruppen – bitte mindestens
                                eine davon freigeben. Sonst legst du etwas an, das du danach nicht
                                mehr bearbeiten darfst.
                            {:else}
                                Ohne Auswahl ist die Umfrage für alle im Stamm sichtbar.
                            {/if}
                        </p>

                        {#each shareBlocks as block (block.kind)}
                            {#if block.entries.length > 0}
                                <div class="space-y-1.5">
                                    <p
                                        class="text-xs font-semibold text-fg-subtle uppercase tracking-wide"
                                    >
                                        {block.label}
                                    </p>
                                    <div class="flex flex-wrap gap-2">
                                        {#each block.entries as option (option.id)}
                                            <label
                                                class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name="share"
                                                    value={`${block.kind}:${option.id}`}
                                                    bind:group={selectedShares}
                                                    class="rounded-control border-border-strong"
                                                />
                                                {option.name}
                                            </label>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </fieldset>
                </div>

                {#snippet footer()}
                    {#if hydrated}
                        <div class="flex justify-end">
                            <Button
                                variant="primary"
                                icon="arrow-right"
                                onclick={() => toStep(2)}
                            >
                                Weiter zu den Fragen
                            </Button>
                        </div>
                    {:else}
                        <p class="text-sm text-fg-muted">
                            Die Fragen stehen im nächsten Abschnitt. Gespeichert wird alles
                            zusammen mit den Knöpfen ganz unten.
                        </p>
                    {/if}
                {/snippet}
            </Card>
        </div>

        <!-- Schritt 2: Fragen -->
        <div class:hidden={hydrated && step !== 2} class="space-y-6">
            <Card
                title="Fragen"
                subtitle="Leere Zeilen werden verworfen – du kannst sie einfach stehen lassen."
            >
                <FieldEditor />
            </Card>

            <Card>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    {#if hydrated}
                        <Button variant="ghost" icon="arrow-left" onclick={() => toStep(1)}>
                            Zurück zu den Eckdaten
                        </Button>
                    {:else}
                        <span></span>
                    {/if}

                    <div class="flex flex-wrap gap-2">
                        <!--
                            Der Modus steht am Knopf, nicht in einem
                            versteckten Feld: so entscheidet der Klick, und es
                            gibt keinen Zustand, der danebenlaufen könnte.
                        -->
                        <Button
                            type="submit"
                            name="modus"
                            value="draft"
                            variant="secondary"
                            icon="save"
                            loading={pending}
                        >
                            Als Entwurf sichern
                        </Button>
                        <Button
                            type="submit"
                            name="modus"
                            value="published"
                            variant="primary"
                            icon="send"
                            loading={pending}
                        >
                            Veröffentlichen
                        </Button>
                    </div>
                </div>

                <p class="mt-3 text-xs text-fg-subtle">
                    Veröffentlichen setzt mindestens eine Frage voraus. Klappt es nicht, bleibt die
                    Umfrage als Entwurf stehen und der Grund steht auf ihrer Seite.
                </p>
            </Card>
        </div>
    </form>
</div>
