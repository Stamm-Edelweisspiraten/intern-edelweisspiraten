declare global {
	namespace App {
		interface Locals {
			user: {
				access_token: string;
				id_token: string;
				refresh_token?: string;
				expires_in?: number;
				token_type?: string;
				userinfo: {
					email: string;
					name: string;
					groups: string[];
				};
			} | null;
			permissions: string[];
		}
	}
}

export {};
