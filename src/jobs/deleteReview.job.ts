import { deleteReview } from "../services/reviewService.js";
import { ObjectId } from "mongodb";

export interface DeleteReviewPayload {
    review_id: string;
    uid: string;
}

export async function deleteReviewJob(payload: DeleteReviewPayload): Promise<boolean> {
    const reviewObjectId = new ObjectId(payload.review_id);
    return deleteReview(reviewObjectId, payload.uid);
}
