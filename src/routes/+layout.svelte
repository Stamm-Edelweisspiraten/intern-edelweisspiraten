<script lang="ts">
    import "@fontsource-variable/inter";
    import "./layout.css";
    import "bootstrap-icons/font/bootstrap-icons.css";
    import ToastContainer from "$lib/components/ToastContainer.svelte";
    import type { Snippet } from "svelte";

    let { data, children }: { data: { organization?: { name: string } }; children: Snippet } =
        $props();
</script>

<svelte:head>
    <title>{data.organization?.name ?? "Internes Portal"}</title>
</svelte:head>

<ToastContainer />
{@render children()}
