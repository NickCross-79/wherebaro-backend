import { reportReview } from "../services/reviewService";
import { ObjectId } from "mongodb";

export interface ReportReviewPayload {
    review_id: string;
}

export async function reportReviewJob(payload: ReportReviewPayload): Promise<boolean> {
    const reviewObjectId = new ObjectId(payload.review_id);
    return reportReview(reviewObjectId);
}
