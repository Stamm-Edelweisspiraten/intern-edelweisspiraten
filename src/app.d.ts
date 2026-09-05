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

		/** Gesetzt, wenn der Zugriff ueber die REST-API mit einem Token kommt. */
		interface ApiTokenInfo {
			id: string;
			name: string;
			scopes: string[];
		}

		/**
		 * Ein Recht, gueltig stammesweit (groupId === null) oder fuer genau
		 * eine Gruppe. Siehe $lib/server/permissionService.
		 */
		interface Grant {
			permission: string;
			groupId: string | null;
		}

		interface Locals {
			user: SessionUser | null;
			session: SessionInfo | null;
			impersonator: Impersonator | null;
			apiToken: ApiTokenInfo | null;
			/**
			 * Die STAMMESWEITEN Rechte, flach. Navigation, can() in den
			 * Seiten und die Scopes der REST-API arbeiten damit.
			 */
			permissions: string[];
			/**
			 * Alle Rechte samt Gruppenbezug. Grundlage von
			 * requirePermissionForGroup() und groupsWithPermission().
			 */
			grants: Grant[];
			theme: Theme;
		}

		interface PageData {
			user?: SessionUser | null;
			permissions?: string[];
		}
	}
}

export {};
