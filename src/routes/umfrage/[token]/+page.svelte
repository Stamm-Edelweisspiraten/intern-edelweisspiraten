<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/state";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button } from "$lib/components/ui";
    import { SurveyForm } from "$lib/components/surveys";
    import { formatDate } from "$lib/format";
    import type { ActionData, PageData } from "./$types";

    /**
     * Die oeffentliche Ausfuellansicht.
     *
     * Benutzt dieselbe `SurveyForm` wie die interne Detailseite -- die
     * Feldlogik gibt es genau einmal. Der Rahmen ist `AuthShell`, wie bei
     * Anmeldung, Einladung und Passwortseiten; nur breiter, weil ein Formular
     * mit vielen Fragen in einer Anmeldekarte nicht lesbar waere.
     *
     * Alles funktioniert ohne JavaScript: `use:enhance` ist nur der
     * Ladezustand am Knopf.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let sending = $state(false);

    const survey = $derived(data.survey);
    const organization = $derived(page.data.organization);
</script>

<svelte:head>
    <title>{survey.title}</title>
    <!-- Ein Link auf einen Fragebogen gehoert in keinen Suchindex. -->
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<AuthShell
    title={survey.title}
    eyebrow={organization?.name ?? "Umfrage"}
    icon="clipboard-check"
    subtitle={survey.description || undefined}
    size="lg"
>
    {#if data.closedReason}
        <Alert tone="info" message={data.closedReason} />
    {:else}
        {#if form?.error}
            <Alert tone="danger" message={form.error} />
        {/if}

        <form
            method="post"
            class="space-y-6"
            use:enhance={() => {
                sending = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    sending = false;
                };
            }}
        >
            <SurveyForm
                fields={survey.fields}
                fieldErrors={form?.fieldErrors ?? {}}
                nameMode={survey.nameMode}
                nameValue={form?.publicName ?? ""}
            >
                {#snippet footer()}
                    <Button type="submit" variant="primary" icon="send" loading={sending}>
                        Antwort absenden
                    </Button>
                {/snippet}
            </SurveyForm>
        </form>
    {/if}

    {#snippet footer()}
        <div class="space-y-1">
            {#if survey.closesAt && !data.closedReason}
                <p>Du kannst noch bis zum {formatDate(survey.closesAt)} antworten.</p>
            {/if}
            {#if survey.nameMode === "none"}
                <p>Diese Umfrage wird ohne Namen ausgewertet.</p>
            {/if}
            <p>
                Deine Antwort geht ausschließlich an
                {organization?.name ?? "den Stamm"} und wird nicht weitergegeben.
            </p>
        </div>
    {/snippet}
</AuthShell>
