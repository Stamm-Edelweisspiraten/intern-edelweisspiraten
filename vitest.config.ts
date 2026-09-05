import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// Eigene Konfiguration ohne das SvelteKit-Plugin: die Unit-Tests decken reine
// Logikmodule ab und brauchen weder Preprocessing noch einen Dev-Server.
// Die SvelteKit-eigenen Module werden durch schlanke Attrappen ersetzt.
export default defineConfig({
	resolve: {
		alias: {
			'$env/dynamic/private': resolvePath('./src/lib/test/envMock.ts'),
			'$app/environment': resolvePath('./src/lib/test/appEnvironmentMock.ts'),
			$lib: resolvePath('./src/lib')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
