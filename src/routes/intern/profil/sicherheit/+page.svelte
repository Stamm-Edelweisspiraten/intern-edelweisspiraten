<script lang="ts">
    import { Alert, Badge, Button, Card, DataTable, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import type { Column } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Session = PageData["sessions"][number];

    const sessionColumns: Column<Session>[] = [
        { key: "device", label: "Gerät", value: (s) => s.device },
        { key: "ip", label: "IP-Adresse", value: (s) => s.ip },
        { key: "lastSeenAt", label: "Zuletzt aktiv", value: (s) => s.lastSeenAt },
        { key: "createdAt", label: "Angemeldet seit", value: (s) => s.createdAt }
    ];

    let password = $state("");
    let passwordRepeat = $state("");
    const mismatch = $derived(passwordRepeat.length > 0 && password !== passwordRepeat);
</script>

<svelte:head><title>Sicherheit - Intern</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title="Sicherheit"
        eyebrow="Mein Profil"
        subtitle="Passwort, Zwei-Faktor-Authentifizierung und angemeldete Geräte."
        back={{ href: "/intern/profil" }}
    />

    {#if data.mfaHint === "erforderlich"}
        <Alert
            tone="warning"
            title="Zwei-Faktor-Authentifizierung erforderlich"
            message="Für deine Rolle ist ein zweiter Faktor vorgeschrieben. Bitte richte ihn jetzt ein."
        />
    {/if}
    {#if data.notice === "ersteinrichtung"}
        <Alert
            tone="success"
            title="Zugang angelegt"
            message="Der Administrationszugang wurde erstellt. Richte jetzt die Zwei-Faktor-Authentifizierung ein."
        />
    {/if}
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}
    {#if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    {#if form?.recoveryCodes}
        <Card title="Wiederherstellungscodes" tone="warning">
            <p class="text-sm text-fg-muted">
                Bewahre diese Codes sicher auf. Jeder Code funktioniert genau einmal und
                ermöglicht die Anmeldung, wenn du keinen Zugriff auf deine App hast.
                <strong>Sie werden nur dieses eine Mal angezeigt.</strong>
            </p>
            <ul class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-sm">
                {#each form.recoveryCodes as code (code)}
                    <li class="px-3 py-2 rounded-lg bg-surface border border-border text-center">{code}</li>
                {/each}
            </ul>
        </Card>
    {/if}

    <Card title="Passwort ändern">
        <form method="post" action="?/changePassword" class="space-y-4">
            <FormField label="Aktuelles Passwort" required>
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="current" type="password" required autocomplete="current-password" />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Neues Passwort" hint={`Mindestens ${data.minPasswordLength} Zeichen.`} required>
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
                    label="Neues Passwort wiederholen"
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
            </div>

            <div class="flex justify-end">
                <Button type="submit" variant="primary" icon="check-lg" disabled={mismatch}>
                    Passwort ändern
                </Button>
            </div>
        </form>
    </Card>

    <Card title="Zwei-Faktor-Authentifizierung">
        {#snippet actions()}
            {#if data.mfaEnabled}
                <Badge tone="success" icon="shield-check" label="Aktiv" />
            {:else}
                <Badge tone="warning" icon="shield-exclamation" label="Nicht eingerichtet" />
            {/if}
        {/snippet}

        {#if form?.enrolment}
            <div class="space-y-4">
                <p class="text-sm text-fg-muted">
                    Scanne den QR-Code mit einer Authenticator-App und gib anschließend den
                    angezeigten Code ein.
                </p>
                <div class="flex flex-col sm:flex-row items-center gap-6">
                    <!--
                        Der weiße Grund bleibt bewusst auch im dunklen Design:
                        ein QR-Code auf dunklem Untergrund ist von vielen
                        Kamera-Apps nicht lesbar.
                    -->
                    <img
                        src={form.enrolment.qrDataUrl}
                        alt="QR-Code zur Einrichtung der Zwei-Faktor-Authentifizierung"
                        class="w-48 h-48 rounded-xl border border-border bg-white p-2"
                    />
                    <div class="min-w-0">
                        <p class="text-xs text-fg-subtle uppercase tracking-wide">
                            Zur manuellen Eingabe
                        </p>
                        <p class="font-mono text-sm break-all mt-1 text-fg">{form.enrolment.secretBase32}</p>
                    </div>
                </div>

                <form method="post" action="?/confirmMfa" class="space-y-4 max-w-xs">
                    <FormField label="Code aus der App" required>
                        {#snippet children({ id, describedBy })}
                            <TextInput
                                {id}
                                {describedBy}
                                name="code"
                                inputmode="numeric"
                                placeholder="123456"
                                required
                                class="text-center tracking-[0.4em]"
                            />
                        {/snippet}
                    </FormField>
                    <Button type="submit" variant="primary" full icon="check-lg">Bestätigen</Button>
                </form>
            </div>
        {:else if data.mfaEnabled}
            <div class="space-y-4">
                <p class="text-sm text-fg-muted">
                    Bei jeder Anmeldung wird zusätzlich ein Code aus deiner Authenticator-App
                    abgefragt. Verbleibende Wiederherstellungscodes: <strong>{data.recoveryCodesLeft}</strong>.
                </p>

                {#if !data.mfaRequired}
                    <form method="post" action="?/disableMfa" class="space-y-4 max-w-md">
                        <p class="text-sm font-semibold text-fg">Zwei-Faktor deaktivieren</p>
                        <FormField label="Passwort" required>
                            {#snippet children({ id })}
                                <TextInput {id} name="password" type="password" required autocomplete="current-password" />
                            {/snippet}
                        </FormField>
                        <FormField label="Code oder Wiederherstellungscode" required>
                            {#snippet children({ id })}
                                <TextInput {id} name="code" required />
                            {/snippet}
                        </FormField>
                        <Button type="submit" variant="danger" icon="shield-slash">Deaktivieren</Button>
                    </form>
                {:else}
                    <Alert
                        tone="info"
                        message="Für deine Rolle ist die Zwei-Faktor-Authentifizierung verpflichtend und kann nicht deaktiviert werden."
                    />
                {/if}
            </div>
        {:else if !data.hasEncryptionKey}
            <!--
                Kein Schluessel: die Einrichtung wuerde beim Absenden scheitern.
                Statt einen Knopf anzubieten, der in einen Fehler laeuft, steht
                hier, was dem Server fehlt und wie es zu beheben ist.
            -->
            <Alert
                tone="warning"
                title="Zwei-Faktor ist auf diesem Server nicht eingerichtet"
                message="Es fehlt der Verschlüsselungsschlüssel APP_ENC_KEY. Ohne ihn lässt sich das Geheimnis der Authenticator-App nicht sicher ablegen. Wer den Server betreibt, erzeugt ihn mit „openssl rand -base64 32“, setzt ihn als Umgebungsvariable und startet die Anwendung neu."
            />
            <p class="text-sm text-fg-subtle mt-3">
                Der Schlüssel wird einmal erzeugt und danach nie gewechselt: er verschlüsselt
                auch die bereits hinterlegten Geheimnisse.
            </p>
        {:else}
            <div class="space-y-4">
                <p class="text-sm text-fg-muted">
                    Mit einem zweiten Faktor ist dein Zugang auch dann geschützt, wenn dein
                    Passwort in falsche Hände gerät.
                </p>
                <form method="post" action="?/startMfa">
                    <Button type="submit" variant="primary" icon="shield-lock">
                        Einrichtung starten
                    </Button>
                </form>
            </div>
        {/if}
    </Card>

    <Card title="Angemeldete Geräte" meta={`${data.sessions.length} aktiv`} padding="none">
        <DataTable
            columns={sessionColumns}
            rows={data.sessions}
            getKey={(s) => s.id}
            cardTitle={(s) => s.device}
            cardSubtitle={(s) => s.ip}
            empty="Keine aktiven Sitzungen."
        >
            {#snippet actions(session)}
                {#if session.isCurrent}
                    <Badge tone="primary" size="xs" label="Dieses Gerät" />
                {:else}
                    <form method="post" action="?/revokeSession">
                        <input type="hidden" name="sessionId" value={session.id} />
                        <Button type="submit" variant="secondary" size="sm" icon="x-lg">Abmelden</Button>
                    </form>
                {/if}
            {/snippet}
        </DataTable>

        <div class="p-4 border-t border-border flex justify-end">
            <form method="post" action="?/revokeOthers">
                <Button type="submit" variant="secondary" icon="box-arrow-right">
                    Alle anderen Geräte abmelden
                </Button>
            </form>
        </div>
    </Card>
</div>
