import type { Snippet } from "svelte";

/**
 * Spaltendefinition fuer DataTable. Aus einer Definition entstehen sowohl die
 * Desktop-Tabelle als auch die mobile Kartenansicht.
 */
export interface Column<R> {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    /** Auf Mobilgeraeten in der Karte ausblenden. */
    hideOnCard?: boolean;
    /** In der Desktop-Tabelle ausblenden. */
    hideOnTable?: boolean;
    width?: string;
    /** Freie Darstellung der Zelle; hat Vorrang vor value. */
    cell?: Snippet<[R]>;
    /** Einfacher Textwert der Zelle. */
    value?: (row: R) => string | number | null | undefined;
}

export type Tone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";
