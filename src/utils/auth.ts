/**
 * Authentication utilities for API endpoints
 */

/**
 * Validates the API key from the Authorization header
 * Expects format: "Bearer {apiKey}"
 * 
 * @param authHeader The Authorization header value
 * @returns true if the API key is valid, false otherwise
 */
export function validateAdminApiKey(authHeader?: string | null): boolean {
    const apiKey = process.env.ADMIN_API_KEY;
    
    // If no API key is configured, allow requests (optional security)
    if (!apiKey) {
        return true;
    }
    
    if (!authHeader) {
        return false;
    }
    
    // Extract the token from "Bearer {token}" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return false;
    }
    
    const token = parts[1];
    return token === apiKey;
}
