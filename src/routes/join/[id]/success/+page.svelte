<script lang="ts">
    export let data;
</script>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-6">

    <div class="bg-white p-10 rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full text-center">

        <div class="flex justify-center mb-6">
            <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg"
                     class="h-12 w-12 text-green-600"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor"
                     stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M5 13l4 4L19 7" />
                </svg>
            </div>
        </div>

        <h1 class="text-3xl font-bold text-gray-800 mb-4">
            Verknüpfung erfolgreich!
        </h1>

        <p class="text-gray-600 text-lg mb-6">
            Dein Benutzerkonto wurde erfolgreich mit dem Mitglied <br/>
            <strong>{data.member.firstname} {data.member.lastname}</strong> verknüpft.
        </p>

        <a href="/intern/dashboard"
           class="w-full inline-block py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow transition">
            Weiter zum Dashboard
        </a>

        <div class="mt-8 text-sm text-gray-500">
            Falls du mehrere Kinder hast, kannst du weitere Einladungslinks verwenden,
            um auch diese zu verknüpfen.
        </div>
    </div>
</div>
