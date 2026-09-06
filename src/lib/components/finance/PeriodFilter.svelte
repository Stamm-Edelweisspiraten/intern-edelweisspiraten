<script lang="ts">
    import { Button, Card, FormField, TextInput } from "$lib/components/ui";

    /**
     * Zeitraumwahl fuer Berichte und Kontenblaetter.
     *
     * Bewusst ein reines GET-Formular: der gewaehlte Zeitraum steht damit in
     * der Adresse und laesst sich verschicken oder als Lesezeichen ablegen.
     */

    interface Props {
        from: string;
        to: string;
        /** Zusaetzliche Felder, die beim Filtern erhalten bleiben sollen. */
        extra?: Record<string, string>;
    }

    let { from, to, extra = {} }: Props = $props();
</script>

<Card title="Zeitraum">
    <form method="get" class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        {#each Object.entries(extra) as [name, value] (name)}
            <input type="hidden" {name} {value} />
        {/each}

        <FormField label="Von">
            {#snippet children({ id })}
                <TextInput {id} name="from" type="date" value={from} />
            {/snippet}
        </FormField>

        <FormField label="Bis">
            {#snippet children({ id })}
                <TextInput {id} name="to" type="date" value={to} />
            {/snippet}
        </FormField>

        <div class="flex gap-3">
            <Button type="submit" variant="secondary" icon="funnel" full>Anzeigen</Button>
        </div>
    </form>
</Card>
