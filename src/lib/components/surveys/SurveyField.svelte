<script lang="ts">
    /**
     * Ein einzelnes Feld einer Umfrage.
     *
     * Ausgelagert aus `SurveyForm`, weil die Verzweigung ueber elf Feldtypen
     * sonst die Uebersicht ueber Fortschritt, Namensfeld und Fehlerliste
     * erschlagen wuerde. Die Komponente kennt nur ein Feld und seinen Wert --
     * keine Datenbank, keine Sitzung, nichts aus `$lib/server`.
     */
    import { FormField, TextInput, Textarea } from "$lib/components/ui";
    import {
        BOOLEAN_LABELS,
        BOOLEAN_VALUES,
        OTHER_VALUE,
        scaleRange,
        scaleSteps
    } from "$lib/surveys/fields";
    import type { SurveyFormField } from "./index";
    import { surveyFieldName, surveyOtherName } from "./index";

    interface Props {
        field: SurveyFormField;
        /** Fortlaufende Nummer; `null` bei einer Zwischenueberschrift. */
        number: number | null;
        value: string | string[];
        otherValue: string;
        error?: string;
        disabled?: boolean;
        prefix?: string;
        /** Meldet jede Eingabe nach oben, damit der Fortschritt mitlaeuft. */
        onchange?: (next: { value: string | string[]; otherValue: string }) => void;
    }

    let {
        field,
        number,
        value,
        otherValue,
        error,
        disabled = false,
        prefix = "f_",
        onchange
    }: Props = $props();

    const name = $derived(surveyFieldName(field.id, prefix));
    const otherName = $derived(surveyOtherName(field.id, prefix));

    const selected = $derived(Array.isArray(value) ? value : value ? [value] : []);
    const otherChosen = $derived(selected.includes(OTHER_VALUE));

    const range = $derived(scaleRange(field));
    const steps = $derived(scaleSteps(field));

    /** Die Optionen plus -- falls erlaubt -- die Zeile „Sonstiges". */
    const rows = $derived(
        field.allowOther
            ? [...field.options, { value: OTHER_VALUE, label: "Sonstiges" }]
            : field.options
    );

    function pickSingle(next: string) {
        onchange?.({ value: next, otherValue });
    }

    function toggleMulti(option: string, checked: boolean) {
        const next = checked
            ? [...selected, option]
            : selected.filter((entry) => entry !== option);
        onchange?.({ value: next, otherValue });
    }

    /** Sichtbarer Zustand einer Auswahlzeile -- die ganze Zeile ist klickbar. */
    function rowClass(active: boolean): string {
        return [
            "flex items-start gap-3 px-3 py-2.5 rounded-control border text-sm transition",
            active
                ? "border-primary bg-primary-soft text-primary-soft-fg"
                : "border-border text-fg hover:bg-surface-muted",
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        ].join(" ");
    }
</script>

