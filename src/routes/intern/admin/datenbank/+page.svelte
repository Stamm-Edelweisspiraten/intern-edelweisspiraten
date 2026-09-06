<script lang="ts">
    import { Alert, Badge, Button, Card, PageHeader } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const info = $derived(data.info);
    const feedback = $derived(form as { error?: string; success?: string } | null);

    /** Woher die Verbindung stammt -- in derselben Reihenfolge wie die Aufloesung. */
    const SOURCES: Record<string, string> = {
        "env-url": "Umgebungsvariable DATABASE_URL",
        "env-parts": "Einzelne DB_* Variablen",
        file: "Setup-Datei",
        none: "Nicht konfiguriert"
    };

    /**
     * Die Variablen, mit denen sich die Verbindung einstellen laesst.
     *
     * Sie stehen hier, weil die Seite selbst nichts umstellt: wer wechseln
     * will, setzt eine davon und startet neu.
     */
    const VARIABLES = [
        {
            name: "DATABASE_URL",
            hint: "Vollständige Verbindung, z. B. postgresql://benutzer:passwort@host:5432/datenbank. Überstimmt alles Weitere."
        },
        {
            name: "DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL",
            hint: "Einzelne Angaben, für Umgebungen, die Zugangsdaten getrennt einspeisen. Greifen nur, wenn mindestens DB_HOST und DB_NAME gesetzt sind."
        },
        {
            name: "DB_TYPE",
            hint: "Nur zur Kontrolle. Erlaubt sind „postgres“ und „postgresql“; alles andere wird beim Start abgelehnt."
        },
        {
            name: "DB_CONFIG_FILE",
            hint: "Ort der Datei, die der Einrichtungsassistent schreibt. Vorgabe: ./data/database.json"
        },
        {
            name: "DATABASE_POOL_MAX",
            hint: "Größe des Verbindungspools. Vorgabe: 10."
        }
    ];

    function formatDate(value: string | null): string {
        if (!value) return "—";
        return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    }
</script>

<svelte:head><title>Datenbank – Administration</title></svelte:head>

