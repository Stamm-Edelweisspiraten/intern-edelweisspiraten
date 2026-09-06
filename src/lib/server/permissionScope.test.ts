import { describe, expect, it } from "vitest";
import {
    groupsForPermission,
    hasPermissionForAnyGroup,
    hasPermissionForGroup,
    type Grant
} from "./permissionService";

/**
 * Der Gruppenbezug der Rechte.
 *
 * Entscheidend ist der Unterschied zwischen `null` (stammesweit, nicht
 * filtern) und `[]` (kein Recht). Wer die beiden verwechselt, baut entweder
 * ein Leck oder eine leere Seite -- vorher war genau das die Fehlerquelle,
 * weil jede der neun betroffenen Routen die Unterscheidung selbst nachbaute.
 */

const MEUTE = "11111111-1111-4111-8111-111111111111";
const SIPPE = "22222222-2222-4222-8222-222222222222";

describe("groupsForPermission", () => {
    it("liefert null, wenn das Recht stammesweit vorliegt", () => {
        const grants: Grant[] = [{ permission: "members.view", groupId: null }];
        expect(groupsForPermission(grants, "members.view")).toBeNull();
    });

    it("liefert die Gruppen, wenn das Recht nur dort gilt", () => {
        const grants: Grant[] = [
            { permission: "members.view", groupId: MEUTE },
            { permission: "members.view", groupId: SIPPE }
        ];
        expect(groupsForPermission(grants, "members.view")?.sort()).toEqual([MEUTE, SIPPE].sort());
    });

    it("liefert ein leeres Array, wenn das Recht fehlt", () => {
        const grants: Grant[] = [{ permission: "groups.view", groupId: MEUTE }];
        expect(groupsForPermission(grants, "members.view")).toEqual([]);
    });

    it("stammesweit schlaegt gruppenbezogen -- nicht umgekehrt", () => {
        const grants: Grant[] = [
            { permission: "members.view", groupId: MEUTE },
            { permission: "members.view", groupId: null }
        ];
        expect(groupsForPermission(grants, "members.view")).toBeNull();
    });

    it("deutet Platzhalter auf der gehaltenen Seite", () => {
        const grants: Grant[] = [{ permission: "members.*", groupId: MEUTE }];
        expect(groupsForPermission(grants, "members.delete")).toEqual([MEUTE]);
    });

    it("ein gruppenbezogenes * gilt nur in dieser Gruppe", () => {
        const grants: Grant[] = [{ permission: "*", groupId: MEUTE }];
        expect(groupsForPermission(grants, "finance.manage")).toEqual([MEUTE]);
    });
});

describe("hasPermissionForGroup", () => {
    const grants: Grant[] = [{ permission: "members.edit", groupId: MEUTE }];

    it("erlaubt die eigene Gruppe", () => {
        expect(hasPermissionForGroup(grants, "members.edit", MEUTE)).toBe(true);
    });

    it("weist eine fremde Gruppe ab", () => {
        expect(hasPermissionForGroup(grants, "members.edit", SIPPE)).toBe(false);
    });

    it("weist ohne Gruppe ab, wenn das Recht gruppenbezogen ist", () => {
        expect(hasPermissionForGroup(grants, "members.edit", null)).toBe(false);
    });

    it("erlaubt ohne Gruppe, wenn das Recht stammesweit ist", () => {
        const orgWide: Grant[] = [{ permission: "members.edit", groupId: null }];
        expect(hasPermissionForGroup(orgWide, "members.edit", null)).toBe(true);
    });
});

describe("hasPermissionForAnyGroup", () => {
    const grants: Grant[] = [{ permission: "members.view", groupId: MEUTE }];

    it("eine passende Gruppe genuegt", () => {
        // Ein Mitglied gehoert oft zu Meute UND Sippe.
        expect(hasPermissionForAnyGroup(grants, "members.view", [SIPPE, MEUTE])).toBe(true);
    });

    it("keine passende Gruppe weist ab", () => {
        expect(hasPermissionForAnyGroup(grants, "members.view", [SIPPE])).toBe(false);
    });

    it("ein Datensatz ohne Gruppe ist fuer Gruppenrechte unerreichbar", () => {
        expect(hasPermissionForAnyGroup(grants, "members.view", [])).toBe(false);
    });

    it("stammesweit erreicht auch einen Datensatz ohne Gruppe", () => {
        const orgWide: Grant[] = [{ permission: "members.view", groupId: null }];
        expect(hasPermissionForAnyGroup(orgWide, "members.view", [])).toBe(true);
    });
});
