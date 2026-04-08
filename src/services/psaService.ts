import { collections, connectToDatabase } from "../db/database.service";

export interface PsaDocument {
    _id?: string;
    title: string;
    message: string;
    createdAt: string;
}

export async function fetchActivePsa(): Promise<PsaDocument[]> {
    await connectToDatabase();

    if (!collections.psa) {
        throw new Error("PSA collection not initialized");
    }

    const psas = await collections.psa.find({}).toArray();
    return psas.map((psa) => ({
        _id: psa._id.toString(),
        title: psa.title,
        message: psa.message,
        createdAt: psa.createdAt,
    }));
}
