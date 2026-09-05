/**
 * Theme-Verwaltung (hell / dunkel / Systemvorgabe).
 *
 * Die Wahl liegt in einem Cookie, damit der Server die Klasse bereits beim
 * Rendern setzen kann. Nur fuer "system" ist ein winziges Inline-Skript im
 * <head> noetig, weil der Server die Systemeinstellung nicht kennen kann.
 */

export const THEME_COOKIE = "ep_theme";
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
    return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function parseTheme(value: unknown): Theme {
    return isTheme(value) ? value : "system";
}

export const THEME_LABELS: Record<Theme, string> = {
    light: "Hell",
    dark: "Dunkel",
    system: "System"
};

export const THEME_ICONS: Record<Theme, string> = {
    light: "sun",
    dark: "moon-stars",
    system: "circle-half"
};

/** Nächstes Theme im Umschalt-Zyklus. */
export function nextTheme(current: Theme): Theme {
    const index = THEMES.indexOf(current);
    return THEMES[(index + 1) % THEMES.length];
}

/**
 * Setzt die `dark`-Klasse am <html>-Element und schreibt das Cookie.
 * Wird ausschließlich im Browser aufgerufen.
 */
export function applyTheme(theme: Theme): void {
    if (typeof document === "undefined") return;

    const prefersDark =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && prefersDark);

    document.documentElement.classList.toggle("dark", dark);
    document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=${THEME_MAX_AGE};samesite=lax`;
}
