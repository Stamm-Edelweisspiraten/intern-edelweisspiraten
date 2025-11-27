<script>
    function login() {
        window.location.href = "/login/start";
    }
</script>

<div class="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-6">

    <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-200">

        <h1 class="text-3xl font-bold text-gray-800 text-center mb-2">
            Willkommen
        </h1>

        <p class="text-gray-500 text-center mb-8">
            Bitte melde dich mit Authentik an, um fortzufahren.
        </p>

        <button
                on:click={login}
                class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
            <svg xmlns="http://www.w3.org/2000/svg"
                 fill="none" viewBox="0 0 24 24" stroke-width="2"
                 stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 9l3 3m0 0l-3 3m3-3H3" />
            </svg>
            Mit Authentik einloggen
        </button>
    </div>
</div>
