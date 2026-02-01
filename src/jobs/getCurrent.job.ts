import { fetchCurrent } from "../services/getCurrentService.js";

export async function getCurrentJob() {
    return fetchCurrent();
}
