<script lang="ts">
    import { Alert, Badge, Button, Card, FormField, PageHeader, Select, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const config = $derived(data.config);
    const locked = $derived(data.fromEnv);

    const ENCRYPTIONS = [
        { value: "none", label: "Keine" },
        { value: "starttls", label: "STARTTLS" },
        { value: "tls", label: "SSL/TLS" }
    ];
</script>

<svelte:head><title>E-Mail – Administration</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="E-Mail"
        eyebrow="Administration"
        subtitle="Postausgang für Einladungen, Passwortlinks und den Massenversand an Gruppen."
        back={{ href: "/intern/admin" }}
    >
        {#snippet badge()}
            {#if config.configured}
                <Badge tone="success" label="Eingerichtet" />
            {:else}
                <Badge tone="warning" label="Kein Versand" />
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if locked}
        <Alert
            tone="info"
            title="Vorgabe aus der Betriebsumgebung"
            message="Der Postausgang ist über die Umgebungsvariablen SMTP_* eingestellt und lässt sich hier nicht ändern. Verbindungsprüfung und Testnachricht funktionieren trotzdem."
        />
    {:else}
        {#if !data.hasEncryptionKey}
            <Alert
                tone="warning"
                title="Kein Schlüssel zum Verschlüsseln"
                message="Ohne APP_ENC_KEY in der Umgebung kann das Passwort nicht sicher abgelegt werden. Erzeugen mit: openssl rand -base64 32"
            />
        {/if}
        {#if !config.configured}
            <Alert
                tone="warning"
                title="Noch kein Versand möglich"
                message="Solange Servername und Absenderadresse fehlen, scheitern Einladungen und Passwortlinks. Betroffene Nutzer bekommen dann keine Nachricht."
            />
        {/if}
    {/if}

    <form method="post" action="?/save" class="space-y-6">
        <Card
            title="Zugang"
            subtitle="Die Zugangsdaten des Postausgangs, wie sie der Anbieter nennt."
        >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Server" required hint="Zum Beispiel smtp.example.org">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="host"
                            value={config.host}
                            placeholder="smtp.example.org"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Port" hint="587 für STARTTLS, 465 für SSL/TLS, 25 ohne Verschlüsselung.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="port"
                            type="number"
                            value={config.port}
                            min={1}
                            max={65535}
                            inputmode="numeric"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Verschlüsselung"
                    hint="Passt sie nicht zum Port, bricht die Verbindung ohne aussagekräftige Meldung ab."
                >
                    {#snippet children({ id })}
                        <Select
                            {id}
                            name="encryption"
                            value={config.encryption}
                            options={ENCRYPTIONS}
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Benutzername" hint="Leer lassen für einen Relay ohne Anmeldung.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="user"
                            value={config.user}
                            autocomplete="off"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Passwort"
                    hint={config.hasPassword
                        ? "Hinterlegt. Leer lassen, um es zu behalten."
                        : "Wird verschlüsselt gespeichert und nie wieder angezeigt."}
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="password"
                            type="password"
                            value=""
                            placeholder={config.hasPassword ? "••••••••••••" : ""}
                            autocomplete="new-password"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>
            </div>
        </Card>

        <Card title="Absender" subtitle="Was im Postfach der Empfänger steht.">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Absenderadresse" required hint="Viele Anbieter verlangen eine Adresse der eigenen Domain.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="fromEmail"
                            type="email"
                            value={config.fromEmail}
                            placeholder="portal@example.org"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Absendername" hint="Leer lassen, um nur die Adresse zu zeigen.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="fromName"
                            value={config.fromName}
                            placeholder="Stamm Musterstadt"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Antwortadresse"
                    hint="Wohin Antworten gehen, wenn die Absenderadresse nicht gelesen wird."
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="replyTo"
                            type="email"
                            value={config.replyTo}
                            placeholder="vorstand@example.org"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>
            </div>

            {#if !locked}
                <div class="flex justify-end pt-4">
                    <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
                </div>
            {/if}
        </Card>
    </form>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Verbindung prüfen" subtitle="Meldet sich beim Server an, ohne etwas zu senden.">
            <p class="text-sm text-fg-muted">
                Prüft Erreichbarkeit, Verschlüsselung und Anmeldung. Ob der Server die
                Absenderadresse akzeptiert, zeigt erst die Testnachricht.
            </p>

            <form method="post" action="?/test" class="flex justify-end pt-4">
                <Button type="submit" variant="secondary" icon="plug" disabled={!config.configured}>
                    Verbindung prüfen
                </Button>
            </form>
        </Card>

        <Card title="Testnachricht senden" subtitle="Der einzige Nachweis, dass wirklich etwas ankommt.">
            <form method="post" action="?/testmail" class="space-y-4">
                <FormField label="Empfänger" hint="Am besten die eigene Adresse.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="to"
                            type="email"
                            value={data.testAddress}
                            placeholder="name@example.org"
                            disabled={!config.configured}
                        />
                    {/snippet}
                </FormField>

                <div class="flex justify-end">
                    <Button
                        type="submit"
                        variant="primary"
                        icon="send"
                        disabled={!config.configured}
                    >
                        Testnachricht senden
                    </Button>
                </div>
            </form>
        </Card>
    </div>
</div>
