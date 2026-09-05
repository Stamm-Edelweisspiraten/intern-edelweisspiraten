/**
 * Deutsche Beschriftungen der Berechtigungen.
 *
 * Die Rechteverwaltung zeigte bisher die rohen Schluessel (`members.invitepdf`
 * in Schreibmaschinenschrift). Wer eine Rolle zusammenstellt, muss aber
 * verstehen, was er vergibt -- ohne den Quelltext zu kennen.
 */

export interface PermissionModule {
    key: string;
    name: string;
    icon: string;
    description: string;
}

/** Reihenfolge der Bloecke in der Rechteverwaltung. */
export const PERMISSION_MODULES: PermissionModule[] = [
    {
        key: "members",
        name: "Mitglieder",
        icon: "people",
        description: "Mitgliederdaten einsehen und pflegen."
    },
    {
        key: "groups",
        name: "Gruppen",
        icon: "diagram-3",
        description: "Meuten und Sippen."
    },
    {
        key: "events",
        name: "Termine",
        icon: "calendar-event",
        description: "Termine ansehen, anlegen und Rückmeldungen einsehen."
    },
    {
        key: "files",
        name: "Dateien",
        icon: "folder",
        description: "Ordner und Dokumente."
    },
    {
        key: "finance",
        name: "Kasse",
        icon: "wallet2",
        description: "Buchhaltung, Beiträge und Berichte."
    },
    {
        key: "kaemmerer",
        name: "Kämmerer",
        icon: "piggy-bank",
        description: "Artikel, Lager und Bestellungen."
    },
    {
        key: "user",
        name: "Zugänge",
        icon: "person-badge",
        description: "Anmeldungen, Rollen und Zwei-Faktor."
    },
    {
        key: "system",
        name: "Einstellungen",
        icon: "sliders",
        description: "Organisation, Speicher, Beitragssätze."
    },
    {
        key: "roles",
        name: "Rollen",
        icon: "shield-lock",
        description: "Rechteverwaltung selbst."
    },
    {
        key: "admin",
        name: "Administration",
        icon: "gear",
        description: "Zugang zum Adminbereich."
    },
    {
        key: "dashboard",
        name: "Dashboard",
        icon: "speedometer2",
        description: "Die Startseite des internen Bereichs."
    },
    {
        key: "*",
        name: "Alles",
        icon: "unlock",
        description: "Uneingeschränkter Zugriff."
    }
];

/**
 * Beschriftung je Schluessel. Fehlt einer, faellt die Anzeige auf den
 * Schluessel selbst zurueck -- eine neue Berechtigung erscheint also auch
 * ohne Eintrag, nur unbeschriftet.
 */
export const PERMISSION_LABELS: Record<string, string> = {
    // Mitglieder
    "members.view": "Ansehen",
    "members.create": "Anlegen",
    "members.edit": "Bearbeiten",
    "members.delete": "Löschen",
    "members.*": "Alles",

    // Dashboard
    "dashboard.view": "Ansehen",

    // Termine
    "events.view": "Ansehen und zusagen",
    "events.manage": "Anlegen und verwalten",
    "events.*": "Alles",

    // Dateien
    "files.view": "Ansehen und herunterladen",
    "files.upload": "Hochladen",
    "files.manage": "Ordner und Freigaben verwalten",
    "files.*": "Alles",

    // Gruppen
    "groups.view": "Ansehen",
    "groups.create": "Anlegen",
    "groups.edit": "Bearbeiten",
    "groups.delete": "Löschen",
    "groups.*": "Alles",

    // Zugaenge
    "user.view": "Ansehen",
    "user.create": "Anlegen",
    "user.edit": "Bearbeiten",
    "user.delete": "Löschen",
    "user.impersonate": "Ansicht als anderer Benutzer",
    "user.mfa.reset": "Zwei-Faktor zurücksetzen",
    "user.*": "Alles",

    // System
    "system.settings.view": "Einstellungen ansehen",
    "system.settings.update": "Einstellungen ändern",
    "roles.manage": "Rollen und Rechte verwalten",
    "system.*": "Alles",

    // Administration
    "admin.view": "Adminbereich betreten",
    "admin.*": "Alles",

    // Kaemmerer
    "kaemmerer.access": "Bereich betreten",
    "kaemmerer.order.create": "Selbst bestellen",
    "kaemmerer.order.view": "Eigene Bestellungen ansehen",
    "kaemmerer.order.cancel": "Bestellung stornieren",
    "kaemmerer.orders.view": "Alle Bestellungen ansehen",
    "kaemmerer.orders.manage": "Bestellungen verwalten",
    "kaemmerer.articles.manage": "Artikel verwalten",
    "kaemmerer.storage.manage": "Lager verwalten",
    "kaemmerer.*": "Alles",

    // Kasse
    "finance.view": "Ansehen",
    "finance.manage": "Buchen und Zahlungen erfassen",
    "finance.export": "Exportieren",
    "finance.close": "Geschäftsjahr abschließen",
    "finance.*": "Alles",

    // Global
    "*": "Uneingeschränkt"
};

/** Hinweise zu Rechten, deren Wirkung nicht aus dem Namen hervorgeht. */
export const PERMISSION_HINTS: Record<string, string> = {
    "members.view": "Umfasst Änderungsprotokoll, Einladungsschreiben und hinterlegte Unterlagen.",
    "admin.view": "Ohne dieses Recht ist der gesamte Adminbereich gesperrt, unabhängig von allen anderen.",
    "user.impersonate": "Zugänge mit Vollrechten lassen sich nie übernehmen.",
    "finance.close": "Nach dem Abschluss sind im betroffenen Jahr keine Buchungen mehr möglich.",
    "*": "Schließt jedes andere Recht ein, auch künftig hinzukommende."
};

/** Modul eines Schluessels; bestimmt, in welchem Block er erscheint. */
export function moduleOf(permission: string): string {
    if (permission === "*") return "*";
    return permission.split(".")[0];
}

export function labelFor(permission: string): string {
    return PERMISSION_LABELS[permission] ?? permission;
}
