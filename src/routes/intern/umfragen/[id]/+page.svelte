<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        Alert,
        Badge,
        Button,
        Card,
        ConfirmDialog,
        EmptyState,
        FormField,
        Modal,
        PageHeader,
        Select,
        TextInput,
        Textarea
    } from "$lib/components/ui";
    import { SurveyForm } from "$lib/components/surveys";
    import type { SurveyNameMode } from "$lib/components/surveys";
    import { formatDate, formatDateTime } from "$lib/format";
    import { fieldTypeName } from "$lib/surveys/fields";
    import type { ActionData, PageData } from "./$types";

    /**
     * Eine Umfrage ausfüllen und verwalten.
     *
     * Das Formular selbst steht in `SurveyForm` -- derselben Komponente, die
     * die öffentliche Seite `/umfrage/[token]` benutzt. Elf Feldtypen,
     * „Sonstiges" und die Skala zweimal zu bauen hieße, sie zweimal
     * auseinanderlaufen zu lassen.
     *
     * Im Mitglieder-Modus steht je verknüpftem Mitglied ein eigener Block --
     * jeder in seinem eigenen `<form>`, weil jeder für sich abgeschickt wird.
     * Feldfehler kommen aus `form.fieldErrors` und gelten nur für den Block,
     * der sie ausgelöst hat.
     */

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type Subject = PageData["subjects"][number];

    const survey = $derived(data.survey);

    let editOpen = $state(false);
    let shareOpen = $state(false);
    let deleteOpen = $state(false);
    let closeOpen = $state(false);
    let revokeOpen = $state(false);
    let withdrawOpen = $state(false);
    let withdrawTarget = $state<Subject | null>(null);
    let deleteForm = $state<HTMLFormElement | null>(null);
    let closeForm = $state<HTMLFormElement | null>(null);
    let revokeForm = $state<HTMLFormElement | null>(null);
    let withdrawForm = $state<HTMLFormElement | null>(null);
    let pending = $state("");

    const STATUS_TONES = { draft: "neutral", published: "success", closed: "info" } as const;
    const STATUS_LABELS = {
        draft: "Entwurf",
        published: "Läuft",
        closed: "Abgeschlossen"
    } as const;

    function track(key: string) {
        return () => {
            pending = key;
            return async ({ update }: { update: () => Promise<void> }) => {
                await update();
                pending = "";
            };
        };
    }

    /** Feldfehler gelten immer nur für den Block, der abgeschickt wurde. */
    function fieldErrors(subject: Subject): Record<string, string> {
        if (!form || !("fieldErrors" in form)) return {};
        if (form.subject !== subject.key) return {};
        return form.fieldErrors ?? {};
    }

    /**
     * Die Rückfrage steht EINMAL auf der Seite, nicht je Block -- und das
     * versteckte Formular daneben trägt die Kennung, die sie gerade meint.
     */
    function askWithdraw(subject: Subject) {
        withdrawTarget = subject;
        withdrawOpen = true;
    }

    const sharedIds = $derived(new Set(survey.shares.map((share) => share.targetId)));

    const eventOptions = $derived(
        data.events.map((entry) => ({
            value: entry.id,
            label: `${formatDate(entry.startsAt)} – ${entry.title}`
        }))
    );

    /** ISO-Zeitpunkt für ein `<input type="datetime-local">`. */
    function forInput(iso: string | null): string {
        if (!iso) return "";
        const date = new Date(iso);
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    /**
     * Die drei Namensmodi mit deutscher Beschriftung.
     *
     * `PUBLIC_NAME_MODES` steht im `surveyService` und damit hinter
     * `$lib/server` -- ein Import zöge den Datenbankzweig ins Browser-Bündel.
     * Der Typ `SurveyNameMode` aus `$lib/components/surveys` trägt dieselben
     * drei Werte und sichert die Liste beim Übersetzen ab.
     */
    const NAME_MODES: { value: SurveyNameMode; label: string }[] = [
        { value: "required", label: "Pflicht – ohne Namen kein Absenden" },
        { value: "optional", label: "Freiwillig – der Name darf fehlen" },
        { value: "none", label: "Ganz ohne – es wird nicht nach dem Namen gefragt" }
    ];

    /**
     * Die Adresse kommt genau einmal zurück, direkt nach dem Erzeugen.
     * Aus dem `load` käme sie bei jedem Neuladen wieder -- und stünde damit
     * dauerhaft im ausgelieferten HTML.
     */
    const freshLink = $derived((form as { linkUrl?: string } | null)?.linkUrl ?? "");

    let copied = $state(false);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(freshLink);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            // Ohne Zugriff auf die Zwischenablage bleibt der Text zum Markieren
            // stehen -- das genügt.
        }
    }
