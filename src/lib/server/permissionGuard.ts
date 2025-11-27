import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

export function requirePermission(event: RequestEvent, permission: string) {
    const perms: string[] = event.locals.permissions ?? [];

    // "*" = alles erlaubt
    if (perms.includes('*')) return true;

    // Prefix checks → z.B. member.* erlaubt alles in member.xyz
    const [prefix] = permission.split('.');
    if (perms.includes(`${prefix}.*`)) return true;

    // Exakte Permission
    if (perms.includes(permission)) return true;

    throw error(403, 'Keine Berechtigung');
}
