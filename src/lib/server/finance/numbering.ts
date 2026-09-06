import { sql } from "drizzle-orm";
import { db, type Executor } from "$lib/server/db";
import { numberSequences } from "$lib/server/db/schema";

/**
 * Belegnummernkreise.
 *
 * Die Nummer wird in EINER Anweisung hochgezaehlt und zurueckgegeben. Ein
 * Lesen-dann-Schreiben waere hier fatal: zwei gleichzeitige Buchungen
 * bekaemen dieselbe Nummer, und der eindeutige Index auf entry_no liesse die
 * zweite scheitern.
 */

export type SequenceKind = "entry" | "invoice" | "bill" | "order";

function sequenceKey(kind: SequenceKind, year: number): string {
    return `${kind}:${year}`;
}

/** Naechste Nummer im Format "2026-0042". */
export async function nextNumber(
    kind: SequenceKind,
    year: number,
    executor: Executor = db
): Promise<string> {
    const key = sequenceKey(kind, year);

    const [row] = await executor
        .insert(numberSequences)
        .values({ key, nextValue: 2 })
        .onConflictDoUpdate({
            target: numberSequences.key,
            set: { nextValue: sql`${numberSequences.nextValue} + 1` }
        })
        .returning({ nextValue: numberSequences.nextValue });

    // Beim Einfuegen steht dort bereits 2, vergeben wird die 1.
    const value = row.nextValue - 1;
    return `${year}-${String(value).padStart(4, "0")}`;
}
