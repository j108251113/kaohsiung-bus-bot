import type { GuestTokenResponse, EstimateTimeItem, EstimateTimeRequest, CityGPTResponse } from '../types';

const IBUS_BASE_URL = 'https://ibusplus.tbkc.gov.tw/bsuper';
const SUBSCRIPTION_KEY = '676ec13f73aa4cdfbdffd6598189593b';

/** Cached guest token */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a guest JWT token from iBus+ backend.
 * Tokens are cached to avoid unnecessary API calls.
 */
export async function getGuestToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
        return cachedToken.token;
    }

    const resp = await fetch(`${IBUS_BASE_URL}/Token/GuestToken`);
    if (!resp.ok) {
        console.error(`[iBus] GuestToken failed: ${resp.status}`, await resp.text());
        throw new Error(`Failed to get GuestToken: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as GuestTokenResponse;
    const token = data.token;
    console.log('[iBus] GuestToken acquired.');

    // Cache for 30 minutes (we don't know exact expiry, so be conservative)
    cachedToken = {
        token,
        expiresAt: Date.now() + 30 * 60 * 1000,
    };

    return token;
}

/**
 * Get estimated arrival times for given routes.
 *
 * @param routes - Array of { id: routeId, direction: 0|1 }
 * @returns Array of estimated arrival data per stop
 */
export async function getEstimateTime(
    routes: EstimateTimeRequest[],
): Promise<EstimateTimeItem[]> {
    const token = await getGuestToken();

    const resp = await fetch(
        `${IBUS_BASE_URL}/Extended/Dal/CustomEstimateTime?extraType=All`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(routes),
        },
    );

    if (!resp.ok) {
        // If 401, clear cached token and retry once
        if (resp.status === 401 && cachedToken) {
            console.warn('[iBus] 401 Unauthorized. Clearing token and retrying...');
            cachedToken = null;
            return getEstimateTime(routes);
        }
        console.error(`[iBus] CustomEstimateTime failed: ${resp.status}`, await resp.text());
        throw new Error(`CustomEstimateTime failed: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as EstimateTimeItem[];
    console.log(`[iBus] Successfully fetched ${data?.length || 0} arrival items.`);
    return Array.isArray(data) ? data : [];
}
