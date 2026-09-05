<script lang="ts">
    /** Einheitliches Eingabefeld inklusive Fokus-Ring und Fehlerzustand. */

    interface Props {
        id?: string;
        name?: string;
        type?: string;
        value?: string | number | null;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        invalid?: boolean;
        describedBy?: string;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        minlength?: number;
        maxlength?: number;
        autocomplete?: HTMLInputElement["autocomplete"];
        inputmode?: "text" | "numeric" | "decimal" | "email" | "tel";
        class?: string;
    }

    let {
        id,
        name,
        type = "text",
        value = $bindable(""),
        placeholder,
        required = false,
        disabled = false,
        readonly = false,
        invalid = false,
        describedBy,
        min,
        max,
        step,
        minlength,
        maxlength,
        autocomplete,
        inputmode,
        class: extraClass = ""
    }: Props = $props();

    const classes = $derived(
        [
            "w-full px-4 py-3 rounded-xl text-sm bg-surface text-fg shadow-sm transition",
            "border placeholder:text-fg-subtle",
            invalid ? "border-danger" : "border-border-strong",
            disabled ? "opacity-60 cursor-not-allowed" : "",
            extraClass
        ]
            .filter(Boolean)
            .join(" ")
    );
</script>

<input
    {id}
    {name}
    {type}
    {placeholder}
    {required}
    {disabled}
    {readonly}
    {min}
    {max}
    {step}
    {minlength}
    {maxlength}
    {autocomplete}
    {inputmode}
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    class={classes}
    bind:value
/>
