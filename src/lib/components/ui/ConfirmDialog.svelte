<script lang="ts">
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";

    /**
     * Rueckfrage vor zerstoerenden Aktionen. Bisher loeschten Benutzer,
     * Mitglieder, Gruppen und Aemter ohne jede Bestaetigung.
     *
     * Ohne JavaScript bleibt das umschliessende Formular normal absendbar,
     * die Bestaetigung entfaellt dann lediglich.
     */

    interface Props {
        open: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        tone?: "danger" | "primary";
        onconfirm: () => void;
        oncancel?: () => void;
    }

    let {
        open = $bindable(false),
        title,
        message,
        confirmLabel = "Bestätigen",
        cancelLabel = "Abbrechen",
        tone = "danger",
        onconfirm,
        oncancel
    }: Props = $props();

    function cancel() {
        open = false;
        oncancel?.();
    }
</script>

<Modal bind:open {title} size="sm" onclose={oncancel}>
    <p class="text-sm text-fg-muted">{message}</p>

    {#snippet footer()}
        <Button variant="secondary" onclick={cancel}>{cancelLabel}</Button>
        <Button variant={tone} onclick={() => { open = false; onconfirm(); }}>
            {confirmLabel}
        </Button>
    {/snippet}
</Modal>
