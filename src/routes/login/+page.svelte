<script>
    function login() {
        window.location.href = "/login/start";
    }
</script>

<div class="min-h-screen w-full flex flex-col bg-gradient-to-br from-sky-50 via-white to-blue-100">
    <div class="flex-1 flex items-center justify-center p-6">
        <div class="w-full max-w-xl bg-white/90 backdrop-blur rounded-3xl shadow-2xl p-10 border border-gray-200">
            <div class="flex items-center justify-between gap-4 mb-6">
                <div>
                    <p class="text-xs uppercase tracking-[0.3em] text-blue-500 font-semibold mb-2">Intern</p>
                    <h1 class="text-4xl font-extrabold text-gray-900">Willkommen zurück</h1>
                    <p class="text-gray-500 mt-2">Melde dich an, um ins interne Portal zu wechseln.</p>
                </div>
                <div class="hidden sm:flex h-14 w-14 rounded-full bg-blue-50 border border-blue-100 items-center justify-center shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-blue-500">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75A2.25 2.25 0 0014.25 4.5h-6A2.25 2.25 0 006 6.75v10.5A2.25 2.25 0 008.25 19.5h6a2.25 2.25 0 002.25-2.25V13.5" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9l3 3-3 3m3-3H6" />
                    </svg>
                </div>
            </div>

            <div class="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-[1px] shadow-lg">
                <div class="bg-white rounded-2xl p-6 flex flex-col gap-4">
                    <div class="flex items-start gap-3">
                        <div class="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-semibold">
                            1
                        </div>
                        <div>
                            <p class="text-sm text-gray-700">Klick auf „Einloggen“.</p>
                            <p class="text-xs text-gray-500">Du wirst zur Anmeldung weitergeleitet.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-semibold">
                            2
                        </div>
                        <div>
                            <p class="text-sm text-gray-700">Mit deinen Zugangsdaten anmelden.</p>
                            <p class="text-xs text-gray-500">Login wie gewohnt.</p>
                        </div>
                    </div>

                    <button
                        on:click={login}
                        class="mt-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg"
                             fill="none" viewBox="0 0 24 24" stroke-width="2"
                             stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
                            <path stroke-linecap="round" stroke-linejoin="round"
                                  d="M12 9l3 3m0 0l-3 3m3-3H3" />
                        </svg>
                        Jetzt einloggen
                    </button>
                </div>
            </div>

            <p class="text-xs text-gray-500 mt-6 text-center">
                Brauchst du Hilfe? Melde dich beim IT-Team unter <a class="text-blue-600 hover:text-blue-700" href="mailto:it@edelweisspiraten-bremen.de">it@edelweisspiraten-bremen.de</a>.
            </p>
        </div>
    </div>

    <footer class="border-t border-gray-200 bg-white/80 backdrop-blur py-4 px-6 text-sm text-gray-600 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-gray-700">
            <span class="font-semibold text-blue-600">Stamm Edelweißpiraten</span>
            <span class="text-gray-400">•</span>
            <span>Interner Bereich</span>
        </div>
        <div class="flex items-center gap-4">
            <a href="https://edelweisspiraten-bremen.de/impressum" target="_blank" rel="noreferrer" class="text-blue-600 hover:text-blue-700">Impressum</a>
            <a href="https://edelweisspiraten-bremen.de/datenschutz" target="_blank" rel="noreferrer" class="text-blue-600 hover:text-blue-700">Datenschutzerklärung</a>
        </div>
    </footer>
</div>
