<script lang="ts">
    /** Ersetzt die mehrfach kopierte Suchfeld-Variante mit Icon. */

    interface Props {
        value?: string;
        placeholder?: string;
        label?: string;
        count?: number | null;
        class?: string;
    }

    let {
        value = $bindable(""),
        placeholder = "Suchen...",
        label = "Suchen",
        count = null,
        class: extraClass = ""
    }: Props = $props();

    const uid = $props.id();
    const id = `search-${uid}`;
</script>

<div class={`relative w-full sm:w-60 ${extraClass}`}>
    <label for={id} class="sr-only">{label}</label>
    <span
        class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle text-sm pointer-events-none"
        aria-hidden="true"
    ></span>
    <input
        {id}
        type="search"
        {placeholder}
        bind:value
        class="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-surface text-fg border border-border-strong shadow-sm placeholder:text-fg-subtle transition"
    />
    {#if count !== null}
        <span class="sr-only" aria-live="polite">{count} Treffer</span>
    {/if}
</div>
