<script lang="ts">
    /**
     * Mehrzeiliges Eingabefeld.
     *
     * Gegenstueck zu `TextInput`. Der Klassenstring stand vorher viermal von
     * Hand in Routen (Gruppen, Aemter, Termine), jedes Mal mit `rounded-xl`
     * statt `rounded-control` und ohne Fehlerzustand.
     */

    interface Props {
        id?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        rows?: number;
        required?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        invalid?: boolean;
        describedBy?: string;
        maxlength?: number;
        class?: string;
        /** Wie bei `TextInput` -- fuer mitlaufende Anzeigen. */
        oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
    }

    let {
        id,
        name,
        value = $bindable(""),
        placeholder,
        rows = 4,
        required = false,
        disabled = false,
        readonly = false,
        invalid = false,
        describedBy,
        maxlength,
        oninput,
        class: extraClass = ""
    }: Props = $props();

    const classes = $derived(
        [
            "w-full px-4 py-3 rounded-control text-sm bg-surface text-fg shadow-sm transition",
            "border placeholder:text-fg-subtle resize-y",
            invalid ? "border-danger" : "border-border-strong",
            disabled ? "opacity-60 cursor-not-allowed" : "",
            extraClass
        ]
            .filter(Boolean)
            .join(" ")
    );
</script>

<textarea
    {id}
    {name}
    {placeholder}
    {rows}
    {required}
    {disabled}
    {readonly}
    {maxlength}
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    class={classes}
    {oninput}
    bind:value
></textarea>
