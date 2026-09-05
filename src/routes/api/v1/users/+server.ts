import type { RequestHandler } from "./$types";
import { requireScope } from "$lib/server/api/handle";
import { collection } from "$lib/server/api/pagination";
import { getAllUsers } from "$lib/server/userService";

/**
 * Zugaenge -- ausdruecklich nur lesend und ohne Geheimnisse: Passworthash,
 * TOTP-Geheimnis und Wiederherstellungscodes verlassen den Server nicht.
 */
export const GET: RequestHandler = async (event) => {
    const denied = requireScope(event, "user.view");
    if (denied) return denied;

    const users = await getAllUsers();

    return collection(
        users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            status: user.status,
            type: user.type,
            roleIds: user.roleIds,
            memberIds: user.memberIds,
            mfaEnabled: user.mfaEnabled,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt
        }))
    );
};
