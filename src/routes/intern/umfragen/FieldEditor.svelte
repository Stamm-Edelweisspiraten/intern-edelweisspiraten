<script lang="ts">
    /**
     * Der Fragen-Editor -- eine Bauform für zwei Stellen.
     *
     * Benutzt vom Assistenten `/intern/umfragen/neu` (Schritt 2) und von
     * `/intern/umfragen/[id]/fragen`. Wäre er zweimal gebaut, liefen elf
     * Feldtypen, die Optionsschlüssel, „Sonstiges" und die Grenzen
     * auseinander -- und der Unterschied fiele erst auf, wenn eine Umfrage
     * über den einen Weg entsteht und über den anderen bearbeitet wird.
     *
     * Sie liegt bewusst NEBEN den Routen und nicht in `$lib/components`: sie
     * kennt die Formularfeldnamen dieser beiden Aktionen und ist außerhalb
     * dieses Verzeichnisses nutzlos.
     *
     * Sie rendert KEIN `<form>` und keinen Absenden-Knopf -- der Assistent
     * schickt sie zusammen mit den Eckdaten in EINEM Formular ab, die
     * Fragenseite allein. Dasselbe Muster wie bei `SurveyForm`.
     *
     * --- Ohne JavaScript ---
     * Die Zeilen stehen als gewöhnliche Formularfelder im HTML: die
     * vorhandenen Fragen plus `reserve` leere Reservezeilen. Wer kein
     * JavaScript hat, füllt die Reservezeilen aus und speichert -- leere
     * Beschriftungen verwirft `setSurveyFields` ohnehin. Eine Frage
     * „entfernen" heißt dann: ihre Beschriftung leeren.
     *
     * Umsortieren (↑/↓) und „Frage hinzufügen" brauchen JavaScript. Die
     * Alternative wäre ein Positionsfeld je Zeile gewesen, nach dem der
     * Server sortiert. Dagegen sprach der Assistent: dort steht der Editor in
     * demselben Formular wie die Eckdaten und wird genau EINMAL abgeschickt.
     * Ein serverseitiges Umsortieren bräuchte einen Zwischenspeicher -- also
     * genau den halbfertigen Entwurf, den der Assistent vermeiden soll. Die
     * Reihenfolge folgt deshalb der Reihenfolge im HTML.
     */
    import { Alert, Button, FormField, Select, TextInput } from "$lib/components/ui";
    import {
        allowsOther,
        fieldTypeName,
        hasRange,
        needsOptions,
        SURVEY_FIELD_TYPES,
        type SurveyFieldType
    } from "$lib/surveys/fields";

    /** Eine Frage, so wie sie aus `getSurvey` kommt (Zusatzspalten stören nicht). */
    interface IncomingField {
        id: string;
        type: SurveyFieldType;
        label: string;
        help: string;
        required: boolean;
        allowOther: boolean;
        minValue: number | null;
        maxValue: number | null;
        options: { value: string; label: string }[];
    }

    interface Props {
        /** Der Ausgangsstand. Leer beim Anlegen. */
        fields?: IncomingField[];
        /**
         * Es liegen Antworten vor: Ergänzen und Umbenennen bleiben erlaubt,
         * Löschen und Typwechsel nicht. Das ist die Regel aus
         * `setSurveyFields`; die Oberfläche zeigt sie nur an.
         */
        locked?: boolean;
        /** Leere Zeilen zum Weitertippen -- der Weg ohne JavaScript. */
        reserve?: number;
    }

    let { fields = [], locked = false, reserve = 3 }: Props = $props();

    interface OptionRow {
        /** Der bisherige Schlüssel; leer bei einer neuen Zeile. */
        value: string;
        label: string;
    }

    interface EditorRow {
        /** Nur für `{#each}` -- steht in keinem Formularfeld. */
        key: number;
        /** Die Kennung der BESTEHENDEN Frage; leer bei einer neuen. */
        id: string;
        type: SurveyFieldType;
        label: string;
        help: string;
        required: boolean;
        allowOther: boolean;
        /** Als Text, damit ein leeres Feld leer bleibt und nicht zu 0 wird. */
        minValue: string;
        maxValue: string;
        options: OptionRow[];
    }

    let nextKey = 0;

    /** Zwei freie Optionszeilen je Frage -- ebenfalls für den Weg ohne Skript. */
    const OPTION_RESERVE = 2;

    function blankOptions(count = OPTION_RESERVE): OptionRow[] {
        return Array.from({ length: count }, () => ({ value: "", label: "" }));
    }

    function emptyRow(): EditorRow {
        return {
            key: (nextKey += 1),
            id: "",
            type: "text",
            label: "",
            help: "",
            required: false,
            allowOther: false,
            minValue: "",
            maxValue: "",
            options: blankOptions()
        };
    }

    function numberText(value: number | null): string {
        return value === null || value === undefined ? "" : String(value);
    }

    /**
     * Der Anfangsstand wird EINMAL gebaut.
     *
     * Ein `$state`, das dauerhaft neben den geladenen Daten herliefe, ginge
     * beim nächsten Speichern auseinander. Wer den gespeicherten Stand wieder
     * sehen will, lädt die Seite neu -- die Fragenseite umschließt den Editor
     * dafür mit `{#key}`.
     */
    let rows = $state<EditorRow[]>([
        ...fields.map((field) => ({
            key: (nextKey += 1),
            id: field.id,
            type: field.type,
            label: field.label,
            help: field.help,
            required: field.required,
            allowOther: field.allowOther,
            minValue: numberText(field.minValue),
            maxValue: numberText(field.maxValue),
            options: [...field.options.map((option) => ({ ...option })), ...blankOptions()]
        })),
        ...Array.from({ length: reserve }, () => emptyRow())
    ]);

    /** Eine bestehende Frage ist bei vorliegenden Antworten festgeschrieben. */
    function frozen(row: EditorRow): boolean {
        return locked && row.id !== "";
    }

    function addRow() {
        rows = [...rows, emptyRow()];
    }

    function removeRow(index: number) {
        rows = rows.filter((_, position) => position !== index);
    }

    function moveRow(index: number, delta: number) {
        const target = index + delta;
        if (target < 0 || target >= rows.length) return;

        const copy = [...rows];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        rows = copy;
    }

    /** Eine neue Option bekommt ihren stabilen Wert erst beim Speichern. */
    function addOption(index: number) {
        rows[index].options = [...rows[index].options, { value: "", label: "" }];
    }

    /**
     * Eine Optionszeile mit bestehendem Schlüssel wird nur GELEERT, nicht
     * entfernt: `mergeOptionValues` verwirft leere Beschriftungen ohnehin, und
     * so bleibt die Paarung aus `optionValues_*` und `optionLabels_*` über die
     * Position erhalten.
     */
    function removeOption(index: number, position: number) {
        rows[index].options = rows[index].options.filter((_, entry) => entry !== position);
    }

    const typeOptions = SURVEY_FIELD_TYPES.map((entry) => ({
        value: entry.key,
        label: entry.name
    }));

    function typeHint(type: SurveyFieldType): string {
        return SURVEY_FIELD_TYPES.find((entry) => entry.key === type)?.hint ?? "";
    }

    /** Die Beschriftung des Zahlenpaars unterscheidet sich je Typ deutlich. */
    function rangeLabels(type: SurveyFieldType): { min: string; max: string; hint: string } {
        return type === "scale"
            ? {
                  min: "Skala von",
                  max: "bis",
                  hint: "Vorgabe 1 bis 5, höchstens zehn Stufen."
              }
            : {
                  min: "Kleinster Wert",
                  max: "Größter Wert",
                  hint: "Beide freiwillig – leer heißt: keine Grenze."
              };
    }
