import { collections, connectToDatabase } from "../db/database.service.js";
import { ObjectId } from "mongodb";

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
