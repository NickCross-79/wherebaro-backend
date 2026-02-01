import { collections, connectToDatabase } from "../db/database.service.js";
import Review from "../models/Review.js";
import { ObjectId } from "mongodb";

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