</script>

<!--
    Der Zähler sagt dem Server, wie viele Zeilen er lesen soll. Ohne
    JavaScript steht hier der Wert aus dem HTML und passt zu den gerenderten
    Zeilen; mit JavaScript läuft er mit `rows` mit.
-->
<input type="hidden" name="fieldCount" value={rows.length} />

<div class="space-y-4">
    {#if locked}
        <Alert
            tone="info"
            title="Es liegen bereits Antworten vor"
            message="Fragen ergänzen und umbenennen ist weiterhin möglich. Nur Löschen und der Wechsel des Typs sind gesperrt – sonst stünden in der Auswertung Antworten ohne Feld beziehungsweise Werte, die es in diesem Feld nie geben konnte."
        />
    {/if}

    {#each rows as row, index (row.key)}
        <fieldset class="p-4 rounded-card border border-border space-y-3">
            <legend class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                Frage {index + 1}
                {#if frozen(row)}
                    <span class="normal-case font-normal">· festgeschrieben</span>
                {/if}
            </legend>

            <!--
                Die Kennung fährt versteckt mit. Ohne sie gälte die Frage als
                gelöscht und neu angelegt -- und `setSurveyFields` weist genau
                das ab, sobald Antworten vorliegen.
            -->
            <input type="hidden" name={`fieldId_${index}`} value={row.id} />

            <div class="flex items-start gap-2">
                <div class="flex-1 space-y-3">
                    <FormField
                        label={row.type === "section" ? "Überschrift" : "Frage"}
                        hint={row.type === "section"
                            ? "Gliedert das Formular, wird nicht beantwortet."
                            : undefined}
                    >
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name={`label_${index}`}
                                bind:value={row.label}
                                maxlength={300}
                                placeholder={row.type === "section"
                                    ? "z. B. Verpflegung"
                                    : "z. B. Was isst du nicht?"}
                            />
                        {/snippet}
                    </FormField>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {#if frozen(row)}
                            <!--
                                Ein abgeschaltetes `<select>` wird gar nicht
                                mitgeschickt; der Server läse daraus eine
                                fehlende Frage. Deshalb steht der Typ als Text
                                da und fährt versteckt mit.
                            -->
                            <input type="hidden" name={`type_${index}`} value={row.type} />
                            <!--
                                Kein `FormField`: dessen `<label for=…>` zeigte
                                hier auf kein Eingabefeld, und ein Label ohne
                                Feld ist für eine Vorlesehilfe eine Sackgasse.
                            -->
                            <div class="space-y-1.5">
                                <p class="text-sm font-semibold text-fg-muted">Art</p>
                                <p class="text-sm text-fg">{fieldTypeName(row.type)}</p>
                                <p class="text-xs text-fg-subtle">
                                    Steht fest, weil Antworten vorliegen.
                                </p>
                            </div>
                        {:else}
                            <FormField label="Art" hint={typeHint(row.type)}>
                                {#snippet children({ id, describedBy })}
                                    <Select
                                        {id}
                                        {describedBy}
                                        name={`type_${index}`}
                                        bind:value={row.type}
                                        options={typeOptions}
                                    />
                                {/snippet}
                            </FormField>
                        {/if}

                        <FormField label="Hinweis" hint="Steht klein unter dem Feld.">
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name={`help_${index}`}
                                    bind:value={row.help}
                                    maxlength={300}
                                />
                            {/snippet}
                        </FormField>
                    </div>

                    {#if row.type !== "section"}
                        <label class="flex items-center gap-2 text-sm text-fg">
                            <input
                                type="checkbox"
                                name={`required_${index}`}
                                bind:checked={row.required}
                                class="rounded-control border-border-strong"
                            />
                            Pflichtfeld
                        </label>
                    {/if}

                    {#if hasRange(row.type)}
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField
                                label={rangeLabels(row.type).min}
                                hint={rangeLabels(row.type).hint}
                            >
                                {#snippet children({ id, describedBy })}
                                    <TextInput
                                        {id}
                                        {describedBy}
                                        type="number"
                                        inputmode="numeric"
                                        name={`minValue_${index}`}
                                        bind:value={row.minValue}
                                    />
                                {/snippet}
                            </FormField>

                            <FormField label={rangeLabels(row.type).max}>
                                {#snippet children({ id, describedBy })}
                                    <TextInput
                                        {id}
                                        {describedBy}
                                        type="number"
                                        inputmode="numeric"
                                        name={`maxValue_${index}`}
                                        bind:value={row.maxValue}
                                    />
                                {/snippet}
                            </FormField>
                        </div>
                    {/if}

                    {#if needsOptions(row.type)}
                        <div class="space-y-2">
                            <p class="text-sm font-semibold text-fg-muted">Optionen</p>
                            <p class="text-xs text-fg-subtle">
                                Leere Zeilen werden nicht gespeichert. Eine Option zu entfernen
                                heißt: ihre Beschriftung leeren.
                            </p>

                            {#each row.options as option, position (position)}
                                <div class="flex items-center gap-2">
                                    <!--
                                        Der bisherige Wert fährt versteckt mit:
                                        er bleibt beim Umbenennen erhalten und
                                        hält damit die Auszählung zusammen.
                                        Beide Listen sind gleich lang, weil die
                                        Zuordnung über die Position läuft.
                                    -->
                                    <input
                                        type="hidden"
                                        name={`optionValues_${index}`}
                                        value={option.value}
                                    />
                                    <TextInput
                                        name={`optionLabels_${index}`}
                                        bind:value={option.label}
                                        maxlength={200}
                                        placeholder="Beschriftung"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon="x-lg"
                                        ariaLabel={`Option ${position + 1} entfernen`}
                                        onclick={() => removeOption(index, position)}
                                    />
                                </div>
                            {/each}

                            <Button
                                variant="secondary"
                                size="sm"
                                icon="plus-lg"
                                onclick={() => addOption(index)}
                            >
                                Option hinzufügen
                            </Button>
                        </div>
                    {/if}

                    {#if allowsOther(row.type)}
                        <label class="flex items-start gap-3 text-sm text-fg">
                            <input
                                type="checkbox"
                                name={`allowOther_${index}`}
                                bind:checked={row.allowOther}
                                class="mt-1 rounded-control border-border-strong"
                            />
                            <span>
                                „Sonstiges" erlauben
                                <span class="block text-xs text-fg-subtle">
                                    Ergänzt eine Zeile mit Freitext. Die Freitexte stehen in der
                                    Auswertung unter der Auszählung.
                                </span>
                            </span>
                        </label>
                    {/if}
                </div>

                <!--
                    Umsortieren und Entfernen brauchen JavaScript; siehe den
                    Kopfkommentar. Ohne Skript bleibt die Reihenfolge, wie sie
                    geladen wurde.
                -->
                <div class="flex flex-col gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="arrow-up"
                        ariaLabel={`Frage ${index + 1} nach oben`}
                        disabled={index === 0}
                        onclick={() => moveRow(index, -1)}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="arrow-down"
                        ariaLabel={`Frage ${index + 1} nach unten`}
                        disabled={index === rows.length - 1}
                        onclick={() => moveRow(index, 1)}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        ariaLabel={`Frage ${index + 1} entfernen`}
                        disabled={frozen(row)}
                        title={frozen(row)
                            ? "Diese Frage lässt sich nicht mehr löschen, weil Antworten vorliegen."
                            : undefined}
                        onclick={() => removeRow(index)}
                    />
                </div>
            </div>
        </fieldset>
    {/each}

    <Button variant="secondary" icon="plus-circle" onclick={addRow}>Frage hinzufügen</Button>

    <p class="text-xs text-fg-subtle">
        Ohne mindestens eine Frage lässt sich die Umfrage nicht veröffentlichen. Leere Zeilen
        werden beim Speichern verworfen.
    </p>
</div>
