import { fetchAllItems } from "../services/itemService";

export async function getAllItemsJob() {
    const items = await fetchAllItems();
    return items;
}
