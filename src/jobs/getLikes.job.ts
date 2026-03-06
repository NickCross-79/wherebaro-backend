import { getLikesForItem } from "../services/likeService";
import Like from "../models/Like";
import { ObjectId } from "mongodb";

export async function getLikesJob(itemId: string): Promise<Like[]> {
    // Convert item ID string to ObjectId
    const objectId = new ObjectId(itemId);

    // Fetch likes for the item
    const likes = await getLikesForItem(objectId);
    
    return likes;
}
