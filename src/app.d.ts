import type { Theme } from "$lib/theme";

/**
 * Die vorherige Deklaration war veraltet: sie versprach access_token,
 * id_token und refresh_token, die nirgends gesetzt wurden, und kannte weder
 * memberIds noch impersonator, obwohl hooks.server.ts genau diese Felder
 * befuellt hat.
 */
declare global {
	namespace App {
		interface SessionUser {
			id: string;
			email: string;
			name: string;
			type: "parent" | "child";
			/** Schluessel der zugewiesenen Rollen. */
			roleKeys: string[];
			memberIds: string[];
			mfaEnabled: boolean;
			/** true, wenn eine der Rollen Zwei-Faktor verlangt. */
			requireMfa: boolean;

			/**
			 * Beibehalten fuer bestehende Aufrufer. `sub` entspricht der
			 * Benutzerkennung, `userinfo.groups` den Rollenschluesseln.
			 */
			sub: string;
			userinfo: {
				email: string;
				name: string;
				groups: string[];
			};
		}

		interface SessionInfo {
			id: string;
			mfaSatisfied: boolean;
			expiresAt: Date;
		}

		interface Impersonator {
			id: string;
			name: string;
			email: string;
		}

		interface Locals {
			user: SessionUser | null;
			session: SessionInfo | null;
			impersonator: Impersonator | null;
			permissions: string[];
			theme: Theme;
		}

		interface PageData {
			user?: SessionUser | null;
			permissions?: string[];
		}
	}
}

export {};
