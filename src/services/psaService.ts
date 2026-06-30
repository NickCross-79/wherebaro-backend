import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";

export interface PsaDocument {
    _id?: string;
    title: string;
    message: string;
    createdAt: string;
    isActive: boolean;
}

function ensurePsaCollection() {
    if (!collections.psa) {
        throw new Error("PSA collection not initialized");
    }
    return collections.psa;
}

function toPsaDocument(psa: any): PsaDocument {
    return {
        _id: psa._id.toString(),
        title: psa.title,
        message: psa.message,
        createdAt: psa.createdAt,
        isActive: psa.isActive,
    };
}

export async function fetchActivePsa(): Promise<PsaDocument[]> {
    await connectToDatabase();

    const psaCollection = ensurePsaCollection();
    const psas = await psaCollection.find({ isActive: true }).toArray();
    return psas.map(toPsaDocument);
}

/** Returns every PSA (active and inactive), newest first. Admin use. */
export async function fetchAllPsa(): Promise<PsaDocument[]> {
    await connectToDatabase();

    const psaCollection = ensurePsaCollection();
    const psas = await psaCollection.find({}).sort({ createdAt: -1 }).toArray();
    return psas.map(toPsaDocument);
}

/** Creates a new PSA document. */
export async function createPsa(input: {
    title: string;
    message: string;
    isActive?: boolean;
}): Promise<PsaDocument> {
    await connectToDatabase();

    const psaCollection = ensurePsaCollection();

    const title = (input.title ?? "").trim();
    const message = (input.message ?? "").trim();
    if (!title) {
        throw new Error("PSA title is required");
    }
    if (!message) {
        throw new Error("PSA message is required");
    }

    const doc = {
        title,
        message,
        createdAt: new Date().toISOString(),
        isActive: input.isActive !== false, // default active
    };

    const result = await psaCollection.insertOne(doc);
    return { _id: result.insertedId.toString(), ...doc };
}

/** Updates a PSA's title, message and/or active flag. */
export async function updatePsa(
    psaId: string,
    fields: { title?: string; message?: string; isActive?: boolean }
): Promise<PsaDocument | null> {
    await connectToDatabase();

    const psaCollection = ensurePsaCollection();
    if (!ObjectId.isValid(psaId)) {
        throw new Error("Invalid PSA ID");
    }

    const update: Record<string, unknown> = {};
    if (typeof fields.title === "string") {
        const title = fields.title.trim();
        if (!title) throw new Error("PSA title cannot be empty");
        update.title = title;
    }
    if (typeof fields.message === "string") {
        const message = fields.message.trim();
        if (!message) throw new Error("PSA message cannot be empty");
        update.message = message;
    }
    if (typeof fields.isActive === "boolean") {
        update.isActive = fields.isActive;
    }

    if (Object.keys(update).length === 0) {
        throw new Error("No fields to update");
    }

    const _id = new ObjectId(psaId);
    await psaCollection.updateOne({ _id }, { $set: update });
    const updated = await psaCollection.findOne({ _id });
    return updated ? toPsaDocument(updated) : null;
}

/** Deletes a PSA document. Returns true if one was removed. */
export async function deletePsa(psaId: string): Promise<boolean> {
    await connectToDatabase();

    const psaCollection = ensurePsaCollection();
    if (!ObjectId.isValid(psaId)) {
        throw new Error("Invalid PSA ID");
    }

    const result = await psaCollection.deleteOne({ _id: new ObjectId(psaId) });
    return result.deletedCount > 0;
}