<div class="space-y-8">
    <PageHeader
        title="Datenbank"
        eyebrow="Administration"
        subtitle="Woher die Verbindung stammt, wohin sie zeigt und welche Migrationen angewendet sind."
        back={{ href: "/intern/admin" }}
    >
        {#snippet badge()}
            {#if data.server.reachable}
                <Badge tone="success" label="Verbunden" />
            {:else}
                <Badge tone="danger" label="Nicht erreichbar" />
            {/if}
        {/snippet}
    </PageHeader>

    {#if feedback?.error}<Alert tone="danger" message={feedback.error} />{/if}
    {#if feedback?.success}<Alert tone="success" message={feedback.success} />{/if}

    {#if info.error}
        <Alert tone="danger" title="Die Konfiguration ist widersprüchlich" message={info.error} />
    {:else if !data.server.reachable}
        <Alert
            tone="danger"
            title="Keine Verbindung"
            message={data.server.error ?? "Die Datenbank antwortet nicht."}
        />
    {/if}

    <Card title="Verbindung" subtitle="Das Passwort wird nirgends angezeigt und nirgends ausgegeben.">
        <dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
                <dt class="text-fg-subtle">Herkunft</dt>
                <dd class="text-fg font-semibold">{SOURCES[info.source] ?? info.source}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Host</dt>
                <dd class="text-fg font-semibold break-all">{info.host ?? "—"}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Port</dt>
                <dd class="text-fg font-semibold tabular-nums">{info.port ?? "—"}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Datenbank</dt>
                <dd class="text-fg font-semibold break-all">{info.database ?? "—"}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Benutzer</dt>
                <dd class="text-fg font-semibold break-all">{info.user || "—"}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">SSL</dt>
                <dd class="text-fg font-semibold">{info.ssl ? "Erforderlich" : "Aus"}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Poolgröße</dt>
                <dd class="text-fg font-semibold tabular-nums">{info.poolMax}</dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Serverversion</dt>
                <dd class="text-fg font-semibold">
                    {data.server.version ? `PostgreSQL ${data.server.version}` : "—"}
                </dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Setup-Datei</dt>
                <dd class="text-fg font-semibold break-all">{info.configFile}</dd>
            </div>
        </dl>

        <form method="post" action="?/test" class="flex justify-end pt-6">
            <Button type="submit" variant="secondary" icon="plug">Verbindung prüfen</Button>
        </form>
    </Card>

    <Alert tone="warning" title="Die Verbindung lässt sich hier nicht umstellen">
        {#snippet children()}
            <p>Das ist Absicht, aus drei Gründen:</p>
            <ul class="list-disc pl-5 space-y-1 mt-2">
                <li>
                    Der Verbindungspool entsteht beim Laden des Moduls und wird vom ganzen Prozess
                    geteilt. Ein Wechsel im laufenden Betrieb träfe ihn nicht rückwirkend.
                </li>
                <li>
                    Offene Transaktionen und der Sitzungsspeicher hingen danach an zwei
                    Datenbanken gleichzeitig — angemeldete Personen würden ausgeworfen, halb
                    geschriebene Buchungen blieben liegen.
                </li>
                <li>
                    Ohne Migration und Datenumzug ist ein Wechsel gleichbedeutend mit
                    Datenverlust: die neue Datenbank ist leer.
                </li>
            </ul>
            <p class="mt-2">
                Der Weg ist deshalb: eine der unten genannten Umgebungsvariablen setzen und die
                Anwendung neu starten. Die Migrationen laufen beim Start des Containers ohnehin.
            </p>
        {/snippet}
    </Alert>

    <Card
        title="Migrationen"
        subtitle="Was im Ordner drizzle/ liegt, verglichen mit dem, was in der Datenbank vermerkt ist."
    >
        {#if data.migrations.error}
            <Alert tone="warning" message={data.migrations.error} />
        {/if}

        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
                <dt class="text-fg-subtle">Angewendet</dt>
                <dd class="text-2xl font-semibold text-fg tabular-nums">
                    {data.migrations.appliedCount}
                </dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Ausstehend</dt>
                <dd class="text-2xl font-semibold text-fg tabular-nums">
                    {data.migrations.pendingCount}
                </dd>
            </div>
            <div>
                <dt class="text-fg-subtle">Zuletzt</dt>
                <dd class="text-sm font-semibold text-fg pt-2">
                    {formatDate(data.migrations.lastAppliedAt)}
                </dd>
            </div>
        </dl>

        {#if data.migrations.entries.length > 0}
            <ul class="mt-6 divide-y divide-border border border-border rounded-control">
                {#each data.migrations.entries as entry (entry.tag)}
                    <li class="flex items-center justify-between gap-4 px-4 py-3">
                        <span class="text-sm text-fg font-mono break-all">{entry.tag}</span>
                        {#if entry.applied}
                            <Badge tone="success" label={formatDate(entry.appliedAt)} />
                        {:else}
                            <Badge tone="warning" label="Ausstehend" />
                        {/if}
                    </li>
                {/each}
            </ul>

            {#if data.migrations.pendingCount > 0}
                <p class="text-sm text-fg-muted mt-4">
                    Ausstehende Migrationen werden beim nächsten Start angewendet, von Hand mit
                    <code class="text-xs">npm run db:migrate</code>.
                </p>
            {/if}
        {/if}
    </Card>

    <Card title="Umgebungsvariablen" subtitle="In dieser Reihenfolge wird ausgewertet.">
        <dl class="space-y-4 text-sm">
            {#each VARIABLES as variable (variable.name)}
                <div>
                    <dt class="font-mono text-xs text-fg break-all">{variable.name}</dt>
                    <dd class="text-fg-muted mt-1">{variable.hint}</dd>
                </div>
            {/each}
        </dl>
    </Card>
</div>
