<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Alert,
        Badge,
        Button,
        Card,
        FormField,
        PageHeader,
        TextInput
    } from "$lib/components/ui";
    import PublicFooter from "$lib/components/PublicFooter.svelte";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let submitting = $state(false);
    let password = $state("");
    let passwordRepeat = $state("");
    let setupFinance = $state(true);
    let demoData = $state(false);

    const mismatch = $derived(passwordRepeat.length > 0 && password !== passwordRepeat);

    /**
     * Die Schritte sind bewusst untereinander statt als Assistent mit
     * Seitenwechsel: alles zusammen passt auf einen Bildschirm, und ein
     * abgebrochener mehrseitiger Ablauf hinterliesse einen halb eingerichteten
     * Stand.
     */
    const STEPS = [
        { number: 1, title: "Organisation", subtitle: "Wie heißt der Stamm?" },
        { number: 2, title: "Zugang", subtitle: "Der erste Zugang mit Administrationsrechten." },
        { number: 3, title: "Kasse", subtitle: "Kontenrahmen, Geschäftsjahr und erstes Konto." },
        { number: 4, title: "Demodaten", subtitle: "Zum Ausprobieren, jederzeit löschbar." }
    ];
</script>

<svelte:head>
    <title>Ersteinrichtung</title>
</svelte:head>

