<script lang="ts">
    export let data;
    export const csr = false;
    import { onDestroy, onMount } from "svelte";

    let subject = "";
    let bodyHtml = "";
    let replyTo = data.replyToDefault ?? "";
    let sending = false;
    let successMsg = "";
    let errorMsg = "";
    let editorReady = false;
    let selectedFiles: { file: File; url: string }[] = [];
    const editorId = "group-mail-editor";
    let quillInstance: any = null;

    const recipients = data.members
        .flatMap((m: any) => m.emails ?? [])
        .map((e: any) => e.email)
        .filter(Boolean);

    const loadQuillAssets = async () => {
        if (typeof window === "undefined") return;

        if (!document.getElementById("quill-css")) {
            const link = document.createElement("link");
            link.id = "quill-css";
            link.rel = "stylesheet";
            link.href = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css";
            document.head.appendChild(link);
        }

        if ((window as any).Quill) return;

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Quill konnte nicht geladen werden"));
            document.head.appendChild(script);
        }).catch(() => {});
    };

    const initEditor = async () => {
        if (typeof window === "undefined") return;
        await loadQuillAssets();
        const Quill = (window as any).Quill;
        if (!Quill) return;

        quillInstance = new Quill(`#${editorId}`, {
            theme: "snow",
            placeholder: "Schreibe hier deine E-Mail ...",
            modules: {
                toolbar: [
                    ["bold", "italic", "underline"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link"]
                ]
            }
        });

        if (bodyHtml) {
            quillInstance.root.innerHTML = bodyHtml;
        }

        quillInstance.on("text-change", () => {
            bodyHtml = quillInstance.root.innerHTML;
        });

        editorReady = true;
    };

    onMount(() => {
        initEditor();
    });

    onDestroy(() => {
        if (quillInstance) {
            quillInstance.off("text-change");
            quillInstance = null;
        }
        selectedFiles.forEach(({ url }) => URL.revokeObjectURL(url));
    });

    const submit = async (event: SubmitEvent) => {
        event.preventDefault();
        sending = true;
        successMsg = "";
        errorMsg = "";
        try {
            const currentHtml = quillInstance?.root?.innerHTML ?? bodyHtml;

            const form = new FormData();
            form.set("subject", subject);
            form.set("bodyHtml", currentHtml);
            form.set("replyTo", replyTo);
            if (data.group?.id) form.set("groupId", data.group.id);
            if (data.mode === "members") {
                const ids = data.members.map((m: any) => m.id).join(",");
                form.set("memberIds", ids);
            }
            selectedFiles.forEach(({ file }) => form.append("attachments", file));

            const res = await fetch("?/sendMail", {
                method: "POST",
                body: form
            });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || "Versand fehlgeschlagen");
            }
            successMsg = `Mail an ${json.sent} Empfänger gesendet.`;
            subject = "";
            bodyHtml = "";
            selectedFiles.forEach(({ url }) => URL.revokeObjectURL(url));
            selectedFiles = [];
            if (quillInstance) quillInstance.setText("");
        } catch (err: any) {
            errorMsg = err.message ?? "Unbekannter Fehler";
        } finally {
            sending = false;
        }
    };
</script>

