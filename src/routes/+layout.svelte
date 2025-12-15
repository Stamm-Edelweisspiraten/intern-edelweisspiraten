<script>
    export let data;
    import './layout.css';
    import "bootstrap-icons/font/bootstrap-icons.css";
    import ToastContainer from "$lib/components/ToastContainer.svelte";
</script>

<ToastContainer />
<slot />
