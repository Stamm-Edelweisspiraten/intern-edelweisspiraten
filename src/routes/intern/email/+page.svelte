<script lang="ts">
    export let data;
    import { onDestroy, onMount } from "svelte";

    let subject = "";
    let bodyHtml = "";
    let replyTo = data.group.replyTo ?? "";
    let sending = false;
    let successMsg = "";
    let errorMsg = "";
    let editorReady = false;
    let selectedFiles: File[] = [];
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
            form.set("groupId", data.group.id);
            selectedFiles.forEach((file) => form.append("attachments", file));

            const res = await fetch("?/sendMail", {
                method: "POST",
                body: form
            });
            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error || "Versand fehlgeschlagen");
            }
            successMsg = `Mail an ${json.sent} Empfaenger gesendet.`;
            subject = "";
            bodyHtml = "";
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
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
            <p class="text-sm text-gray-500">E-Mail</p>
            <h1 class="text-3xl font-bold text-gray-900 mt-1">{data.group.name}</h1>
            <p class="text-gray-600 mt-2">
                {data.group.description || "Keine Beschreibung"} · Treffen: {data.group.meeting_time || "k.A."}
            </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm w-full sm:w-72">
            <div class="flex justify-between text-sm text-gray-600">
                <span>Mitglieder</span>
                <span class="font-semibold text-gray-900">{data.members.length}</span>
            </div>
            <div class="flex justify-between text-sm text-gray-600 mt-2">
                <span>E-Mail Empfaenger</span>
                <span class="font-semibold text-gray-900">{recipients.length}</span>
            </div>
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900">Empfaenger</h2>
            <a href={`/intern/groups/${data.group.id}`} class="text-sm text-blue-600 hover:underline">Zur Gruppe</a>
        </div>
        <div class="divide-y divide-gray-200">
            {#each data.members as m}
                <div class="py-3 flex justify-between items-center">
                    <div>
                        <div class="font-medium text-gray-900">{m.firstname} {m.lastname}</div>
                        <div class="text-sm text-gray-600">{m.emails?.map((e) => e.email).join(", ") || "-"}</div>
                    </div>
                    <a href={`/intern/members/${m.id}`} class="text-blue-600 text-sm hover:underline">Details</a>
                </div>
            {/each}
            {#if data.members.length === 0}
                <div class="py-4 text-gray-500 text-sm">Keine Mitglieder in dieser Gruppe.</div>
            {/if}
        </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h2 class="text-xl font-semibold text-gray-900">E-Mail an Gruppenmitglieder</h2>
        <form class="space-y-3" on:submit|preventDefault={submit}>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Betreff</label>
                <input
                        class="w-full px-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        bind:value={subject}
                        placeholder="Betreff"
                        required
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Reply-To</label>
                <input
                        class="w-full px-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        bind:value={replyTo}
                        placeholder="Antwort-Adresse"
                        type="email"
                        required
                />
            </div>
            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700">Nachricht</label>
                <div class="border rounded-lg">
                    <div id={editorId} class="min-h-[220px]"></div>
                </div>
                {#if !editorReady}
                    <p class="text-xs text-gray-400">Editor wird geladen ...</p>
                {/if}
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Anhaenge</label>
                <input
                        type="file"
                        multiple
                        name="attachments"
                        class="w-full text-sm text-gray-700"
                        on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            selectedFiles = target.files ? Array.from(target.files) : [];
                        }}
                />
                {#if selectedFiles.length > 0}
                    <p class="text-xs text-gray-600 mt-1">
                        {selectedFiles.length} Datei{selectedFiles.length === 1 ? "" : "en"} ausgewaehlt:
                        {selectedFiles.map((f) => f.name).join(", ")}
                    </p>
                {/if}
            </div>
            <div class="flex items-center gap-3">
                <button
                        class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
                        type="submit"
                        disabled={sending}
                >
                    {sending ? "Senden..." : "E-Mail senden"}
                </button>
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
