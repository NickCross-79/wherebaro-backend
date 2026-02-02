import { updateReview } from "../services/reviewService.js";
import Review from "../models/Review.js";
import { ObjectId } from "mongodb";

export interface UpdateReviewPayload {
    review_id: string;
    uid: string;
    content: string;
    date: string;
    time: string;
}

export async function updateReviewJob(payload: UpdateReviewPayload): Promise<Review | null> {
    const reviewObjectId = new ObjectId(payload.review_id);
    return updateReview(reviewObjectId, payload.uid, payload.content, payload.date, payload.time);
}
