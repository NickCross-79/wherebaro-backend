import { fetchCurrent } from "../services/currentService.js";

export async function getCurrentJob() {
    return fetchCurrent();
}
