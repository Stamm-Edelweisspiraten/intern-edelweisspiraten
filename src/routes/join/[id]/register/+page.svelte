<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Alert, Button, FormField, TextInput } from "$lib/components/ui";
    import type { ActionData, PageData } from "./$types";

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let accountType = $state<"child" | "parent">(data.isAdult ? "parent" : "child");
    let password = $state("");
    let passwordRepeat = $state("");
    let submitting = $state(false);

    const mismatch = $derived(passwordRepeat.length > 0 && password !== passwordRepeat);
</script>

<svelte:head>
    <title>Registrierung</title>
</svelte:head>

<AuthShell
    title={`Zugang für ${data.member.firstname} ${data.member.lastname}`}
    eyebrow="Zugang erstellen"
    icon="person-plus"
    subtitle={data.isAdult
        ? "Da das Mitglied volljährig ist, wird ein eigenständiger Zugang angelegt."
        : "Lege fest, wem dieser Zugang gehört, und wähle ein Passwort."}
>
    {#if form?.error}
        <Alert tone="danger" message={form.error} />
    {/if}

    <form
        method="post"
        class="space-y-4"
        use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
                await update({ reset: false });
                submitting = false;
            };
        }}
    >
        <input type="hidden" name="accountType" value={accountType} />

        {#if !data.isAdult}
            <fieldset class="space-y-2">
                <legend class="block text-sm font-semibold text-fg-muted mb-1">Wem gehört dieser Zugang?</legend>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                        type="button"
                        onclick={() => (accountType = "parent")}
                        aria-pressed={accountType === "parent"}
                        class={`px-4 py-3 rounded-xl border text-sm font-semibold text-left transition ${accountType === "parent" ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface text-fg hover:bg-surface-muted"}`}
                    >
                        Elternteil
                        <span class="block text-xs font-normal opacity-80">Ich verwalte für mein Kind.</span>
                    </button>
                    <button
                        type="button"
                        onclick={() => (accountType = "child")}
                        aria-pressed={accountType === "child"}
                        class={`px-4 py-3 rounded-xl border text-sm font-semibold text-left transition ${accountType === "child" ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface text-fg hover:bg-surface-muted"}`}
                    >
                        Mitglied selbst
                        <span class="block text-xs font-normal opacity-80">Der Zugang gehört dem Mitglied.</span>
                    </button>
                </div>
            </fieldset>
        {/if}

        <FormField label="Name" required>
            {#snippet children({ id, describedBy })}
                <TextInput {id} {describedBy} name="name" value={form?.name ?? ""} required autocomplete="name" />
            {/snippet}
        </FormField>

        <FormField label="E-Mail-Adresse" hint="Wird zugleich für die Anmeldung verwendet." required>
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

        <FormField label="Passwort" hint={`Mindestens ${data.minPasswordLength} Zeichen.`} required>
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
                    name="password2"
                    type="password"
                    bind:value={passwordRepeat}
                    required
                    autocomplete="new-password"
                />
            {/snippet}
        </FormField>

        <Button type="submit" variant="primary" full loading={submitting} disabled={mismatch} icon="check-lg">
            Zugang erstellen
        </Button>
    </form>
</AuthShell>
