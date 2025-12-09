<script lang="ts">
    export let data;
    export let form;

    let accountType: "child" | "parent" = "child";
    let password = "";
    let password2 = "";

    $: passwordMismatch = password && password2 && password !== password2;
</script>

<div class="max-w-md mx-auto mt-20 p-8 bg-white rounded-xl shadow border">
    <h1 class="text-3xl font-bold mb-6 text-center">
        Benutzerkonto erstellen
    </h1>

    <p class="text-gray-600 mb-4 text-center">
        Für Mitglied: <strong>{data.member.firstname} {data.member.lastname}</strong>
    </p>

    <!-- ACCOUNT TABS -->
    <div class="flex mb-6">
        <button
                type="button"
                class="flex-1 py-2 border-b-2"
                class:border-b-blue-600={accountType === "child"}
                on:click={() => accountType = "child"}
        >
            👦 Kind
        </button>

        <button
                type="button"
                class="flex-1 py-2 border-b-2"
                class:border-b-blue-600={accountType === "parent"}
                on:click={() => accountType = "parent"}
        >
            👨‍👩‍👧 Eltern
        </button>
    </div>

    <form method="post" class="space-y-6">

        <input type="hidden" name="accountType" value={accountType} />

        <!-- Name -->
        <div>
            <label class="block mb-1 text-sm font-medium text-gray-600">Name</label>
            <input name="name" required class="w-full px-4 py-3 border rounded-lg bg-gray-50"/>
        </div>

        <!-- E-Mail -->
        <div>
            <label class="block mb-1 text-sm font-medium text-gray-600">E-Mail</label>
            <input name="email" type="email" required class="w-full px-4 py-3 border rounded-lg bg-gray-50"/>
        </div>

        <!-- Passwort -->
        <div>
            <label class="block mb-1 text-sm font-medium text-gray-600">Passwort</label>
            <input
                    name="password"
                    type="password"
                    required
                    minlength="6"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50"
                    bind:value={password}
            />
        </div>

        <!-- Passwort Wiederholung -->
        <div>
            <label class="block mb-1 text-sm font-medium text-gray-600">Passwort wiederholen</label>
            <input
                    name="password2"
                    type="password"
                    required
                    minlength="6"
                    class="w-full px-4 py-3 border rounded-lg bg-gray-50"
                    bind:value={password2}
            />
            {#if passwordMismatch}
                <p class="text-red-600 text-sm mt-1">Passwörter stimmen nicht überein.</p>
            {/if}
        </div>

        {#if form?.error}
            <p class="text-red-600 text-center">{form.error}</p>
        {/if}

        <button class="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                disabled={passwordMismatch}>
            Konto erstellen
        </button>
    </form>

    <!-- Login mit bestehendem Konto -->
    <div class="mt-8 text-center">
        <p class="text-gray-600 mb-2">Du hast bereits ein Konto?</p>

        <a
                href={`/login?join=${data.member.id}`}
                class="inline-block px-6 py-3 bg-gray-200 hover:bg-gray-300
           text-gray-900 rounded-lg transition font-medium"
        >
            🔐 Mit bestehendem Konto anmelden & verknüpfen
        </a>
    </div>
</div>
