<script lang="ts">
    import "./layout.css";
    import "bootstrap-icons/font/bootstrap-icons.css";
    import ToastContainer from "$lib/components/ToastContainer.svelte";
    import type { Snippet } from "svelte";

    let { children }: { data: unknown; children: Snippet } = $props();
</script>

<svelte:head>
    <title>Stamm Edelweisspiraten</title>
</svelte:head>

<ToastContainer />
{@render children()}
