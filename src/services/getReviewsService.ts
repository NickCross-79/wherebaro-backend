import { collections, connectToDatabase } from "../db/database.service.js";
import { ObjectId } from "mongodb";
import Review from "../models/Review.js";

/**
 * Fetches all reviews for a specific item
 * @param itemId The MongoDB ObjectId of the item
 * @returns Array of Review objects for that item
 */
export async function getReviewsForItem(itemId: ObjectId): Promise<Review[]> {
    await connectToDatabase();
    
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    if (!collections.reviews) {
        throw new Error("Reviews collection not initialized");
    }

    // Get the item to retrieve its reviews array
    const item = await collections.items.findOne({ _id: itemId });

    if (!item) {
        throw new Error("Item not found");
    }

    // If no reviews, return empty array
    if (!item.reviews || item.reviews.length === 0) {
        return [];
    }

    // Convert review IDs (strings) to ObjectIds and fetch them
    const reviewIds = item.reviews.map((id: string) => new ObjectId(id));
    const reviews = await collections.reviews
        .find({ _id: { $in: reviewIds } })
        .toArray();

    console.log(`✅ Fetched ${reviews.length} reviews for item ${itemId}`);
    
    return reviews as Review[];
}
