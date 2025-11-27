import { redirect } from "@sveltejs/kit";
import { env } from '$lib/env'

export function GET() {
    console.log("START_ROUTE_REACHED");

    const authUrl =
        `${env.PUBLIC_AUTHENTIK_URL}/application/o/authorize/` +
        `?response_type=code` +
        `&client_id=${env.AUTHENTIK_CLIENT_ID}` +
        `&redirect_uri=${env.AUTHENTIK_REDIRECT}` +
        `&scope=openid%20email%20profile`;

    console.log("AUTH_URL:", authUrl);

    throw redirect(302, authUrl);
}
