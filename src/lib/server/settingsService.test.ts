import { describe, expect, it } from "vitest";
import { formatIban, isValidIban } from "./settingsService";

describe("isValidIban", () => {
    it("erkennt gültige deutsche IBANs", () => {
        expect(isValidIban("DE89370400440532013000")).toBe(true);
        expect(isValidIban("DE02120300000000202051")).toBe(true);
    });

    it("akzeptiert Leerzeichen und Kleinschreibung", () => {
        expect(isValidIban("de89 3704 0044 0532 0130 00")).toBe(true);
    });

    it("erkennt gültige IBANs anderer Länder", () => {
        expect(isValidIban("AT611904300234573201")).toBe(true);
        expect(isValidIban("CH9300762011623852957")).toBe(true);
    });

    it("lehnt eine falsche Prüfziffer ab", () => {
        expect(isValidIban("DE89370400440532013001")).toBe(false);
    });

    it("lehnt zu kurze oder unpassende Eingaben ab", () => {
        expect(isValidIban("")).toBe(false);
        expect(isValidIban("DE89")).toBe(false);
        expect(isValidIban("1234370400440532013000")).toBe(false);
        expect(isValidIban("DEXX370400440532013000")).toBe(false);
    });
});

describe("formatIban", () => {
    it("gruppiert in Viererblöcke", () => {
        expect(formatIban("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
    });

    it("normalisiert vorhandene Leerzeichen", () => {
        expect(formatIban("de89 37040044 0532013000")).toBe("DE89 3704 0044 0532 0130 00");
    });
});
