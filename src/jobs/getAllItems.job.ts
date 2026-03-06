import { fetchAllItems } from "../services/itemService";
import { resolveModImageSentinels } from "../services/tempModImageService";

export async function getAllItemsJob() {
    const items = await fetchAllItems();
    return resolveModImageSentinels(items);
}