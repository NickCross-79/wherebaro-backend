import { updateCurrentFromApi } from "../services/currentService";

export async function updateCurrentJob() {
    return updateCurrentFromApi();
}