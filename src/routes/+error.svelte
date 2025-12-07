<script>
    export let error;
    export let status;

    const code = Number(status ?? error?.status ?? error?.statusCode ?? error?.body?.status) || 500;
    const msg = error?.message || error?.body?.message || "Unbekannter Fehler";

    const isAccess = code === 401 || code === 403;
    const icon = isAccess ? "🔒" : "⚠️";
    const title = isAccess ? "Kein Zugriff auf diesen Bereich" : "Unerwarteter Fehler";
    const message = msg;

    const hints = isAccess
        ? [
            "Du hast nicht die nötigen Rechte.",
            "Wenn du Zugriff brauchst, wende dich an einen Admin."
        ]
        : [
            "Bitte versuche es erneut oder kontaktiere den Support.",
            "Falls das Problem bleibt, melde es mit dem Status-Code."
        ];
</script>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4">
    <div class="max-w-xl w-full bg-white shadow-lg border border-gray-200 rounded-2xl p-8 text-center space-y-4">
        <div class="text-6xl">{icon}</div>
        <div class="text-sm font-semibold tracking-wide text-gray-500 uppercase">Fehler {code}</div>
        <h1 class="text-3xl font-bold text-gray-900">{title}</h1>
        <p class="text-gray-700">{message}</p>

        <ul class="text-sm text-gray-500 space-y-1 pt-2">
            {#each hints as h}
                <li>• {h}</li>
            {/each}
        </ul>

        <div class="flex gap-3 justify-center pt-5">
            <a class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100" href="/">Startseite</a>
            <a class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700" href="/intern/dashboard">Zum Dashboard</a>
        </div>
    </div>
</div>
