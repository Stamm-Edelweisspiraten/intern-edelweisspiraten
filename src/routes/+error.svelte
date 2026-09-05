<script lang="ts">
    import { page } from "$app/state";
    import { Button, Card } from "$lib/components/ui";

    /**
     * SvelteKit uebergibt an +error.svelte KEINE Props -- die frueheren
     * `export let error` und `export let status` blieben deshalb undefined und
     * die Seite meldete ausnahmslos "Fehler 500".
     */
    const status = $derived(page.status);
    const message = $derived(page.error?.message ?? "");

    interface Copy {
        icon: string;
        eyebrow: string;
        title: string;
        description: string;
        hints: string[];
    }

    const COPY: Copy = $derived.by(() => {
        if (status === 401 || status === 403) {
            return {
                icon: "shield-lock",
                eyebrow: `Fehler ${status}`,
                title: "Kein Zugriff auf diesen Bereich",
                description: "Für diese Seite fehlen deinem Zugang die nötigen Rechte.",
                hints: [
                    "Prüfe, ob du mit dem richtigen Zugang angemeldet bist.",
                    "Brauchst du den Bereich für deine Aufgabe, wende dich an einen Administrator."
                ]
            };
        }

        if (status === 404) {
            return {
                icon: "compass",
                eyebrow: "Fehler 404",
                title: "Diese Seite gibt es nicht",
                description: "Die Adresse führt ins Leere – vielleicht wurde der Eintrag gelöscht oder verschoben.",
                hints: [
                    "Prüfe die Adresse auf Tippfehler.",
                    "Über das Menü im internen Bereich kommst du zu allen Modulen."
                ]
            };
        }

        return {
            icon: "exclamation-triangle",
            eyebrow: `Fehler ${status}`,
            title: "Unerwarteter Fehler",
            description: "Beim Laden dieser Seite ist etwas schiefgegangen.",
            hints: [
                "Lade die Seite neu – häufig hilft das bereits.",
                "Bleibt der Fehler bestehen, melde ihn mit Adresse und Fehlercode beim IT-Team."
            ]
        };
    });
</script>

<svelte:head><title>Fehler {status} - Stamm Edelweißpiraten</title></svelte:head>

<div class="min-h-screen bg-surface-muted flex items-center justify-center px-4 py-16">
    <div class="w-full max-w-xl">
        <Card>
            <div class="text-center space-y-4">
                <span
                    class="w-16 h-16 mx-auto inline-flex items-center justify-center rounded-2xl bg-danger-soft text-danger-soft-fg border border-danger-soft-border"
                >
                    <span class={`bi bi-${COPY.icon} text-3xl`} aria-hidden="true"></span>
                </span>

                <div>
                    <p class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                        {COPY.eyebrow}
                    </p>
                    <h1 class="text-3xl font-bold text-fg mt-1">{COPY.title}</h1>
                </div>

                <p class="text-sm text-fg-muted">{COPY.description}</p>

                {#if message && message !== COPY.title}
                    <p class="text-sm font-medium text-fg bg-surface-muted border border-border rounded-xl px-4 py-3">
                        {message}
                    </p>
                {/if}

                <ul class="text-sm text-fg-subtle space-y-1 text-left list-disc list-inside">
                    {#each COPY.hints as hint (hint)}
                        <li>{hint}</li>
                    {/each}
                </ul>

                <div class="flex gap-3 justify-center flex-wrap pt-2">
                    <Button href="/" variant="secondary" icon="house">Startseite</Button>
                    <Button href="/intern/dashboard" variant="primary" icon="speedometer2">
                        Zum Dashboard
                    </Button>
                </div>
            </div>
        </Card>
    </div>
</div>
