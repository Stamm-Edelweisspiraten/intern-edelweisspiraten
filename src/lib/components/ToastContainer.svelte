<script lang="ts">
    import { toasts, dismissToast } from "$lib/toastStore";

    const tone = (kind: string) => {
        if (kind === "success") return "bg-emerald-50 border-emerald-200 text-emerald-800";
        if (kind === "error") return "bg-red-50 border-red-200 text-red-800";
        return "bg-blue-50 border-blue-200 text-blue-800";
    };

    const icon = (kind: string) => {
        if (kind === "success") return "check-circle";
        if (kind === "error") return "exclamation-circle";
        return "info-circle";
    };
</script>

<div class="fixed top-4 right-4 z-50 space-y-2 w-80">
    {#each $toasts as toast (toast.id)}
        <div class={`border rounded-xl shadow-md px-4 py-3 flex items-start gap-3 ${tone(toast.kind)}`}>
            <span class={`bi bi-${icon(toast.kind)} mt-0.5 text-lg`}></span>
            <div class="flex-1 text-sm leading-relaxed">{toast.message}</div>
            <button class="text-sm text-gray-500 hover:text-gray-700" aria-label="Schließen" on:click={() => dismissToast(toast.id)}>
                <span class="bi bi-x-lg"></span>
            </button>
        </div>
    {/each}
</div>
