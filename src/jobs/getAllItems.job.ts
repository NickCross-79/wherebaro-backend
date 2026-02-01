import { fetchAllItems } from "../services/getAllItemsService.js";

export async function getAllItemsJob() {
    return fetchAllItems();
}
