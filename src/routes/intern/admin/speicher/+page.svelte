<script lang="ts">
    import { Alert, Badge, Button, Card, FormField, PageHeader, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const config = $derived(data.config);
    const locked = $derived(data.fromEnv);

    /** Fehlerliste des Umzugs; die Action liefert sie neben der Meldung. */
    const migrationErrors = $derived(
        (form as { errors?: string[] } | null)?.errors ?? []
    );

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
</script>

<svelte:head><title>Speicher – Administration</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Speicher"
        eyebrow="Administration"
        subtitle="Dateien in einem Objektspeicher ablegen statt in der Datenbank. Ohne Einrichtung bleibt alles wie bisher."
        back={{ href: "/intern/admin" }}
    >
        {#snippet badge()}
            {#if config.configured}
                <Badge tone="success" label="Eingerichtet" />
            {:else}
                <Badge tone="neutral" label="Datenbank" />
            {/if}
        {/snippet}
    </PageHeader>

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if form?.success}<Alert tone="success" message={form.success} />{/if}

    {#if migrationErrors.length > 0}
        <Alert tone="warning" title="Nicht alles ließ sich übertragen">
            {#snippet children()}
                <ul class="list-disc pl-5 space-y-1 text-sm">
                    {#each migrationErrors as message, index (index)}
                        <li>{message}</li>
                    {/each}
                </ul>
            {/snippet}
        </Alert>
    {/if}

    {#if locked}
        <Alert
            tone="info"
            title="Vorgabe aus der Betriebsumgebung"
            message="Der Speicher ist über die Umgebungsvariablen S3_* eingestellt und lässt sich hier nicht ändern. Verbindungstest und Umzug funktionieren trotzdem."
        />
    {:else if !data.hasEncryptionKey}
        <Alert
            tone="warning"
            title="Kein Schlüssel zum Verschlüsseln"
            message="Ohne APP_ENC_KEY in der Umgebung kann der geheime Zugangsschlüssel nicht sicher abgelegt werden. Erzeugen mit: openssl rand -base64 32"
        />
    {/if}

    <form method="post" action="?/save" class="space-y-6">
        <Card
            title="Zugangsdaten"
            subtitle="S3 oder ein kompatibler Speicher. Garage liegt dem Projekt bei; MinIO, Hetzner Object Storage und AWS gehen genauso."
        >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                    label="Endpunkt"
                    hint="Leer lassen für AWS S3 selbst. Sonst z. B. https://s3.example.org"
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="endpoint"
                            value={config.endpoint}
                            placeholder="https://s3.example.org"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Region" hint="Bei selbstgehosteten Speichern oft beliebig.">
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="region"
                            value={config.region}
                            placeholder="us-east-1"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Bucket" required>
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="bucket"
                            value={config.bucket}
                            placeholder="stamm-portal"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Pfadpräfix"
                    hint="Trennt mehrere Installationen in einem gemeinsamen Bucket."
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="prefix"
                            value={config.prefix}
                            placeholder="stamm-edelweiss/"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Zugriffsschlüssel" required>
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="accessKeyId"
                            value={config.accessKeyId}
                            autocomplete="off"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>

                <FormField
                    label="Geheimer Schlüssel"
                    hint={config.hasSecret
                        ? "Hinterlegt. Leer lassen, um ihn zu behalten."
                        : "Wird verschlüsselt gespeichert und nie wieder angezeigt."}
                >
                    {#snippet children({ id })}
                        <TextInput
                            {id}
                            name="secretAccessKey"
                            type="password"
                            value=""
                            placeholder={config.hasSecret ? "••••••••••••" : ""}
                            autocomplete="new-password"
                            disabled={locked}
                        />
                    {/snippet}
                </FormField>
            </div>

            <label class="flex items-start gap-2 text-sm text-fg mt-4 cursor-pointer">
                <input
                    type="checkbox"
                    name="forcePathStyle"
                    checked={config.forcePathStyle}
                    disabled={locked}
                    class="mt-0.5 rounded border-border-strong"
                />
                <span>
                    Pfad-Adressierung erzwingen
                    <span class="block text-xs text-fg-muted">
                        Nötig für Garage, MinIO und die meisten selbstgehosteten
                        Speicher. Bei AWS S3 selbst abschalten.
                    </span>
                </span>
            </label>

            {#if !locked}
                <div class="flex justify-end pt-4">
                    <Button type="submit" variant="primary" icon="check-lg">Speichern</Button>
                </div>
            {/if}
        </Card>
    </form>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Verbindung prüfen" subtitle="Schreibt ein Testobjekt, liest es und löscht es wieder.">
            <p class="text-sm text-fg-muted">
                Ein reiner Lesezugang besteht eine bloße Erreichbarkeitsprüfung und scheitert erst
                bei der ersten hochgeladenen Datei. Deshalb wird hier wirklich geschrieben.
            </p>

            <form method="post" action="?/test" class="flex justify-end pt-4">
                <Button
                    type="submit"
                    variant="secondary"
                    icon="plug"
                    disabled={!config.configured}
                >
                    Verbindung prüfen
                </Button>
            </form>
        </Card>

        <Card title="Dateien umziehen" subtitle="Überträgt, was noch in der Datenbank liegt.">
            <dl class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <dt class="text-fg-subtle">In der Datenbank</dt>
                    <dd class="text-2xl font-semibold text-fg tabular-nums">
                        {data.pending.count}
                    </dd>
                </div>
                <div>
                    <dt class="text-fg-subtle">Umfang</dt>
                    <dd class="text-2xl font-semibold text-fg tabular-nums">
                        {formatBytes(data.pending.bytes)}
                    </dd>
                </div>
            </dl>

            <p class="text-sm text-fg-muted mt-4">
                Der Vorgang läuft in Stapeln und ist wiederholbar: was bereits oben liegt, wird
                übersprungen. Ein zweiter Lauf meldet deshalb null übertragene Dateien.
            </p>

            <form method="post" action="?/migrate" class="flex justify-end pt-4">
                <Button
                    type="submit"
                    variant="primary"
                    icon="box-arrow-up"
                    disabled={!config.configured || data.pending.count === 0}
                >
                    {data.pending.count === 0 ? "Nichts zu übertragen" : "Dateien umziehen"}
                </Button>
            </form>
        </Card>
    </div>
</div>
