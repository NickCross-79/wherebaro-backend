import { fetchActivePsa } from "../services/psaService";

export async function getPsaJob() {
    return fetchActivePsa();
}
