import { updateCurrentFromApi } from "../services/updateCurrentService.js";

export async function updateCurrentJob() {
    return updateCurrentFromApi();
}