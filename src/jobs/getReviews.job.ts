import { getReviewsForItem } from "../services/reviewService";
import Review from "../models/Review";
import { ObjectId } from "mongodb";

export async function getReviewsJob(itemId: string): Promise<Review[]> {
    // Convert item ID string to ObjectId
    const objectId = new ObjectId(itemId);

    // Fetch reviews for the item
    const reviews = await getReviewsForItem(objectId);
    
    return reviews;
}
