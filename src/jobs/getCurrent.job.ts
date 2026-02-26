import { fetchCurrent } from "../services/currentService";

export async function getCurrentJob() {
    return fetchCurrent();
}
