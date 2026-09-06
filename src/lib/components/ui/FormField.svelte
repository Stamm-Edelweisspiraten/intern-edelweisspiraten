<script lang="ts">
    import type { Snippet } from "svelte";

    /**
     * Verbindet Label, Eingabefeld, Hinweis und Fehlermeldung korrekt
     * miteinander.
     *
     * Im Projekt gab es 137 <label>-Elemente, von denen KEINES ein for-Attribut
     * hatte, und kein einziges <input> hatte eine id -- diese Felder waren fuer
     * Screenreader damit vollstaendig unbeschriftet. Die id wird hier erzeugt
     * und dem Kind-Snippet uebergeben.
     */

    interface FieldContext {
        id: string;
        describedBy: string | undefined;
        invalid: boolean;
    }

    interface Props {
        label: string;
        hint?: string;
        error?: string;
        required?: boolean;
        id?: string;
        class?: string;
        children: Snippet<[FieldContext]>;
    }

    let {
        label,
        hint,
        error,
        required = false,
        id: providedId,
        class: extraClass = "",
        children
    }: Props = $props();

    const uid = $props.id();
    const fieldId = $derived(providedId ?? `f-${uid}`);
    const hintId = $derived(hint ? `${fieldId}-hint` : undefined);
    const errorId = $derived(error ? `${fieldId}-error` : undefined);
    const describedBy = $derived([hintId, errorId].filter(Boolean).join(" ") || undefined);
</script>

<div class={`space-y-1.5 ${extraClass}`}>
    <label for={fieldId} class="block text-sm font-semibold text-fg-muted">
        {label}
        {#if required}
            <span class="text-danger" aria-hidden="true">*</span>
            <span class="sr-only">(Pflichtfeld)</span>
        {/if}
    </label>

    {@render children({ id: fieldId, describedBy, invalid: !!error })}

    {#if hint && !error}
        <p id={hintId} class="text-xs text-fg-subtle">{hint}</p>
    {/if}
    {#if error}
        <p id={errorId} class="text-xs text-danger font-medium">{error}</p>
    {/if}
</div>
