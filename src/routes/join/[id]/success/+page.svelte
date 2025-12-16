<script lang="ts">
    export let data;
    export const csr = false;
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex items-center justify-center px-4 py-10">
    <div class="bg-white/90 backdrop-blur-sm p-10 rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full text-center space-y-5">
        <div class="flex justify-center">
            <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <span class="bi bi-check2-circle text-4xl text-green-600"></span>
            </div>
        </div>

        <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Erfolgreich verknüpft</p>
            <h1 class="text-3xl font-bold text-gray-900">
                Willkommen!
            </h1>
            <p class="text-gray-600 text-lg">
                Dein Benutzerkonto wurde mit<br />
                <strong>{data.member.firstname} {data.member.lastname}</strong> verbunden.
            </p>
        </div>

        <a href="/intern/dashboard"
           class="w-full inline-flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow transition font-semibold">
            <span class="bi bi-arrow-right-circle"></span>
            Weiter zum Dashboard
        </a>

        <div class="text-sm text-gray-500 leading-relaxed">
            Mehrere Einladungen? Du kannst weitere Links nutzen, um mehrere Kinder zu verknüpfen.
        </div>
    </div>
</div>
