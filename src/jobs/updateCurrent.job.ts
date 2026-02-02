import { updateCurrentFromApi } from "../services/currentService.js";

export async function updateCurrentJob() {
    return updateCurrentFromApi();
}