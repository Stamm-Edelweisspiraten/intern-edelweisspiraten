import { describe, expect, it } from "vitest";
import { matchesAllPermissions, matchesAnyPermission, matchesPermission } from "$lib/permissions/match";

describe("matchesPermission", () => {
    it("erlaubt alles bei globaler Wildcard", () => {
        expect(matchesPermission(["*"], "members.view")).toBe(true);
        expect(matchesPermission(["*"], "kaemmerer.order.create")).toBe(true);
    });

    it("erkennt exakte Treffer", () => {
        expect(matchesPermission(["members.view"], "members.view")).toBe(true);
        expect(matchesPermission(["members.view"], "members.edit")).toBe(false);
    });

    it("loest Wildcards auf der ersten Ebene auf", () => {
        expect(matchesPermission(["members.*"], "members.view")).toBe(true);
        expect(matchesPermission(["members.*"], "members.delete")).toBe(true);
    });

    it("loest auch mehrsegmentige Wildcards auf", () => {
        // Genau hier gingen can()/requirePermission() und hasPermission()
        // vorher auseinander: kaemmerer.order.* wurde nur von einer der drei
        // Implementierungen korrekt ausgewertet.
        expect(matchesPermission(["kaemmerer.order.*"], "kaemmerer.order.create")).toBe(true);
        expect(matchesPermission(["kaemmerer.*"], "kaemmerer.order.create")).toBe(true);
    });

    it("laesst eine Wildcard nicht ueber ihren Praefix hinaus wirken", () => {
        expect(matchesPermission(["members.*"], "groups.view")).toBe(false);
        // "groupleader.members.view" liegt NICHT unter "members".
        expect(matchesPermission(["members.*"], "groupleader.members.view")).toBe(false);
        expect(matchesPermission(["kaemmerer.order.*"], "kaemmerer.orders.view")).toBe(false);
    });

    it("erlaubt den Praefix selbst", () => {
        expect(matchesPermission(["kaemmerer.*"], "kaemmerer")).toBe(true);
    });

    it("verweigert bei leerer oder fehlender Liste", () => {
        expect(matchesPermission([], "members.view")).toBe(false);
        expect(matchesPermission(null, "members.view")).toBe(false);
        expect(matchesPermission(undefined, "members.view")).toBe(false);
    });

    it("verweigert bei leerer Anforderung", () => {
        expect(matchesPermission(["*"], "")).toBe(false);
    });
});

describe("matchesAnyPermission / matchesAllPermissions", () => {
    it("prueft oder-verknuepft", () => {
        expect(matchesAnyPermission(["groups.view"], ["members.view", "groups.view"])).toBe(true);
        expect(matchesAnyPermission(["positions.view"], ["members.view", "groups.view"])).toBe(false);
    });

    it("prueft und-verknuepft", () => {
        expect(matchesAllPermissions(["members.*"], ["members.view", "members.edit"])).toBe(true);
        expect(matchesAllPermissions(["members.view"], ["members.view", "members.edit"])).toBe(false);
    });
});