{#if field.type === "section"}
    <!--
        Zwischenueberschrift: kein Eingabefeld, keine Nummer, kein `name`.
        Sie gliedert ein langes Formular, damit es nicht als eine Wand aus
        Fragen erscheint.
    -->
    <div class="pt-4 border-t border-border first:pt-0 first:border-t-0">
        <h3 class="text-base font-semibold text-fg">{field.label}</h3>
        {#if field.help}
            <p class="text-sm text-fg-muted mt-1">{field.help}</p>
        {/if}
    </div>
{:else}
    <FormField
        id={`f-${field.id}`}
        label={number === null ? field.label : `${number}. ${field.label}`}
        hint={field.help || undefined}
        required={field.required}
        {error}
    >
        {#snippet children({ id, describedBy, invalid })}
            {#if field.type === "longtext"}
                <Textarea
                    {id}
                    {describedBy}
                    {invalid}
                    {name}
                    {disabled}
                    value={typeof value === "string" ? value : ""}
                    rows={4}
                    maxlength={5000}
                    oninput={(event) =>
                        onchange?.({
                            value: (event.currentTarget as HTMLTextAreaElement).value,
                            otherValue
                        })}
                />
            {:else if field.type === "single" || field.type === "multi"}
                <!--
                    Echte Radiogruppe bzw. Kontrollkaestchen in einem
                    `<fieldset>`: so bleibt die Gruppe auch ohne JavaScript und
                    mit der Tastatur bedienbar. Das `<label>` umschliesst
                    Eingabe UND Text, damit die ganze Zeile ein Ziel ist.
                -->
                <fieldset class="space-y-1.5" aria-describedby={describedBy}>
                    <legend class="sr-only">{field.label}</legend>

                    {#each rows as option (option.value)}
                        <label class={rowClass(selected.includes(option.value))}>
                            <input
                                type={field.type === "single" ? "radio" : "checkbox"}
                                {name}
                                value={option.value}
                                checked={selected.includes(option.value)}
                                {disabled}
                                class="mt-0.5 border-border-strong"
                                onchange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    if (field.type === "single") pickSingle(option.value);
                                    else toggleMulti(option.value, checked);
                                }}
                            />
                            <span class="min-w-0">{option.label}</span>
                        </label>
                    {/each}

                    {#if field.allowOther}
                        <!--
                            Das Textfeld steht dauerhaft da und wird NICHT
                            deaktiviert: ein deaktiviertes Feld wird gar nicht
                            mitgeschickt, und der eingetippte Text ginge bei
                            jedem Pruefdurchlauf verloren. Dass der Server ihn
                            verwirft, wenn „Sonstiges" nicht gewaehlt ist, ist
                            die richtige Stelle fuer diese Regel.
                        -->
                        <div class="pl-3">
                            <TextInput
                                name={otherName}
                                value={otherValue}
                                {disabled}
                                maxlength={500}
                                placeholder="Sonstiges: bitte eintragen"
                                invalid={invalid && otherChosen && !otherValue}
                                class="mt-1"
                                oninput={(event) =>
                                    onchange?.({
                                        value,
                                        otherValue: (event.currentTarget as HTMLInputElement)
                                            .value
                                    })}
                            />
                        </div>
                    {/if}
                </fieldset>
            {:else if field.type === "boolean"}
                <fieldset
                    class="grid grid-cols-2 gap-2 max-w-xs"
                    aria-describedby={describedBy}
                >
                    <legend class="sr-only">{field.label}</legend>
                    {#each BOOLEAN_VALUES as option (option)}
                        <label class={`${rowClass(selected.includes(option))} justify-center`}>
                            <input
                                type="radio"
                                {name}
                                value={option}
                                checked={selected.includes(option)}
                                {disabled}
                                class="sr-only"
                                onchange={() => pickSingle(option)}
                            />
                            <span>{BOOLEAN_LABELS[option]}</span>
                        </label>
                    {/each}
                </fieldset>
            {:else if field.type === "scale"}
                <fieldset aria-describedby={describedBy}>
                    <legend class="sr-only">{field.label}</legend>
                    <div class="flex flex-wrap gap-2">
                        {#each steps as step (step)}
                            <label
                                class={[
                                    "w-11 h-11 flex items-center justify-center rounded-control",
                                    "border text-sm tabular-figures transition",
                                    selected.includes(String(step))
                                        ? "border-primary bg-primary-soft text-primary-soft-fg font-semibold"
                                        : "border-border text-fg hover:bg-surface-muted",
                                    disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                                ].join(" ")}
                            >
                                <input
                                    type="radio"
                                    {name}
                                    value={String(step)}
                                    checked={selected.includes(String(step))}
                                    {disabled}
                                    class="sr-only"
                                    onchange={() => pickSingle(String(step))}
                                />
                                <span aria-hidden="true">{step}</span>
                                <span class="sr-only">{step} von {range.max}</span>
                            </label>
                        {/each}
                    </div>
                    <p class="text-xs text-fg-subtle mt-1.5">
                        {range.min} = am wenigsten · {range.max} = am meisten
                    </p>
                </fieldset>
            {:else}
                <!--
                    text, number, date, email, phone -- alle ueber TextInput,
                    das `type` und `inputmode` bereits kennt. Die Pruefung des
                    Browsers ist Bequemlichkeit; verbindlich ist
                    `validateAnswers` auf dem Server.
                -->
                <TextInput
                    {id}
                    {describedBy}
                    {invalid}
                    {name}
                    {disabled}
                    value={typeof value === "string" ? value : ""}
                    type={field.type === "number"
                        ? "number"
                        : field.type === "date"
                          ? "date"
                          : field.type === "email"
                            ? "email"
                            : field.type === "phone"
                              ? "tel"
                              : "text"}
                    inputmode={field.type === "number"
                        ? "numeric"
                        : field.type === "email"
                          ? "email"
                          : field.type === "phone"
                            ? "tel"
                            : undefined}
                    autocomplete={field.type === "email"
                        ? "email"
                        : field.type === "phone"
                          ? "tel"
                          : undefined}
                    min={field.type === "number" && field.minValue !== null
                        ? field.minValue
                        : undefined}
                    max={field.type === "number" && field.maxValue !== null
                        ? field.maxValue
                        : undefined}
                    maxlength={field.type === "text" ? 500 : undefined}
                    oninput={(event) =>
                        onchange?.({
                            value: (event.currentTarget as HTMLInputElement).value,
                            otherValue
                        })}
                />
            {/if}
        {/snippet}
    </FormField>
{/if}
