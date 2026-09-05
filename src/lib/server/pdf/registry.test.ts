import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getTemplate, listTemplates } from "./registry";
import { ALL_PERMISSIONS } from "$lib/permissions";

/**
 * Die Vorlagenliste selbst -- ohne PDFs zu erzeugen.
 *
 * Der Punkt der Registry ist, dass Name, Recht und Schema an EINER Stelle
 * stehen. Diese Tests halten fest, dass die Stelle vollständig und
 * widerspruchsfrei bleibt: ein Recht, das es nicht gibt, spräche jede
 * Prüfung ins Leere.
 */

describe("PDF-Registry", () => {
    const templates = listTemplates();

    it("kennt die acht Vorlagen", () => {
        expect(templates.map((template) => template.name).sort()).toEqual(
            [
                "event-attendees",
                "finance-report",
                "group-members",
                "invite",
                "invoice",
                "member-list",
                "payment-notice",
                "reminder"
            ].sort()
        );
    });

    it("vergibt jeden Namen nur einmal", () => {
        const names = templates.map((template) => template.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("verlangt je Vorlage ein Recht, das es wirklich gibt", () => {
        for (const template of templates) {
            expect(template.permission, template.name).toBeTruthy();
            expect(ALL_PERMISSIONS, template.name).toContain(template.permission);
        }
    });

    it("beschriftet jede Vorlage auf Deutsch", () => {
        for (const template of templates) {
            expect(template.title.length, template.name).toBeGreaterThan(3);
            expect(template.description.length, template.name).toBeGreaterThan(10);
        }
    });

    it("findet eine Vorlage über getTemplate", () => {
        expect(getTemplate("invite")?.title).toBe("Einladungsschreiben");
        expect(getTemplate("gibt-es-nicht")).toBeNull();
    });

    it("weist eine fehlende Pflichtangabe ab", () => {
        const template = getTemplate("invite")!;
        const result = template.schema.safeParse({});
        expect(result.success).toBe(false);
    });

    it("weist eine ungültige Kennung ab", () => {
        const template = getTemplate("invoice")!;
        expect(template.schema.safeParse({ invoiceId: "keine-uuid" }).success).toBe(false);
        expect(
            template.schema.safeParse({ invoiceId: "11111111-1111-4111-8111-111111111111" })
                .success
        ).toBe(true);
    });

    it("lässt die Mitgliederliste ohne Angaben zu", () => {
        // Alle Felder sind optional -- die Liste des ganzen Stamms.
        expect(getTemplate("member-list")!.schema.safeParse({}).success).toBe(true);
    });

    it("prüft die Art des Kassenberichts", () => {
        const template = getTemplate("finance-report")!;
        expect(template.schema.safeParse({ kind: "guv" }).success).toBe(true);
        expect(template.schema.safeParse({ kind: "quatsch" }).success).toBe(false);
        expect(template.schema.safeParse({}).success).toBe(false);
    });

    it("prüft das Datumsformat des Zeitraums", () => {
        const template = getTemplate("finance-report")!;
        expect(
            template.schema.safeParse({ kind: "guv", from: "2026-01-01", to: "2026-12-31" })
                .success
        ).toBe(true);
        expect(template.schema.safeParse({ kind: "guv", from: "01.01.2026" }).success).toBe(
            false
        );
    });

    it("liefert je Vorlage einen Dateinamen mit Endung", () => {
        const samples: Record<string, unknown> = {
            invite: { memberId: "11111111-1111-4111-8111-111111111111" },
            "group-members": { groupId: "11111111-1111-4111-8111-111111111111" },
            "member-list": {},
            "payment-notice": { memberId: "11111111-1111-4111-8111-111111111111" },
            invoice: { invoiceId: "11111111-1111-4111-8111-111111111111" },
            reminder: { invoiceId: "11111111-1111-4111-8111-111111111111" },
            "finance-report": { kind: "guv" },
            "event-attendees": { eventId: "11111111-1111-4111-8111-111111111111" }
        };

        for (const template of templates) {
            const parsed = template.schema.parse(samples[template.name]);
            const name = template.filename(parsed);
            expect(name, template.name).toMatch(/\.pdf$/);
        }
    });

    it("lässt sich als JSON Schema beschreiben", () => {
        // Grundlage der Selbstbeschreibung unter GET /api/v1/pdf.
        for (const template of templates) {
            expect(() => z.toJSONSchema(template.schema, { io: "input" })).not.toThrow();
        }
    });
});
