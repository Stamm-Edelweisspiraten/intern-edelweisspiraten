<script lang="ts">
    /**
     * Die Ausfuellansicht einer Umfrage -- eine Feldlogik fuer zwei Stellen.
     *
     * Benutzt von `/intern/umfragen/[id]` (angemeldet, bei Mitglieder-Umfragen
     * je Mitglied ein Block) und von `/umfrage/[token]` (ohne Anmeldung). Waere
     * sie zweimal gebaut, liefen elf Feldtypen, „Sonstiges" und die Skala
     * auseinander -- und der Unterschied fiele erst auf, wenn jemand ueber den
     * einen Weg etwas absendet, das der andere nicht kennt.
     *
     * Sie rendert bewusst KEIN `<form>` und keinen Absenden-Knopf: die beiden
     * Seiten haben verschiedene Aktionen und Knoepfe. Dafuer gibt es das
     * Snippet `footer`.
     *
     * Nichts aus `$lib/server` -- sonst zoege der Bauschritt den Datenbankzweig
     * ins Browser-Buendel und braeche ab.
     */
    import type { Snippet } from "svelte";
    import { Alert, FormField, TextInput } from "$lib/components/ui";
    import { expectsAnswer } from "$lib/surveys/fields";
    import SurveyField from "./SurveyField.svelte";
    import type { SurveyFormField, SurveyNameMode } from "./index";
    import { SURVEY_NAME_ERROR, SURVEY_NAME_FIELD } from "./index";

    interface Props {
        fields: SurveyFormField[];
        values?: Record<string, string | string[]>;
        otherValues?: Record<string, string>;
        fieldErrors?: Record<string, string>;
        editable?: boolean;
        nameMode?: SurveyNameMode;
        nameValue?: string;
        prefix?: string;
        /** Absenden-Leiste; steht unter dem Fortschritt. */
        footer?: Snippet;
    }

    let {
        fields,
        values = {},
        otherValues = {},
        fieldErrors = {},
        editable = true,
        nameMode = "none",
        nameValue = "",
        prefix = "f_",
        footer
    }: Props = $props();

    /*
     * Der eigene Zustand beginnt bei den Serverwerten und laeuft danach
     * mit den Eingaben mit -- nur fuer den Fortschritt. Abgeschickt wird
     * ohnehin, was in den Feldern steht; ohne JavaScript bleibt der Zaehler
     * einfach beim Anfangswert stehen und das Formular funktioniert trotzdem.
     */
    let entered = $state<Record<string, string | string[]>>({ ...values });
    let others = $state<Record<string, string>>({ ...otherValues });

    /** Fragen ohne die Zwischenueberschriften -- nur die zaehlen. */
    const questions = $derived(fields.filter((field) => expectsAnswer(field.type)));

    /** Fortlaufende Nummer je Frage; Ueberschriften bekommen keine. */
    const numbers = $derived.by(() => {
        const map = new Map<string, number>();
        let next = 1;
        for (const field of fields) {
            if (!expectsAnswer(field.type)) continue;
            map.set(field.id, next);
            next += 1;
        }
        return map;
    });

    function filled(field: SurveyFormField): boolean {
        const value = entered[field.id];
        if (Array.isArray(value)) return value.length > 0;
        return typeof value === "string" && value.trim().length > 0;
    }

    const answered = $derived(questions.filter(filled).length);

    /** Die Fehlerliste oben -- der Weg zurueck zur betroffenen Frage. */
    const errorList = $derived(
        fields
            .filter((field) => fieldErrors[field.id])
            .map((field) => ({ id: field.id, label: field.label, message: fieldErrors[field.id] }))
    );

    const nameError = $derived(fieldErrors[SURVEY_NAME_ERROR]);
</script>

{#if !editable}
    <Alert
        tone="info"
        message="Diese Umfrage nimmt keine Antworten mehr an. Die Angaben stehen nur noch zum Nachlesen."
    />
{/if}

{#if errorList.length > 0 || nameError}
    <!--
        Ohne diese Liste sucht jemand mit einem Fehler bei Frage 3 von 20 die
        Stelle selbst. Die Verweise springen an das jeweilige Feld -- dafuer
        vergibt SurveyField ein stabiles `id` der Form `f-<Feldkennung>`.
    -->
    <Alert tone="danger" title="Bitte die markierten Angaben prüfen">
        <ul class="list-disc pl-5 space-y-1 mt-1 text-sm">
            {#if nameError}
                <li><a href="#{SURVEY_NAME_FIELD}" class="underline">Dein Name: {nameError}</a></li>
            {/if}
            {#each errorList as entry (entry.id)}
                <li>
                    <a href={`#f-${entry.id}`} class="underline">{entry.label}: {entry.message}</a>
                </li>
            {/each}
        </ul>
    </Alert>
{/if}

<div class="space-y-5">
    {#if nameMode !== "none"}
        <FormField
            id={SURVEY_NAME_FIELD}
            label="Dein Name"
            hint={nameMode === "required"
                ? "Damit wir deine Antwort zuordnen können."
                : "Freiwillig – du kannst das Feld leer lassen."}
            required={nameMode === "required"}
            error={nameError}
        >
            {#snippet children({ id, describedBy, invalid })}
                <TextInput
                    {id}
                    {describedBy}
                    {invalid}
                    name={SURVEY_NAME_FIELD}
                    value={nameValue}
                    disabled={!editable}
                    maxlength={120}
                    autocomplete="name"
                    placeholder="Vorname Nachname"
                />
            {/snippet}
        </FormField>
    {/if}

    {#each fields as field (field.id)}
        <SurveyField
            {field}
            {prefix}
            number={numbers.get(field.id) ?? null}
            value={entered[field.id] ?? (field.type === "multi" ? [] : "")}
            otherValue={others[field.id] ?? ""}
            error={fieldErrors[field.id]}
            disabled={!editable}
            onchange={(next) => {
                entered = { ...entered, [field.id]: next.value };
                others = { ...others, [field.id]: next.otherValue };
            }}
        />
    {/each}
</div>

{#if questions.length > 0}
    <div class="flex items-center justify-between gap-4 flex-wrap border-t border-border pt-4">
        <!--
            Kein Fortschrittsbalken: er braeuchte JavaScript und behauptete auf
            einer Seite, die einmal abgeschickt wird, eine Bewegung, die es
            nicht gibt. Eine ruhige Zeile sagt dasselbe und bleibt ohne Skript
            richtig.
        -->
        <p class="text-sm text-fg-muted" aria-live="polite">
            {answered} von {questions.length} beantwortet
            {#if questions.some((field) => field.required)}
                <span class="text-fg-subtle">
                    · {questions.filter((field) => field.required).length} Pflichtfragen
                </span>
            {/if}
        </p>

        {#if footer}{@render footer()}{/if}
    </div>
{:else}
    <p class="text-sm text-fg-subtle">Zu dieser Umfrage gibt es noch keine Fragen.</p>
{/if}
