<script lang="ts">
    export let data;

    type Dues = {
        stamm: number;
        gau: number;
        landesmark: number;
        bund: number;
    };

    type FormState = {
        year: number;
        dues: Dues;
    };

    let form: FormState = {
        year: data.currentYear ?? new Date().getFullYear(),
        dues: { ...(data.defaultDues ?? { stamm: 0, gau: 0, landesmark: 0, bund: 0 }) }
    };

    const euro = (value: number) => `${value.toFixed(2)} EUR`;
</script>

<div class="max-w-3xl mx-auto mt-16">
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Neues Geschaeftsjahr</h1>
            <p class="text-gray-600 mt-1">Lege Beitragshoehen fest.</p>
        </div>
        <a href="/intern/finance/fiscal-years" class="text-blue-600 font-semibold hover:text-blue-700 text-sm">
            Zurueck zur Uebersicht
        </a>
    </div>

    <form class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6" method="post" action="?/create">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">Jahr</label>
                <input
                        name="year"
                        type="number"
                        min="2000"
                        class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        bind:value={form.year}
                />
                <p class="text-xs text-gray-500 mt-1">Geschaeftsjahr (Kalenderjahr).</p>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
                <h2 class="text-lg font-semibold text-gray-900">Jahresbeitrag</h2>
                <div class="space-y-3">
                    <label class="flex items-center justify-between text-sm text-gray-700">
                        <span>Stamm</span>
                        <input name="dues_stamm" type="number" step="0.01" min="0" class="w-32 border border-gray-300 rounded-lg px-3 py-2"
                               bind:value={form.dues.stamm} />
                    </label>
                    <label class="flex items-center justify-between text-sm text-gray-700">
                        <span>Gau</span>
                        <input name="dues_gau" type="number" step="0.01" min="0" class="w-32 border border-gray-300 rounded-lg px-3 py-2"
                               bind:value={form.dues.gau} />
                    </label>
                    <label class="flex items-center justify-between text-sm text-gray-700">
                        <span>Landesmark</span>
                        <input name="dues_landesmark" type="number" step="0.01" min="0" class="w-32 border border-gray-300 rounded-lg px-3 py-2"
                               bind:value={form.dues.landesmark} />
                    </label>
                    <label class="flex items-center justify-between text-sm text-gray-700">
                        <span>Bund</span>
                        <input name="dues_bund" type="number" step="0.01" min="0" class="w-32 border border-gray-300 rounded-lg px-3 py-2"
                               bind:value={form.dues.bund} />
                    </label>
                </div>
                <p class="text-xs text-gray-500">Aktueller Gesamtbetrag: {euro(form.dues.stamm + form.dues.gau + form.dues.landesmark + form.dues.bund)}</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button
                    type="submit"
                    class="inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
            >
                Speichern
            </button>
            <a href="/intern/finance/fiscal-years" class="text-gray-600 hover:text-gray-800 text-sm font-semibold">
                Abbrechen
            </a>
        </div>
    </form>
</div>
