import { writable } from "svelte/store";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
    id: string;
    message: string;
    kind: ToastKind;
    timeout?: number;
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = { subscribe };

export function addToast(message: string, kind: ToastKind = "info", timeout = 4000) {
    const id = crypto.randomUUID();
    update((list) => [...list, { id, message, kind, timeout }]);

    if (timeout && timeout > 0) {
        setTimeout(() => dismissToast(id), timeout);
    }
}

export function dismissToast(id: string) {
    update((list) => list.filter((t) => t.id !== id));
}
