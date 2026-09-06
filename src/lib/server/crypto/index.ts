import { env } from "$env/dynamic/private";
import { decryptWithKey, encryptWithKey, parseKey } from "./aes";

/**
 * Verschlüsselung von Geheimnissen, die in der Datenbank stehen.
 *
 * Lag ursprünglich in `auth/totp.ts` und war damit an die Zwei-Faktor-
 * Einrichtung gebunden. Inzwischen gibt es einen zweiten Nutzer: der geheime
 * Schlüssel des Objektspeichers steht in `settings` und darf dort ebenso
 * wenig im Klartext liegen wie ein TOTP-Secret.
 *
 * Diese Datei bindet nur den Schlüssel aus der Umgebung an; das Verfahren
 * selbst steht in `./aes.ts` und kommt ohne SvelteKit aus, damit die Skripte
 * unter `scripts/` dieselbe Verschlüsselung benutzen können.
 */

/**
 * Der Schlüssel kommt aus der Umgebung, nicht aus der Datenbank -- sonst
 * läge er neben dem, was er schützt.
 *
 * Der Name `MFA_ENC_KEY` bleibt aus Gründen der Abwärtskompatibilität: eine
 * Umbenennung würde bei jedem bestehenden Betrieb sämtliche hinterlegten
 * Zwei-Faktor-Secrets unlesbar machen. `APP_ENC_KEY` wird zusätzlich
 * akzeptiert und hat Vorrang, damit neue Installationen den passenderen
 * Namen verwenden können.
 */
function encryptionKey(): Buffer {
    return parseKey(env.APP_ENC_KEY || env.MFA_ENC_KEY);
}

/** true, wenn ein Schlüssel hinterlegt ist -- ohne ihn zu benutzen. */
export function hasEncryptionKey(): boolean {
    try {
        encryptionKey();
        return true;
    } catch {
        return false;
    }
}

export function encryptSecret(secret: string): string {
    return encryptWithKey(encryptionKey(), secret);
}

export function decryptSecret(payload: string): string {
    return decryptWithKey(encryptionKey(), payload);
}
