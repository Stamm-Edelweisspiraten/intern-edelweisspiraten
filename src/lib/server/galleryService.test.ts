import { describe, expect, it } from "vitest";
import { nextPosition, pickCover, renumber } from "./galleryService";

/**
 * Die drei reinen Helfer der Galerie.
 *
 * Sie sind bewusst ohne Datenbankzugriff geschrieben, damit genau die Regeln
 * pruefbar sind, an denen sich sonst nur unter Last zeigt, ob sie stimmen:
 * die Schrittweite der Sortierung, der Umgang mit einem veralteten
 * Sortierformular und ein Titelbild, das ins Leere zeigt.
 */

describe("nextPosition", () => {
    it("beginnt bei einer leeren Galerie mit 0", () => {
        expect(nextPosition([])).toBe(0);
    });

    it("laesst nach dem ersten Bild eine ganze Schrittweite Luft", () => {
        expect(nextPosition([0])).toBe(100);
    });

    it("zaehlt vom Maximum, nicht von der Anzahl", () => {
        expect(nextPosition([100, 200])).toBe(300);
        // Nach dem Loeschen mittendrin bleiben Luecken -- "Anzahl + 1" laege
        // hier auf einer bereits belegten Position.
        expect(nextPosition([0, 400])).toBe(500);
    });
});

describe("renumber", () => {
    const known = ["a", "b", "c"];

    it("numeriert die eingereichte Reihenfolge in Schritten von 100", () => {
        expect(renumber(["c", "a", "b"], known)).toEqual([
            { id: "c", position: 0 },
            { id: "a", position: 100 },
            { id: "b", position: 200 }
        ]);
    });

    it("wirft eine Kennung raus, die nicht zur Galerie gehoert", () => {
        // "x" stammt aus einer fremden Galerie oder einem geraetenen Formular.
        expect(renumber(["x", "b", "a", "c"], known)).toEqual([
            { id: "b", position: 0 },
            { id: "a", position: 100 },
            { id: "c", position: 200 }
        ]);
    });

    it("haengt fehlende Kennungen hinten an, statt sie zu verlieren", () => {
        // Ein veraltetes Formular kennt "c" noch nicht.
        expect(renumber(["b", "a"], known)).toEqual([
            { id: "b", position: 0 },
            { id: "a", position: 100 },
            { id: "c", position: 200 }
        ]);
    });

    it("behaelt bei leerer Einreichung die bisherige Reihenfolge", () => {
        expect(renumber([], known)).toEqual([
            { id: "a", position: 0 },
            { id: "b", position: 100 },
            { id: "c", position: 200 }
        ]);
    });

    it("nimmt eine doppelt eingereichte Kennung nur einmal", () => {
        expect(renumber(["a", "a", "b"], known).map((entry) => entry.id)).toEqual([
            "a",
            "b",
            "c"
        ]);
    });
});

describe("pickCover", () => {
    const images = [
        { id: "erst", position: 0 },
        { id: "zweit", position: 100 }
    ];

    it("nimmt das gesetzte Titelbild", () => {
        expect(pickCover("zweit", images)).toBe("zweit");
    });

    it("faellt auf das erste Bild zurueck, wenn das Titelbild ins Leere zeigt", () => {
        // cover_image_id traegt keinen Fremdschluessel (Zirkelbezug) und kann
        // deshalb auf ein Bild zeigen, das es nicht mehr gibt.
        expect(pickCover("weg", images)).toBe("erst");
    });

    it("nimmt ohne gesetztes Titelbild das mit der kleinsten Position", () => {
        expect(pickCover(null, [{ id: "spaet", position: 300 }, ...images])).toBe("erst");
    });

    it("liefert bei einer leeren Galerie null", () => {
        expect(pickCover(null, [])).toBeNull();
        expect(pickCover("weg", [])).toBeNull();
    });
});
