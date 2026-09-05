/**
 * Berechtigungsschluessel des Portals.
 *
 * Die frueher parallele Reihe `groupleader.*` (sieben Schluessel) ist
 * entfallen. Ein Gruppenbezug entsteht jetzt nicht mehr ueber einen eigenen
 * Namensraum, sondern darueber, dass eine Rolle einem Zugang **fuer eine
 * bestimmte Gruppe** zugewiesen wird -- siehe user_roles.groupId und
 * positions.roleId. `members.view` bedeutet dadurch je nach Zuweisung
 * "alle Mitglieder" oder "die Mitglieder meiner Gruppe"; der Schluessel
 * bleibt derselbe.
 *
 * Reihenfolge und Gruppierung bestimmen die Darstellung in der
 * Rechteverwaltung; die Beschriftungen stehen in ./permissions/labels.ts.
 */
export const ALL_PERMISSIONS = [
    // -----------------------
    // Mitglieder
    // -----------------------
    "members.view",
    "members.create",
    "members.edit",
    "members.delete",
    "members.*",

    // -----------------------
    // Dashboard
    // -----------------------
    "dashboard.view",

    // -----------------------
    // Termine
    // -----------------------
    "events.view",
    "events.manage",
    "events.*",

    // -----------------------
    // Dateien
    // -----------------------
    "files.view",
    "files.upload",
    "files.manage",
    "files.*",

    // -----------------------
    // Gruppen
    // -----------------------
    "groups.view",
    "groups.create",
    "groups.edit",
    "groups.delete",
    "groups.*",

    // -----------------------
    // Zugaenge
    // -----------------------
    "user.view",
    "user.create",
    "user.edit",
    "user.delete",
    "user.impersonate",
    "user.mfa.reset",
    "user.*",

    // -----------------------
    // System / Einstellungen
    // -----------------------
    "system.settings.view",
    "system.settings.update",
    "roles.manage",
    "system.*",

    // -----------------------
    // Administration
    // -----------------------
    "admin.view",
    "admin.*",

    // -----------------------
    // Kaemmerer
    // -----------------------
    "kaemmerer.access",
    "kaemmerer.order.create",
    "kaemmerer.order.view",
    "kaemmerer.order.cancel",
    "kaemmerer.orders.view",
    "kaemmerer.orders.manage",
    "kaemmerer.articles.manage",
    "kaemmerer.storage.manage",
    "kaemmerer.*",

    // -----------------------
    // Kasse
    // -----------------------
    "finance.view",
    "finance.manage",
    "finance.export",
    "finance.close",
    "finance.*",

    // -----------------------
    // Alles
    // -----------------------
    "*"
];

/**
 * Rechte, die sich sinnvoll auf eine einzelne Gruppe einschraenken lassen.
 *
 * Nur fuer diese bietet die Rechteverwaltung eine gruppenbezogene Zuweisung
 * an. Eine Rolle mit `finance.manage` fuer "Meute Wildkatzen" waere sinnlos --
 * die Kasse kennt keinen Gruppenbezug.
 */
export const GROUP_SCOPED_PERMISSIONS = [
    "members.view",
    "members.create",
    "members.edit",
    "members.delete",
    "members.*",
    "groups.view",
    "groups.edit",
    "groups.*",
    "events.view",
    "events.manage",
    "events.*",
    "files.view",
    "files.upload",
    "files.manage",
    "files.*"
];

/** true, wenn das Recht auf eine Gruppe eingeschraenkt werden kann. */
export function isGroupScopable(permission: string): boolean {
    return GROUP_SCOPED_PERMISSIONS.includes(permission);
}
