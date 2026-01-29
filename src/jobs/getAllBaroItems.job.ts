import { fetchAllBaroItems } from "../services/getAllBaroItemsService.js";

export async function getAllBaroItemsJob() {
    return fetchAllBaroItems();
}
