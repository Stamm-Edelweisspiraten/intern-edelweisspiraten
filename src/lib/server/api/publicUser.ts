import type { User } from "$lib/server/userService";

/**
 * Ein Zugang, wie ihn die REST-API herausgibt.
 *
 * Bewusst Feld fuer Feld statt `...user`: der Datensatz traegt Passworthash,
 * TOTP-Geheimnis und Wiederherstellungscodes. Ein Spread waere genau der
 * Fehler, der beim naechsten neuen Schema-Feld den Hash mit ausliefert --
 * deshalb steht die Abbildung an EINER Stelle und wird von der Sammel- wie
 * von der Einzelroute benutzt.
 */
export function toPublicUser(user: User) {
    return {
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
    };
}
