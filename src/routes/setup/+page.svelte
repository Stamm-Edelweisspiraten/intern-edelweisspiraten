<script lang="ts">
    import { untrack } from "svelte";
    import { enhance } from "$app/forms";
    import {
        Alert,
        Badge,
        Button,
        Card,
        FormField,
        PageHeader,
        Select,
        TextInput
    } from "$lib/components/ui";
    import PublicFooter from "$lib/components/PublicFooter.svelte";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    interface DatabaseValues {
        mode: string;
        host: string;
        port: string;
        name: string;
        user: string;
        ssl: boolean;
        connectionString: string;
    }

    /**
     * Gemeinsame Sicht auf die Rueckmeldungen aller Actions.
     *
     * Der Assistent hat drei Actions mit unterschiedlichen Rueckgaben; ohne
     * diese Sicht muesste jede Stelle die Vereinigung einzeln aufdroeseln.
     */
    interface Feedback {
        error?: string;
        success?: string;
        organizationName?: string;
        shortName?: string;
        city?: string;
        name?: string;
        email?: string;
        values?: DatabaseValues;
    }

    const feedback = $derived(form as Feedback | null);

    let submitting = $state(false);
    let password = $state("");
    let passwordRepeat = $state("");
    let setupFinance = $state(true);
    let demoData = $state(false);

    const mismatch = $derived(passwordRepeat.length > 0 && password !== passwordRepeat);

    // --- Datenbankschritt ------------------------------------------------
    const dbValues = $derived(feedback?.values ?? data.database?.values);
    // untrack: die Vorbelegung ist bewusst der Anfangswert -- danach gehoert
    // das Feld dem Formular, nicht mehr dem load.
    let mode = $state<string>(untrack(() => data.database?.values.mode ?? "parts"));
    let ssl = $state(untrack(() => (data.database?.values.ssl ? "on" : "off")));

    const MODE_OPTIONS = [
        { value: "parts", label: "Einzelne Angaben" },
        { value: "url", label: "Vollständiger Connection String" }
    ];

    const SSL_OPTIONS = [
        { value: "off", label: "Aus" },
        { value: "on", label: "Erforderlich (sslmode=require)" }
    ];

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

        {#if feedback?.error}
            <Alert tone="danger" message={feedback.error} />
        {/if}
        {#if feedback?.success}
            <Alert tone="success" message={feedback.success} />
        {/if}

        {#if data.database}
            <!-- Vorgeschalteter Schritt: ohne Datenbank kann der Assistent
                 nicht einmal nachsehen, ob es schon einen Zugang gibt. -->
            <Alert
                tone="warning"
                title="Keine Verbindung zur Datenbank"
                message={data.database.reason}
            />

            {#if data.database.fromEnv}
                <Alert
                    tone="info"
                    title="Vorgabe aus der Betriebsumgebung"
                    message="Die Verbindung wird über Umgebungsvariablen vorgegeben. Sie lässt sich hier prüfen, aber nicht überschreiben — dafür müssen DATABASE_URL beziehungsweise die DB_* Variablen geändert und die Anwendung neu gestartet werden."
                />
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
                <Card
                    title="0. Datenbank"
                    subtitle="Diese Anwendung speichert alles in PostgreSQL — Mitglieder, Buchungen, Dateien."
                >
                    <div class="space-y-4">
                        <p class="text-sm text-fg-muted">
                            Ohne erreichbare Datenbank kann die Einrichtung nicht beginnen: schon
                            die Frage, ob es bereits einen Zugang gibt, wäre nicht zu beantworten.
                            Nach dem Speichern werden die Zugangsdaten in
                            <code class="text-xs">{data.database.configFile}</code>
                            abgelegt, die Tabellen angelegt und der eigentliche Assistent beginnt.
                        </p>

                        <FormField
                            label="Eingabeart"
                            hint="Viele Anbieter geben genau eine fertige Verbindungszeile heraus."
                        >
                            {#snippet children({ id })}
                                <Select
                                    {id}
                                    name="mode"
                                    options={MODE_OPTIONS}
                                    bind:value={mode}
                                />
                            {/snippet}
                        </FormField>

                        {#if mode === "url"}
                            <FormField
                                label="Connection String"
                                required
                                hint="Form: postgresql://benutzer:passwort@host:5432/datenbank"
                            >
                                {#snippet children({ id, describedBy })}
                                    <TextInput
                                        {id}
                                        {describedBy}
                                        name="connectionString"
                                        value={dbValues?.connectionString ?? ""}
                                        placeholder="postgresql://intern:geheim@localhost:5432/intern"
                                        autocomplete="off"
                                        required
                                    />
                                {/snippet}
                            </FormField>
                        {:else}
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div class="sm:col-span-2">
                                    <FormField label="Host" required>
                                        {#snippet children({ id, describedBy })}
                                            <TextInput
                                                {id}
                                                {describedBy}
                                                name="host"
                                                value={dbValues?.host ?? ""}
                                                placeholder="localhost"
                                                autocomplete="off"
                                                required
                                            />
                                        {/snippet}
                                    </FormField>
                                </div>
                                <FormField label="Port">
                                    {#snippet children({ id })}
                                        <TextInput
                                            {id}
                                            name="port"
                                            inputmode="numeric"
                                            value={dbValues?.port ?? "5432"}
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField label="Datenbank" required>
                                    {#snippet children({ id, describedBy })}
                                        <TextInput
                                            {id}
                                            {describedBy}
                                            name="name"
                                            value={dbValues?.name ?? ""}
                                            placeholder="intern"
                                            autocomplete="off"
                                            required
                                        />
                                    {/snippet}
                                </FormField>
                                <FormField label="SSL-Modus" hint="Bei entfernten Servern üblich.">
                                    {#snippet children({ id })}
                                        <Select
                                            {id}
                                            name="ssl"
                                            options={SSL_OPTIONS}
                                            bind:value={ssl}
                                        />
                                    {/snippet}
                                </FormField>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField label="Benutzername">
                                    {#snippet children({ id })}
                                        <TextInput
                                            {id}
                                            name="user"
                                            value={dbValues?.user ?? ""}
                                            placeholder="intern"
                                            autocomplete="off"
                                        />
                                    {/snippet}
                                </FormField>
                                <FormField
                                    label="Passwort"
                                    hint="Wird nur in die Konfigurationsdatei geschrieben, nie angezeigt."
                                >
                                    {#snippet children({ id })}
                                        <TextInput
                                            {id}
                                            name="password"
                                            type="password"
                                            value=""
                                            autocomplete="new-password"
                                        />
                                    {/snippet}
                                </FormField>
                            </div>
                        {/if}

                        <div class="flex justify-end gap-3 flex-wrap pt-2">
                            <Button
                                type="submit"
                                variant="secondary"
                                icon="plug"
                                formaction="?/testDatabase"
                                loading={submitting}
                            >
                                Verbindung prüfen
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                icon="database-check"
                                formaction="?/saveDatabase"
                                loading={submitting}
                                disabled={data.database.fromEnv}
                            >
                                Speichern und einrichten
                            </Button>
                        </div>
                    </div>
                </Card>
            </form>
        {:else}
            <form
                method="post"
                action="?/complete"
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
                                    value={feedback?.organizationName ?? ""}
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
                                        value={feedback?.shortName ?? ""}
                                        placeholder="Musterstadt"
                                    />
                                {/snippet}
                            </FormField>
                            <FormField label="Ort">
                                {#snippet children({ id })}
                                    <TextInput
                                        {id}
                                        name="city"
                                        value={feedback?.city ?? ""}
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
                                        value={feedback?.name ?? ""}
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
                                        value={feedback?.email ?? ""}
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
        {/if}
    </div>

    <PublicFooter />
</div>
