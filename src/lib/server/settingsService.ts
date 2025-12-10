import { db } from "$lib/server/mongo";

export interface FinanceSettings {
    contributions: {
        stamm: number;
        gau: number;
        landesmark: number;
        bund: number;
    };
    updatedAt?: string;
    updatedBy?: string;
}

const FINANCE_SETTINGS_ID = "finance";

const defaultFinance: FinanceSettings = {
    contributions: {
        stamm: 0,
        gau: 0,
        landesmark: 0,
        bund: 0
    }
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
    const doc = await db.collection("settings").findOne({ _id: FINANCE_SETTINGS_ID });
    if (!doc) return { ...defaultFinance };
    return {
        contributions: {
            stamm: Number(doc.contributions?.stamm) || 0,
            gau: Number(doc.contributions?.gau) || 0,
            landesmark: Number(doc.contributions?.landesmark) || 0,
            bund: Number(doc.contributions?.bund) || 0
        },
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy
    };
}

export async function saveFinanceSettings(settings: FinanceSettings, updatedBy: string) {
    const payload = {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy
    };

    await db.collection("settings").updateOne(
        { _id: FINANCE_SETTINGS_ID },
        { $set: payload },
        { upsert: true }
    );

    return payload;
}
