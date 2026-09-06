import { describe, expect, it } from "vitest";
import {
    errorMessageChain,
    isCheckViolation,
    isForeignKeyViolation,
    isUniqueViolation,
    postgresErrorCode,
    violatedConstraint
} from "./errors";

/**
 * Der Fall, der diesen Test noetig gemacht hat: postgres.js wirft einen
 * PostgresError mit `code`, Drizzle verpackt ihn aber in einen
 * DrizzleQueryError und haengt das Original an `cause`. Sechs Dienste
 * prueften nur das aeussere Objekt -- aus einer doppelten E-Mail-Adresse
 * wurde deshalb ein 500er statt der Meldung "existiert bereits".
 */

/** Baut die Form nach, die Drizzle 0.45 tatsaechlich wirft. */
function drizzleWrapped(code: string, message = "doppelter Schluessel", constraint?: string) {
    const inner = Object.assign(new Error(message), { code, constraint_name: constraint });
    const outer = new Error('Failed query: insert into "users" ...');
    (outer as Error & { cause?: unknown }).cause = inner;
    return outer;
}

describe("postgresErrorCode", () => {
    it("findet den Code am Fehler selbst", () => {
        expect(postgresErrorCode(Object.assign(new Error("x"), { code: "23505" }))).toBe("23505");
    });

    it("findet den Code hinter einer cause -- der eigentliche Fall", () => {
        expect(postgresErrorCode(drizzleWrapped("23505"))).toBe("23505");
    });

    it("findet den Code auch mehrere Ebenen tief", () => {
        const innerste = Object.assign(new Error("tief"), { code: "23503" });
        const mitte = Object.assign(new Error("mitte"), { cause: innerste });
        const aussen = Object.assign(new Error("aussen"), { cause: mitte });
        expect(postgresErrorCode(aussen)).toBe("23503");
    });

    it("liefert undefined ohne Code", () => {
        expect(postgresErrorCode(new Error("nur Text"))).toBeUndefined();
        expect(postgresErrorCode(null)).toBeUndefined();
        expect(postgresErrorCode("Zeichenkette")).toBeUndefined();
    });

    it("laeuft bei einer ringfoermigen cause nicht endlos", () => {
        const a = new Error("a") as Error & { cause?: unknown };
        const b = new Error("b") as Error & { cause?: unknown };
        a.cause = b;
        b.cause = a;
        expect(postgresErrorCode(a)).toBeUndefined();
    });
});

describe("Erkennung einzelner Verletzungen", () => {
    it("erkennt den eindeutigen Index, verpackt wie unverpackt", () => {
        expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
        expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" }))).toBe(true);
    });

    it("verwechselt die Codes nicht", () => {
        expect(isUniqueViolation(drizzleWrapped("23503"))).toBe(false);
        expect(isForeignKeyViolation(drizzleWrapped("23503"))).toBe(true);
        expect(isCheckViolation(drizzleWrapped("23514"))).toBe(true);
        expect(isCheckViolation(drizzleWrapped("23505"))).toBe(false);
    });
});

describe("errorMessageChain", () => {
    it("enthaelt die Meldung des Triggers, nicht nur die aeussere", () => {
        // So meldet sich assert_entry_balanced() aus 0001_balanced_entries.sql.
        const err = drizzleWrapped(
            "23514",
            "Buchungssatz 1 ist nicht ausgeglichen: Soll 100 Cent, Haben 50 Cent."
        );
        expect(errorMessageChain(err)).toContain("nicht ausgeglichen");
        // Die aeussere Meldung allein haette den Text nie enthalten.
        expect(String(err.message)).not.toContain("nicht ausgeglichen");
    });

    it("kommt mit einem Fehler ohne cause zurecht", () => {
        expect(errorMessageChain(new Error("allein"))).toBe("allein");
    });
});

describe("violatedConstraint", () => {
    it("nennt den verletzten Index", () => {
        expect(violatedConstraint(drizzleWrapped("23505", "doppelt", "users_email_unique"))).toBe(
            "users_email_unique"
        );
    });

    it("liefert undefined, wenn PostgreSQL keinen Namen mitschickt", () => {
        expect(violatedConstraint(drizzleWrapped("23505"))).toBeUndefined();
    });
});