<div class="min-h-screen bg-surface-muted flex flex-col">
    <div class="flex-1 w-full max-w-3xl mx-auto px-4 py-12 space-y-8">
        <PageHeader
            title="Ersteinrichtung"
            eyebrow="Willkommen"
            subtitle="Diese Seite ist nur erreichbar, solange kein Zugang existiert. Nach dem Abschluss antwortet sie dauerhaft mit „Nicht gefunden“."
        />

        {#if form?.error}
            <Alert tone="danger" message={form.error} />
        {/if}

        <form
            method="post"
            class="space-y-8"
            use:enhance={() => {
                submitting = true;
                return async ({ update }) => {
                    await update({ reset: false });
                    submitting = false;
                };
            }}
        >
            <!-- Schritt 1 -->
            <Card title={`${STEPS[0].number}. ${STEPS[0].title}`} subtitle={STEPS[0].subtitle}>
                <div class="space-y-4">
                    <FormField
                        label="Name des Stamms"
                        required
                        hint="Erscheint in der Kopfzeile, in E-Mails und auf allen PDFs."
                    >
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="organizationName"
                                value={form?.organizationName ?? ""}
                                placeholder="Stamm Musterstadt"
                                required
                            />
                        {/snippet}
                    </FormField>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField label="Kurzform" hint="Für enge Stellen. Leer lassen übernimmt den Namen.">
                            {#snippet children({ id })}
                                <TextInput
                                    {id}
                                    name="shortName"
                                    value={form?.shortName ?? ""}
                                    placeholder="Musterstadt"
                                />
                            {/snippet}
                        </FormField>
                        <FormField label="Ort">
                            {#snippet children({ id })}
                                <TextInput
                                    {id}
                                    name="city"
                                    value={form?.city ?? ""}
                                    placeholder="Musterstadt"
                                />
                            {/snippet}
                        </FormField>
                    </div>
                </div>
            </Card>

            <!-- Schritt 2 -->
            <Card title={`${STEPS[1].number}. ${STEPS[1].title}`} subtitle={STEPS[1].subtitle}>
                <div class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField label="Name" required>
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name="name"
                                    value={form?.name ?? ""}
                                    required
                                    autocomplete="name"
                                />
                            {/snippet}
                        </FormField>

                        <FormField label="E-Mail-Adresse" required>
                            {#snippet children({ id, describedBy })}
                                <TextInput
                                    {id}
                                    {describedBy}
                                    name="email"
                                    type="email"
                                    value={form?.email ?? ""}
                                    required
                                    autocomplete="username"
                                />
                            {/snippet}
                        </FormField>
                    </div>

                    <FormField
                        label="Passwort"
                        hint={`Mindestens ${data.minPasswordLength} Zeichen. Eine Passphrase aus mehreren Wörtern ist eine gute Wahl.`}
                        required
                    >
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="password"
                                type="password"
                                bind:value={password}
                                minlength={data.minPasswordLength}
                                required
                                autocomplete="new-password"
                            />
                        {/snippet}
                    </FormField>

                    <FormField
                        label="Passwort wiederholen"
                        required
                        error={mismatch ? "Die beiden Passwörter stimmen nicht überein." : undefined}
                    >
                        {#snippet children({ id, describedBy, invalid })}
                            <TextInput
                                {id}
                                {describedBy}
                                {invalid}
                                name="passwordRepeat"
                                type="password"
                                bind:value={passwordRepeat}
                                required
                                autocomplete="new-password"
                            />
                        {/snippet}
                    </FormField>

                    <Alert
                        tone="info"
                        message="Die Administrationsrolle verlangt Zwei-Faktor-Authentifizierung. Die Einrichtung folgt direkt nach dem Abschluss."
                    />
                </div>
            </Card>

            <!-- Schritt 3 -->
            <Card title={`${STEPS[2].number}. ${STEPS[2].title}`} subtitle={STEPS[2].subtitle}>
                <label class="flex items-start gap-3 px-4 py-3 rounded-control border border-border cursor-pointer">
                    <input
                        type="checkbox"
                        name="setupFinance"
                        bind:checked={setupFinance}
                        class="mt-1 border-border-strong"
                    />
                    <span class="text-sm text-fg">
                        Kasse jetzt einrichten
                        <span class="block text-xs text-fg-subtle mt-0.5">
                            Legt den mitgelieferten Vereins-Kontenrahmen an (angelehnt an SKR49),
                            ein Geschäftsjahr und ein erstes Konto. Alles ist später änderbar.
                        </span>
                    </span>
                </label>

                {#if setupFinance}
                    <div class="mt-4 space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField label="Geschäftsjahr" required>
                                {#snippet children({ id })}
                                    <TextInput
                                        {id}
                                        name="fiscalYear"
                                        inputmode="numeric"
                                        value={String(data.currentYear)}
                                        required
                                    />
                                {/snippet}
                            </FormField>
                            <FormField label="Name des ersten Kontos">
                                {#snippet children({ id })}
                                    <TextInput {id} name="bankAccountName" placeholder="Girokonto" />
                                {/snippet}
                            </FormField>
                        </div>

                        <FormField label="Anfangsbestand" hint="Kontostand vor der ersten Buchung.">
                            {#snippet children({ id })}
                                <TextInput
                                    {id}
                                    name="openingBalance"
                                    inputmode="decimal"
                                    placeholder="0,00"
                                />
                            {/snippet}
                        </FormField>

                        <div>
                            <p class="text-sm font-semibold text-fg-muted mb-2">
                                Jahresbeiträge je Mitglied
                            </p>
                            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {#each [["stamm", "Stamm"], ["gau", "Gau"], ["landesmark", "Landesmark"], ["bund", "Bund"]] as [key, label] (key)}
                                    <FormField {label}>
                                        {#snippet children({ id })}
                                            <TextInput
                                                {id}
                                                name={`dues_${key}`}
                                                inputmode="decimal"
                                                placeholder="0,00"
                                            />
                                        {/snippet}
                                    </FormField>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            </Card>

            <!-- Schritt 4 -->
            <Card title={`${STEPS[3].number}. ${STEPS[3].title}`} subtitle={STEPS[3].subtitle}>
                <label class="flex items-start gap-3 px-4 py-3 rounded-control border border-border cursor-pointer">
                    <input
                        type="checkbox"
                        name="demoData"
                        bind:checked={demoData}
                        class="mt-1 border-border-strong"
                    />
                    <span class="text-sm text-fg">
                        Demodaten anlegen
                        <span class="block text-xs text-fg-subtle mt-0.5">
                            Zwei Gruppen, zwölf erfundene Mitglieder, Ämter, Artikel, eine
                            Bestellung und ein paar Buchungen. Zum Ausprobieren gedacht — die
                            Namen sind erkennbar erfunden.
                        </span>
                    </span>
                </label>

                {#if demoData}
                    <div class="mt-4">
                        <Badge tone="warning" icon="exclamation-triangle" label="Nur für Testinstallationen" />
                    </div>
                {/if}
            </Card>

            <div class="flex justify-end">
                <Button
                    type="submit"
                    variant="primary"
                    loading={submitting}
                    disabled={mismatch}
                    icon="check-lg"
                >
                    Einrichtung abschließen
                </Button>
            </div>
        </form>
    </div>

    <PublicFooter />
</div>
