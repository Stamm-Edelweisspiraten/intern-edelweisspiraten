import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Eigene Konfiguration ohne das SvelteKit-Plugin: die Unit-Tests decken
// reine Logikmodule ab und brauchen weder Preprocessing noch einen Dev-Server.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
