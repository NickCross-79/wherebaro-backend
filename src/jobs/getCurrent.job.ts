import { fetchCurrent } from "../services/currentService";
import { resolveModImageSentinels } from "../services/tempModImageService";

export async function getCurrentJob() {
    const current = await fetchCurrent();
    if (current.isActive && current.items.length > 0) {
        current.items = await resolveModImageSentinels(current.items);
    }
    return current;
}
