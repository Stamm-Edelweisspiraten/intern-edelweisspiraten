<svelte:head>
    <title>Stamm Edelweißpiraten – Intern</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-100 px-6 py-16">
    <div class="max-w-4xl w-full grid lg:grid-cols-2 gap-8 items-center bg-white/90 backdrop-blur rounded-3xl shadow-2xl border border-gray-200 p-10">
        <div class="space-y-4">
            <p class="text-xs uppercase tracking-[0.3em] text-blue-500 font-semibold">Stamm Edelweißpiraten</p>
            <h1 class="text-4xl font-extrabold text-gray-900 leading-tight">Internes Portal</h1>
            <p class="text-gray-600">
                Zugriff nur für eingeloggte Mitglieder. Bitte melde dich an, um zur internen Plattform zu gelangen.
            </p>
            <div class="space-y-2 text-sm text-gray-600">
                <div class="flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full bg-green-500"></span>
                    <span>Rechteverwaltung, Gruppen, Mitglieder, Dateien</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full bg-blue-500"></span>
                    <span>Zugriff nur mit gültigem Login</span>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row gap-3 pt-2">
                <a href="/login" class="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 text-center">Jetzt einloggen</a>
                <a href="https://edelweisspiraten-bremen.de" target="_blank" rel="noreferrer" class="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">Zur Website</a>
            </div>
        </div>
        <div class="hidden lg:block">
            <div class="relative">
                <div class="absolute -inset-6 bg-gradient-to-r from-blue-100 to-blue-50 rounded-3xl blur-2xl opacity-60"></div>
                <div class="relative bg-white border border-gray-200 rounded-2xl shadow-lg p-6 space-y-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-500">Letzte Anmeldung</p>
                            <p class="text-lg font-semibold text-gray-900">Sicher und verschlüsselt</p>
                        </div>
                        <div class="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-semibold">
                            🔒
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-sm text-gray-700">
                        <div class="p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <p class="text-xs uppercase text-gray-500">Rollen</p>
                            <p class="font-semibold">Admins & Leiter</p>
                        </div>
                        <div class="p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <p class="text-xs uppercase text-gray-500">Module</p>
                            <p class="font-semibold">Mitglieder, Gruppen, Dateien</p>
                        </div>
                        <div class="p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <p class="text-xs uppercase text-gray-500">Kontakt</p>
                            <p class="font-semibold">it@edelweisspiraten-bremen.de</p>
                        </div>
                        <div class="p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <p class="text-xs uppercase text-gray-500">Status</p>
                            <p class="font-semibold text-green-600">Online</p>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500">
                        Bei Fragen oder Problemen wende dich an das IT-Team. Zugriff nur mit gültigen Zugangsdaten.
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