</script>

<svelte:head><title>{survey.title} - Umfragen</title></svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
    <PageHeader
        title={survey.title}
        eyebrow="Umfrage"
        subtitle={survey.eventTitle ? `Zum Termin „${survey.eventTitle}“` : undefined}
        back={{ href: "/intern/umfragen", label: "Zur Übersicht" }}
    >
        {#snippet badge()}
            <Badge tone={STATUS_TONES[survey.status]} label={STATUS_LABELS[survey.status]} />
            {#if survey.anonymous}
                <Badge tone="info" size="xs" icon="incognito" label="Anonym" />
            {/if}
            {#if survey.publicEnabled && survey.hasPublicLink}
                <Badge tone="warning" size="xs" icon="link-45deg" label="Extern freigegeben" />
            {/if}
        {/snippet}

        {#snippet actions()}
            {#if data.canResults}
                <Button
                    href={`/intern/umfragen/${survey.id}/auswertung`}
                    variant="secondary"
                    icon="bar-chart"
                >
                    Auswertung
                </Button>
            {/if}
            {#if data.canManage}
                <Button variant="secondary" icon="pencil" onclick={() => (editOpen = true)}>
                    Bearbeiten
                </Button>
                <Button
                    href={`/intern/umfragen/${survey.id}/fragen`}
                    variant="secondary"
                    icon="list-check"
                >
                    Fragen
                </Button>
                <Button variant="secondary" icon="share" onclick={() => (shareOpen = true)}>
                    Freigaben
                </Button>
                {#if survey.status === "draft"}
                    <form method="post" action="?/publish" use:enhance={track("publish")}>
                        <Button
                            type="submit"
                            variant="primary"
                            icon="send"
                            loading={pending === "publish"}
                        >
                            Veröffentlichen
                        </Button>
                    </form>
                {:else if survey.status === "published"}
                    <Button variant="ghost" icon="lock" onclick={() => (closeOpen = true)}>
                        Schließen
                    </Button>
                {/if}
                <Button variant="ghost" icon="trash" onclick={() => (deleteOpen = true)}>
                    Löschen
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <!-- Hinweis aus dem Assistenten: die Umfrage entstand, etwas daran nicht. -->
    {#if data.notice}<Alert tone="warning" message={data.notice} />{/if}

    {#if form?.error}<Alert tone="danger" message={form.error} />{/if}
    {#if freshLink}
        <Alert tone="success" title="Externer Link erzeugt">
            {#snippet children()}
                <p class="text-sm mb-3">
                    Dieser Link wird <strong>nur jetzt</strong> angezeigt. Danach lässt er sich
                    nirgends mehr nachschlagen – gespeichert ist nur sein Abdruck.
                </p>

                <div class="flex items-start gap-2 flex-wrap">
                    <code
                        class="flex-1 min-w-0 px-3 py-2 rounded-control bg-surface border border-border text-xs break-all"
                    >
                        {freshLink}
                    </code>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={copied ? "check-lg" : "clipboard"}
                        onclick={copyLink}
                    >
                        {copied ? "Kopiert" : "Kopieren"}
                    </Button>
                </div>
            {/snippet}
        </Alert>
    {:else if form?.success}
        <Alert tone="success" message={form.success} />
    {/if}

    <!-- Eckdaten -->
    <Card title="Über diese Umfrage">
        {#if survey.description}
            <p class="text-sm text-fg whitespace-pre-line">{survey.description}</p>
        {/if}

        <dl class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
                <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    Wer antwortet
                </dt>
                <dd class="text-fg mt-1">
                    {survey.audience === "member"
                        ? "Je verknüpftem Mitglied"
                        : "Je Zugang, einmal pro Person"}
                </dd>
            </div>
            <div>
                <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    Antwortzeitraum
                </dt>
                <dd class="text-fg mt-1">
                    {#if survey.opensAt || survey.closesAt}
                        {survey.opensAt ? `ab ${formatDateTime(survey.opensAt)}` : "ab sofort"}
                        {survey.closesAt ? ` bis ${formatDateTime(survey.closesAt)}` : ""}
                    {:else}
                        Ohne Frist
                    {/if}
                </dd>
            </div>
            <div>
                <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    Fragen
                </dt>
                <dd class="text-fg mt-1 tabular-figures">{survey.fields.length}</dd>
            </div>
            <div>
                <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    Antworten
                </dt>
                <dd class="text-fg mt-1 tabular-figures">{survey.responseCount}</dd>
            </div>
            {#if survey.eventTitle}
                <div class="sm:col-span-2">
                    <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                        Termin
                    </dt>
                    <dd class="mt-1">
                        <a
                            href={`/intern/termine/${survey.eventId}`}
                            class="text-primary font-semibold hover:underline"
                        >
                            {survey.eventTitle}
                        </a>
                    </dd>
                </div>
            {/if}
            <div class="sm:col-span-2">
                <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                    Freigegeben für
                </dt>
                <dd class="mt-1 flex flex-wrap gap-2">
                    {#if survey.shares.length === 0}
                        <span class="text-fg-muted">Alle im Stamm</span>
                    {:else}
                        {#each survey.shares as share (share.id)}
                            <Badge tone="neutral" size="xs" label={share.targetName} />
                        {/each}
                    {/if}
                </dd>
            </div>
        </dl>
    </Card>

    {#if survey.anonymous}
        <Alert
            tone="info"
            title="Diese Umfrage ist anonym"
            message="Deine Antwort wird ohne Absender gespeichert. Sie lässt sich danach weder ändern noch zurücknehmen – auch nicht von der Stammesführung. Vermerkt wird lediglich, DASS du teilgenommen hast."
        />
    {/if}

    <!-- Ausfüllen -->
    <Card
        title="Deine Antwort"
        subtitle={survey.audience === "member" && data.subjects.length > 1
            ? "Für jedes verknüpfte Mitglied getrennt."
            : undefined}
    >
        {#if survey.fields.length === 0}
            <EmptyState inline title="Zu dieser Umfrage gibt es noch keine Fragen." />
        {:else if survey.audience === "member" && data.subjects.length === 0}
            <p class="text-sm text-fg-muted">
                Mit deinem Zugang ist kein Mitglied verknüpft. Diese Umfrage wird je Mitglied
                beantwortet – eine Antwort ist deshalb nicht möglich. Die Stammesführung kann die
                Verknüpfung nachtragen.
            </p>
        {:else}
            {#if data.closedReason}
                <Alert tone="info" message={data.closedReason} />
            {/if}

            <div class="space-y-6 mt-2">
                {#each data.subjects as subject (subject.key)}
                    <form
                        method="post"
                        action="?/respond"
                        class="p-4 rounded-card border border-border space-y-4"
                        use:enhance={track(`respond:${subject.key}`)}
                    >
                        {#if subject.memberId}
                            <input type="hidden" name="memberId" value={subject.memberId} />
                        {/if}

                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <span class="text-sm font-semibold text-fg">
                                {subject.name ?? "Deine Antwort"}
                            </span>
                            {#if survey.anonymous}
                                <span class="text-xs text-fg-subtle">Ohne Absender</span>
                            {:else if subject.answered}
                                <Badge tone="success" size="xs" label="Beantwortet" />
                            {:else}
                                <span class="text-xs text-fg-subtle">Noch keine Antwort</span>
                            {/if}
                        </div>

                        <SurveyForm
                            fields={survey.fields}
                            values={subject.values}
                            otherValues={subject.otherValues}
                            fieldErrors={fieldErrors(subject)}
                            editable={data.canRespond}
                        >
                            {#snippet footer()}
                                {#if data.canRespond}
                                    <div class="flex flex-wrap gap-2">
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            icon="send"
                                            loading={pending === `respond:${subject.key}`}
                                        >
                                            {subject.answered && !survey.multiplePerUser
                                                ? "Antwort ändern"
                                                : "Antwort absenden"}
                                        </Button>

                                        {#if subject.answered && !survey.anonymous && !survey.multiplePerUser}
                                            <!--
                                                Zurücknehmen löscht die
                                                abgegebene Antwort und ist
                                                damit zerstörend: erst die
                                                Rückfrage, dann das Formular
                                                darunter.
                                            -->
                                            <Button
                                                variant="ghost"
                                                icon="x-circle"
                                                onclick={() => askWithdraw(subject)}
                                            >
                                                Zurücknehmen
                                            </Button>
                                        {/if}
                                    </div>
                                {/if}
                            {/snippet}
                        </SurveyForm>
                    </form>
                {/each}
            </div>
        {/if}
    </Card>

    <!-- Fragen im Überblick, für die Verwaltung -->
    {#if data.canManage}
        <Card title="Fragen" meta={`${survey.fields.length} Fragen`} padding="md">
            {#snippet actions()}
                <Button
                    href={`/intern/umfragen/${survey.id}/fragen`}
                    variant="secondary"
                    size="sm"
                    icon="pencil"
                >
                    Bearbeiten
                </Button>
            {/snippet}

            {#if data.fieldsLocked}
                <!--
                    Die Liste ist NICHT festgeschrieben, seit `setSurveyFields`
                    Ergänzen und Umbenennen zulässt. Die alte Meldung
                    („Würden Fragen jetzt noch hinzukommen…“) beschrieb einen
                    Zustand, den es nicht mehr gibt, und hielt Leute von einer
                    erlaubten Änderung ab.
                -->
                <Alert
                    tone="info"
                    title="Es liegen bereits Antworten vor"
                    message="Fragen ergänzen und umbenennen ist weiterhin möglich – auch die Optionen einer Auswahl. Gesperrt sind nur das Löschen einer Frage und der Wechsel ihres Typs: sonst stünden in der Auswertung Antworten ohne Feld beziehungsweise Werte, die es in diesem Feld nie geben konnte."
                />
            {/if}

            {#if survey.fields.length === 0}
                <EmptyState
                    inline
                    title="Noch keine Frage angelegt – ohne Frage lässt sich die Umfrage nicht veröffentlichen."
                />
            {:else}
                <ol class="mt-2 space-y-2">
                    {#each survey.fields as field, index (field.id)}
                        <li class="flex items-start gap-3 text-sm">
                            <span class="text-fg-subtle tabular-figures">{index + 1}.</span>
                            <div class="min-w-0">
                                <p class="text-fg font-semibold">
                                    {field.label}
                                    {#if field.required}
                                        <span class="text-danger" aria-hidden="true">*</span>
                                        <span class="sr-only">(Pflichtfeld)</span>
                                    {/if}
                                </p>
                                <p class="text-xs text-fg-subtle">
                                    {fieldTypeName(field.type)}
                                    {#if field.options.length > 0}
                                        – {field.options.map((option) => option.label).join(", ")}
                                    {/if}
                                    {#if field.allowOther}
                                        – mit „Sonstiges“
                                    {/if}
                                </p>
                            </div>
                        </li>
                    {/each}
                </ol>
            {/if}
        </Card>
    {/if}

    <!-- Externe Freigabe -->
    {#if data.canManage}
        <Card
            title="Externer Link"
            subtitle="Antworten ohne Anmeldung – für Eltern, Ehemalige und Gäste."
        >
            {#if survey.audience === "member"}
                <!--
                    Der Dienst weist es ohnehin ab; hier steht der Grund,
                    damit niemand nach einem versteckten Schalter sucht.
                -->
                <Alert
                    tone="info"
                    title="Für diese Umfrage nicht möglich"
                    message="Sie wird je verknüpftem Mitglied beantwortet. Ohne Anmeldung ist aber kein Mitglied bekannt – es gäbe niemanden, dem die Antwort gehörte. Stelle sie unter „Bearbeiten“ auf „Je Zugang“ um, wenn du sie extern freigeben willst."
                />
            {:else}
                <div class="space-y-4">
                    <Alert
                        tone="warning"
                        title="Eine Stimme je Person gibt es hier nicht"
                        message="Über den Link kann dieselbe Person mehrfach antworten – ohne Anmeldung gibt es keine verlässliche Identität, und ein angegebener Name ist Selbstauskunft. Wer genau eine Stimme je Person braucht, gibt die Umfrage intern frei."
                    />

                    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                                Zustand
                            </dt>
                            <dd class="mt-1">
                                {#if survey.publicEnabled && survey.hasPublicLink}
                                    <Badge tone="success" size="xs" label="Link ist gültig" />
                                {:else}
                                    <Badge tone="neutral" size="xs" label="Kein Link vergeben" />
                                {/if}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-xs font-semibold text-fg-subtle uppercase tracking-wide">
                                Gültig bis
                            </dt>
                            <dd class="text-fg mt-1">
                                {survey.publicExpiresAt
                                    ? formatDateTime(survey.publicExpiresAt)
                                    : "Ohne Frist"}
                            </dd>
                        </div>
                    </dl>

                    <form
                        method="post"
                        action={survey.hasPublicLink ? "?/updateLink" : "?/issueLink"}
                        class="space-y-4"
                        use:enhance={track("link")}
                    >
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                label="Nach dem Namen fragen"
                                hint="Bei einer anonymen Umfrage wird der Name in keinem Fall erfasst."
                            >
                                {#snippet children({ id, describedBy })}
                                    <Select
                                        {id}
                                        {describedBy}
                                        name="nameMode"
                                        value={survey.publicNameMode}
                                        options={NAME_MODES}
                                    />
                                {/snippet}
                            </FormField>

                            <FormField
                                label="Läuft ab"
                                hint="Freiwillig – leer heißt: bis zum Widerruf."
                            >
                                {#snippet children({ id, describedBy })}
                                    <TextInput
                                        {id}
                                        {describedBy}
                                        name="publicExpiresAt"
                                        type="datetime-local"
                                        value={forInput(survey.publicExpiresAt)}
                                    />
                                {/snippet}
                            </FormField>
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                            {#if survey.hasPublicLink}
                                <Button
                                    type="submit"
                                    variant="primary"
                                    icon="check-lg"
                                    loading={pending === "link"}
                                >
                                    Einstellungen speichern
                                </Button>
                                <!--
                                    Neu erzeugen tötet den alten Link. Deshalb
                                    ein eigener Knopf mit eigener Aktion und
                                    nicht derselbe wie „Speichern“.
                                -->
                                <Button
                                    type="submit"
                                    formaction="?/issueLink"
                                    variant="secondary"
                                    icon="arrow-repeat"
                                >
                                    Neu erzeugen
                                </Button>
                                <Button
                                    variant="ghost"
                                    icon="x-circle"
                                    onclick={() => (revokeOpen = true)}
                                >
                                    Widerrufen
                                </Button>
                            {:else}
                                <Button
                                    type="submit"
                                    variant="primary"
                                    icon="link-45deg"
                                    loading={pending === "link"}
                                >
                                    Link erzeugen
                                </Button>
                            {/if}
                        </div>
                    </form>

                    {#if survey.hasPublicLink}
                        <p class="text-xs text-fg-subtle">
                            Der Link selbst steht hier nicht mehr: gespeichert ist nur sein
                            Abdruck. Wer ihn verloren hat, erzeugt einen neuen – der alte gilt
                            dann nicht mehr.
                        </p>
                    {/if}
                </div>
            {/if}
        </Card>
    {/if}
</div>

<!-- Kopfdaten bearbeiten -->
{#if data.canManage}
    <Modal bind:open={editOpen} title="Umfrage bearbeiten" size="lg">
        <form method="post" action="?/update" id="umfrage-bearbeiten" class="space-y-4">
            <FormField label="Titel" required>
                {#snippet children({ id, describedBy })}
                    <TextInput {id} {describedBy} name="title" value={survey.title} required />
                {/snippet}
            </FormField>

            <FormField label="Beschreibung">
                {#snippet children({ id, describedBy })}
                    <Textarea
                        {id}
                        {describedBy}
                        name="description"
                        value={survey.description}
                        rows={3}
                    />
                {/snippet}
            </FormField>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#if data.fieldsLocked}
                    <!--
                        Mit vorliegenden Antworten sind „wer antwortet“ und die
                        Anonymität festgeschrieben. Die Werte gehen als
                        versteckte Felder mit -- ein abgeschaltetes Feld würde
                        gar nicht mitgeschickt und der Server läse daraus eine
                        Änderung, die niemand wollte.
                    -->
                    <input type="hidden" name="audience" value={survey.audience} />
                    {#if survey.anonymous}
                        <input type="hidden" name="anonymous" value="on" />
                    {/if}
                    <div class="md:col-span-2">
                        <Alert
                            tone="info"
                            message="„Wer antwortet“ und die Anonymität stehen fest, sobald die erste Antwort vorliegt."
                        />
                    </div>
                {:else}
                    <FormField label="Wer antwortet?">
                        {#snippet children({ id, describedBy })}
                            <Select
                                {id}
                                {describedBy}
                                name="audience"
                                value={survey.audience}
                                options={[
                                    { value: "user", label: "Je Zugang" },
                                    { value: "member", label: "Je verknüpftem Mitglied" }
                                ]}
                            />
                        {/snippet}
                    </FormField>
                {/if}

                <FormField label="Termin">
                    {#snippet children({ id, describedBy })}
                        <Select
                            {id}
                            {describedBy}
                            name="eventId"
                            value={survey.eventId ?? ""}
                            options={eventOptions}
                            placeholder="– kein Termin –"
                        />
                    {/snippet}
                </FormField>

                <FormField label="Geöffnet ab">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="opensAt"
                            type="datetime-local"
                            value={forInput(survey.opensAt)}
                        />
                    {/snippet}
                </FormField>

                <FormField label="Geschlossen ab">
                    {#snippet children({ id, describedBy })}
                        <TextInput
                            {id}
                            {describedBy}
                            name="closesAt"
                            type="datetime-local"
                            value={forInput(survey.closesAt)}
                        />
                    {/snippet}
                </FormField>
            </div>

            <div class="space-y-2">
                {#if !data.fieldsLocked}
                    <label class="flex items-start gap-3 text-sm text-fg">
                        <input
                            type="checkbox"
                            name="anonymous"
                            checked={survey.anonymous}
                            class="mt-1 rounded-control border-border-strong"
                        />
                        <span>
                            Anonym
                            <span class="block text-xs text-fg-subtle">
                                Ohne Absender. Antworten lassen sich danach weder ändern noch
                                zurücknehmen.
                            </span>
                        </span>
                    </label>
                {/if}

                <label class="flex items-start gap-3 text-sm text-fg">
                    <input
                        type="checkbox"
                        name="multiplePerUser"
                        checked={survey.multiplePerUser}
                        class="mt-1 rounded-control border-border-strong"
                    />
                    <span>
                        Mehrfach absenden erlaubt
                        <span class="block text-xs text-fg-subtle">
                            Formular statt Umfrage: dieselbe Person darf beliebig oft absenden.
                        </span>
                    </span>
                </label>
            </div>
        </form>

        {#snippet footer()}
            <Button variant="secondary" onclick={() => (editOpen = false)}>Abbrechen</Button>
            <Button
                variant="primary"
                icon="check-lg"
                onclick={() => document.forms.namedItem("umfrage-bearbeiten")?.requestSubmit()}
            >
                Speichern
            </Button>
        {/snippet}
    </Modal>

    <!-- Freigaben -->
    {#if data.shareOptions}
        <Modal bind:open={shareOpen} title="Freigaben">
            <form method="post" action="?/setShares" class="space-y-4" id="umfrage-freigaben">
                <p class="text-sm text-fg-muted">
                    Ohne Auswahl ist die Umfrage für alle im Stamm sichtbar.
                </p>

                {#each [{ kind: "group", label: "Gruppen", entries: data.shareOptions.groups }, { kind: "position", label: "Ämter", entries: data.shareOptions.positions }, { kind: "role", label: "Rollen", entries: data.shareOptions.roles }, { kind: "user", label: "Einzelne Personen", entries: data.shareOptions.users }] as block (block.kind)}
                    {#if block.entries.length > 0}
                        <fieldset class="space-y-1.5">
                            <legend
                                class="text-xs font-semibold text-fg-subtle uppercase tracking-wide"
                            >
                                {block.label}
                            </legend>
                            <div class="flex flex-wrap gap-2">
                                {#each block.entries as option (option.id)}
                                    <label
                                        class="flex items-center gap-2 text-xs text-fg px-2.5 py-1.5 rounded-control border border-border cursor-pointer hover:bg-surface-muted transition"
                                    >
                                        <input
                                            type="checkbox"
                                            name="share"
                                            value={`${block.kind}:${option.id}`}
                                            checked={sharedIds.has(option.id)}
                                            class="rounded-control border-border-strong"
                                        />
                                        {option.name}
                                    </label>
                                {/each}
                            </div>
                        </fieldset>
                    {/if}
                {/each}
            </form>

            {#snippet footer()}
                <Button variant="secondary" onclick={() => (shareOpen = false)}>Abbrechen</Button>
                <Button
                    variant="primary"
                    icon="check-lg"
                    onclick={() => document.forms.namedItem("umfrage-freigaben")?.requestSubmit()}
                >
                    Speichern
                </Button>
            {/snippet}
        </Modal>
    {/if}

    <ConfirmDialog
        bind:open={closeOpen}
        title="Umfrage schließen"
        message={`„${survey.title}“ nimmt danach keine Antworten mehr an. Die Ergebnisse bleiben sichtbar.`}
        confirmLabel="Schließen"
        tone="primary"
        onconfirm={() => closeForm?.requestSubmit()}
    />

    <ConfirmDialog
        bind:open={deleteOpen}
        title="Umfrage löschen"
        message={`„${survey.title}“ wird mit allen ${survey.responseCount} Antworten dauerhaft entfernt. Für eine bereits laufende Umfrage ist „Schließen“ die bessere Wahl.`}
        confirmLabel="Endgültig löschen"
        onconfirm={() => deleteForm?.requestSubmit()}
    />

    <ConfirmDialog
        bind:open={revokeOpen}
        title="Externen Link widerrufen"
        message="Der Link gilt sofort nicht mehr; wer ihn hat, sieht nur noch einen Hinweis. Bereits abgegebene Antworten bleiben erhalten. Ein neuer Link lässt sich jederzeit erzeugen – der alte wird dadurch nicht wieder gültig."
        confirmLabel="Widerrufen"
        onconfirm={() => revokeForm?.requestSubmit()}
    />

    <form method="post" action="?/close" bind:this={closeForm} class="hidden"></form>
    <form method="post" action="?/delete" bind:this={deleteForm} class="hidden"></form>
    <form method="post" action="?/revokeLink" bind:this={revokeForm} class="hidden"></form>
{/if}

<ConfirmDialog
    bind:open={withdrawOpen}
    title="Antwort zurücknehmen"
    message={withdrawTarget
        ? `Die abgegebene Antwort${withdrawTarget.name ? ` von ${withdrawTarget.name}` : ""} wird gelöscht. Solange die Umfrage geöffnet ist, kannst du danach neu antworten.`
        : ""}
    confirmLabel="Zurücknehmen"
    onconfirm={() => withdrawForm?.requestSubmit()}
    oncancel={() => (withdrawTarget = null)}
/>

<form method="post" action="?/withdraw" bind:this={withdrawForm} class="hidden">
    <input type="hidden" name="memberId" value={withdrawTarget?.memberId ?? ""} />
</form>
