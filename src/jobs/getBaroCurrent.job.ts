import { fetchBaroCurrent } from "../services/getBaroCurrentService.js";

export async function getBaroCurrentJob() {
    return fetchBaroCurrent();
}