<div class="max-w-6xl mx-auto mt-12 space-y-8">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">E-Mail</p>
            <div class="flex items-center gap-3 flex-wrap">
                <h1 class="text-3xl font-bold text-gray-900">
                    {data.mode === "group" ? data.group.name : "Ausgewählte Mitglieder"}
                </h1>
                <span class="px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    {data.mode === "group" ? "Gruppe" : "Custom Auswahl"}
                </span>
            </div>
            <p class="text-gray-600 max-w-3xl">
                {data.mode === "group"
                    ? `${data.group.description || "Keine Beschreibung"} • Treffen: ${data.group.meeting_time || "k.A."}`
                    : "Versende eine Nachricht an die ausgewählten Mitglieder."}
            </p>
            <div class="flex flex-wrap gap-2">
                <a
                        href="/intern/members"
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
                >
                    <span class="bi bi-arrow-left"></span>
                    Zurück
                </a>
                {#if data.mode === "group"}
                    <a
                            href={`/intern/groups/${data.group.id}`}
                            class="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition"
                    >
                        <span class="bi bi-people"></span>
                        Gruppe öffnen
                    </a>
                {/if}
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3 w-full md:w-[320px]">
            <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                <p class="text-xs text-gray-500">Mitglieder</p>
                <p class="text-2xl font-bold text-gray-900">{data.members.length}</p>
            </div>
            <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                <p class="text-xs text-gray-500">E-Mail Empfänger</p>
                <p class="text-2xl font-bold text-gray-900">{recipients.length}</p>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 class="text-xl font-semibold text-gray-900">Empfänger</h2>
            <div class="flex flex-wrap gap-2">
                <span class="px-3 py-1 text-xs rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                    {data.members.length} Personen
                </span>
                <span class="px-3 py-1 text-xs rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                    {recipients.length} E-Mail-Adressen
                </span>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {#each data.members as m}
                <div class="border border-gray-200 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div class="space-y-1">
                        <div class="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <span class="bi bi-person-circle text-gray-500"></span>
                            {m.firstname} {m.lastname}
                        </div>
                        <div class="flex flex-wrap gap-2 text-xs text-gray-700">
                            {#if m.emails?.length}
                                {#each m.emails as e}
                                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-blue-100 bg-blue-50 text-blue-700">
                                        <span class="bi bi-envelope"></span>{e.email}
                                    </span>
                                {/each}
                            {:else}
                                <span class="text-gray-400">Keine E-Mail hinterlegt</span>
                            {/if}
                        </div>
                    </div>
                    <a href={`/intern/members/${m.id}`} class="text-blue-600 text-xs font-semibold hover:underline whitespace-nowrap mt-1">Details</a>
                </div>
            {/each}
            {#if data.members.length === 0}
                <div class="p-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded-xl">Keine Mitglieder in dieser Auswahl.</div>
            {/if}
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
                <h2 class="text-xl font-semibold text-gray-900">E-Mail verfassen</h2>
                <p class="text-sm text-gray-600">Definiere Betreff, Absender und Nachricht. Anhänge sind möglich.</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="px-3 py-1 text-xs rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                    HTML-Editor (Quill)
                </span>
            </div>
        </div>
        <form class="space-y-4" on:submit|preventDefault={submit}>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="block text-sm font-medium text-gray-700">Betreff</label>
                    <input
                            class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            bind:value={subject}
                            placeholder="Betreff"
                            required
                    />
                </div>
                <div class="space-y-1">
                    <label class="block text-sm font-medium text-gray-700">Absender / Reply-To</label>
                    <select
                            class="w-full px-4 py-3 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            bind:value={replyTo}
                            required
                    >
                        {#each data.replyToOptions as opt}
                            <option value={opt.email}>{opt.label} ({opt.email})</option>
                        {/each}
                        {#if !data.replyToOptions?.length}
                            <option value={replyTo}>Keine Auswahl verfügbar</option>
                        {/if}
                    </select>
                    <p class="text-xs text-gray-500">Die Mail wird mit dieser Adresse als Absender/Reply-To verschickt.</p>
                </div>
            </div>

            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700">Nachricht</label>
                <div class="border rounded-xl">
                    <div id={editorId} class="min-h-[240px] px-3"></div>
                </div>
                {#if !editorReady}
                    <p class="text-xs text-gray-400">Editor wird geladen ...</p>
                {/if}
            </div>

            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700">Anhänge</label>
                <input
                        type="file"
                        multiple
                        name="attachments"
                        class="w-full text-sm text-gray-700"
                        on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            if (selectedFiles.length > 0) {
                                selectedFiles.forEach(({ url }) => URL.revokeObjectURL(url));
                            }
                            selectedFiles = target.files
                                ? Array.from(target.files).map((file) => ({
                                    file,
                                    url: URL.createObjectURL(file)
                                }))
                                : [];
                        }}
                />
                {#if selectedFiles.length > 0}
                    <ul class="mt-2 space-y-2 text-sm text-gray-700">
                        {#each selectedFiles as item, i}
                            <li class="flex items-center gap-3">
                                <span class="flex-1 truncate">{item.file.name}</span>
                                <a class="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={item.url}>Ansehen</a>
                                <button
                                        type="button"
                                        class="text-red-600 text-sm hover:underline"
                                        on:click={() => {
                                            const copy = [...selectedFiles];
                                            const removed = copy.splice(i, 1);
                                            removed.forEach(({ url }) => URL.revokeObjectURL(url));
                                            selectedFiles = copy;
                                        }}
                                >
                                    Entfernen
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="flex flex-wrap items-center gap-3">
                <button
                        class="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-60"
                        type="submit"
                        disabled={sending}
                >
                    {sending ? "Senden..." : "E-Mail senden"}
                </button>
                <a
                        href="/intern/members"
                        class="inline-flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-semibold text-gray-800 shadow-sm transition"
                >
                    <span class="bi bi-arrow-left"></span>
                    Zurück
                </a>
                {#if successMsg}
                    <span class="text-green-600 text-sm">{successMsg}</span>
                {/if}
                {#if errorMsg}
                    <span class="text-red-600 text-sm">{errorMsg}</span>
                {/if}
            </div>
        </form>
    </div>
</div>

<style>
    .ql-editor {
        min-height: 200px;
    }
</style>
