<script lang="ts">
    import { page } from "$app/state";
    import { Badge, Button, Card } from "$lib/components/ui";

    /**
     * Die Startseite leitet serverseitig auf /login um; sichtbar wird sie nur,
     * wenn die Umleitung ausbleibt. Die Angaben kommen deshalb aus den
     * Layout-Daten und nicht aus einem eigenen load.
     */
    const organization = $derived(page.data.organization);

    const FEATURES = [
        { icon: "shield-lock", text: "Rechteverwaltung, Gruppen, Mitglieder und Dateien" },
        { icon: "person-check", text: "Zugriff ausschließlich mit gültigem Login" },
        { icon: "wallet2", text: "Beiträge, offene Posten und Bestellungen im Blick" }
    ];

    const FACTS = $derived(
        [
            { label: "Rollen", value: "Admins und Leitende" },
            { label: "Module", value: "Mitglieder, Gruppen, Kasse" },
            organization?.contactEmail
                ? { label: "Kontakt", value: organization.contactEmail }
                : null,
            { label: "Zugang", value: "Verschlüsselt und protokolliert" }
        ].filter((fact) => fact !== null)
    );
</script>

<svelte:head><title>{organization?.name ?? "Internes Portal"} &ndash; Intern</title></svelte:head>

<div class="min-h-screen bg-surface-muted flex items-center justify-center px-4 py-16">
    <div class="w-full max-w-5xl grid lg:grid-cols-2 gap-6 items-stretch">
        <Card>
            <div class="space-y-5">
                <p class="text-xs font-semibold text-fg-subtle uppercase tracking-[0.25em]">
                    {organization?.name ?? "Internes Portal"}
                </p>
                <h1 class="text-4xl font-bold text-fg leading-tight">Internes Portal</h1>
                <p class="text-sm text-fg-muted">
                    Der Zugang ist eingeloggten Mitgliedern vorbehalten. Melde dich an, um zur
                    internen Plattform zu gelangen.
                </p>

                <ul class="space-y-2">
                    {#each FEATURES as feature (feature.text)}
                        <li class="flex items-start gap-3 text-sm text-fg-muted">
                            <span class={`bi bi-${feature.icon} text-primary mt-0.5`} aria-hidden="true"></span>
                            <span>{feature.text}</span>
                        </li>
                    {/each}
                </ul>

                <div class="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button href="/login" variant="primary" icon="box-arrow-in-right">
                        Jetzt einloggen
                    </Button>
                    {#if organization?.website}
                        <Button
                            href={organization.website}
                            variant="secondary"
                            iconRight="box-arrow-up-right">Zur Website</Button
                        >
                    {/if}
                </div>
            </div>
        </Card>

        <Card title="Sicher und verschlüsselt" subtitle="Was dich hinter der Anmeldung erwartet.">
            {#snippet actions()}
                <Badge tone="success" icon="circle-fill" size="xs" label="Online" />
            {/snippet}

            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {#each FACTS as fact (fact.label)}
                    <div class="rounded-xl border border-border bg-surface-muted p-4 min-w-0">
                        <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                            {fact.label}
                        </dt>
                        <dd class="text-sm font-semibold text-fg mt-1 break-words">{fact.value}</dd>
                    </div>
                {/each}
            </dl>

            <p class="text-xs text-fg-subtle mt-4">
                Bei Fragen oder Problemen wende dich an das IT-Team. Der Zugriff ist nur mit
                gültigen Zugangsdaten möglich.
            </p>
        </Card>
    </div>
</div>
