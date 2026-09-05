import type { Theme } from "$lib/theme";

/**
 * Die vorherige Deklaration war veraltet: sie versprach access_token,
 * id_token, refresh_token, expires_in und token_type, die nirgends gesetzt
 * wurden, und kannte weder sub noch memberId/memberIds noch impersonator --
 * obwohl hooks.server.ts genau diese Felder befuellt.
 */
declare global {
	namespace App {
		interface SessionUser {
			userinfo: {
				email: string;
				name?: string;
				groups: string[];
			};
			sub?: string;
			memberId?: string;
			memberIds: string[];
		}

		interface Impersonator {
			email: string;
			name?: string;
			groups?: string[];
			sub?: string;
			memberId?: string;
		}

		interface Locals {
			user: SessionUser | null;
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
