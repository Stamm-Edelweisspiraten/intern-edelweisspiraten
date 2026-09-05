<script lang="ts">
    /**
     * Auswahlfeld.
     *
     * Ersetzt die rund 45 Stellen, an denen der Klassenstring eines <select>
     * von Hand kopiert war -- inklusive der dort fest verdrahteten Radien, die
     * beim Flachlegen der Rundungen einzeln haetten nachgezogen werden
     * muessen.
     */

    interface Option {
        value: string;
        label: string;
        disabled?: boolean;
    }

    interface Props {
        id?: string;
        name?: string;
        value?: string;
        options: Option[];
        /** Erster Eintrag ohne Auswahl, z. B. "– kein Mitglied –". */
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        invalid?: boolean;
        describedBy?: string;
        class?: string;
        onchange?: (event: Event) => void;
    }

    let {
        id,
        name,
        value = $bindable(""),
        options,
        placeholder,
        required = false,
        disabled = false,
        invalid = false,
        describedBy,
        class: extraClass = "",
        onchange
    }: Props = $props();

    const classes = $derived(
        [
            "w-full px-4 py-3 rounded-control text-sm bg-surface text-fg shadow-sm transition",
            "border appearance-none",
            invalid ? "border-danger" : "border-border-strong",
            disabled ? "opacity-60 cursor-not-allowed" : "",
            extraClass
        ]
            .filter(Boolean)
            .join(" ")
    );
</script>

<div class="relative">
    <select
        {id}
        {name}
        {required}
        {disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        class={classes}
        bind:value
        {onchange}
    >
        {#if placeholder}
            <option value="">{placeholder}</option>
        {/if}
        {#each options as option (option.value)}
            <option value={option.value} disabled={option.disabled}>{option.label}</option>
        {/each}
    </select>
    <span
        class="bi bi-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-subtle text-xs pointer-events-none"
        aria-hidden="true"
    ></span>
</div>
