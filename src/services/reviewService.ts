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
        .sort({ date: -1 })
        .toArray();

    console.log(`✅ Fetched ${reviews.length} reviews for item ${itemId}`);
    
    return reviews as Review[];
}

/**
 * Posts a review to the database and updates the item with the review ID
 * @param review Review object to insert
 * @returns The inserted review with its generated _id
 */
export async function postReview(review: Review): Promise<Review> {
    await connectToDatabase();
    
    if (!collections.reviews) {
        throw new Error("Reviews collection not initialized");
    }

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const existingReview = await collections.reviews.findOne({
        item_oid: review.item_oid,
        uid: review.uid
    });

    if (existingReview) {
        const error = new Error("User has already reviewed this item");
        (error as any).code = "REVIEW_EXISTS";
        throw error;
    }

    // Insert the review into the reviews collection
    const result = await collections.reviews.insertOne(review);
    
    // Get the inserted review ID
    const reviewId = result.insertedId;

    // Update the item to add this review ID to its reviews array
    await collections.items.updateOne(
        { _id: review.item_oid },
        { $push: { reviews: reviewId.toString() } } as any
    );
    
    console.log(`✅ Posted review ${reviewId} for item ${review.item_oid}`);
    
    // Return the review with its ID
    review._id = reviewId;
    return review;
}

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

/**
 * Deletes a review and removes it from the item's reviews array
 * @param reviewId Review ObjectId
 * @param uid User id for verification
 */
export async function deleteReview(reviewId: ObjectId, uid: string): Promise<boolean> {
    await connectToDatabase();

    if (!collections.reviews) {
        throw new Error("Reviews collection not initialized");
    }

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    // Get the review to find its item_oid before deleting
    const review = await collections.reviews.findOne({ _id: reviewId, uid });

    if (!review) {
        return false;
    }

    // Delete the review
    await collections.reviews.deleteOne({ _id: reviewId, uid });

    // Remove the review ID from the item's reviews array
    await collections.items.updateOne(
        { _id: review.item_oid },
        { $pull: { reviews: reviewId.toString() } } as any
    );

    console.log(`✅ Deleted review ${reviewId} from item ${review.item_oid}`);

    return true;
}
