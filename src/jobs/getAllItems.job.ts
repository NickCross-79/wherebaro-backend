import { fetchAllItems } from "../services/itemService";

export async function getAllItemsJob() {
    return fetchAllItems();
}
