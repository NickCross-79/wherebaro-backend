import { collections, connectToDatabase } from "../db/database.service.js";
import Review from "../models/Review.js";
import { ObjectId } from "mongodb";

/**
 * Updates a review's content and timestamp
 * @param reviewId Review ObjectId
 * @param uid User id
 * @param content Updated review content
 * @param date Updated date (YYYY-MM-DD)
 * @param time Updated time (HH:mm:ss)
 */
export async function updateReview(
    reviewId: ObjectId,
    uid: string,
    content: string,
    date: string,
    time: string
): Promise<Review | null> {
    await connectToDatabase();

    if (!collections.reviews) {
        throw new Error("Reviews collection not initialized");
    }

    await collections.reviews.updateOne(
        { _id: reviewId, uid },
        { $set: { content, date, time } }
    );

    const updated = await collections.reviews.findOne({ _id: reviewId, uid });
    return updated as Review | null;
}
