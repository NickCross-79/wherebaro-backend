import { fetchAllItems } from "../services/itemService.js";

export async function getAllItemsJob() {
    return fetchAllItems();
}
