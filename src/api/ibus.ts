import type { GuestTokenResponse, EstimateTimeItem, EstimateTimeRequest } from '../types';

const IBUS_BASE_URL = 'https://ibusplus.tbkc.gov.tw/bsuper';
const SUBSCRIPTION_KEY = '676ec13f73aa4cdfbdffd6598189593b';

/**
 * Get a guest JWT token from iBus+ backend.
 * Fetches a new token on every request to avoid stale ETA data.
 */
export async function getGuestToken(): Promise<string> {
    const resp = await fetch(`${IBUS_BASE_URL}/Token/GuestToken`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://ibusplus.tbkc.gov.tw',
            'Referer': 'https://ibusplus.tbkc.gov.tw/',
        },
        body: JSON.stringify({}),
    });

    if (!resp.ok) {
        console.error(`[iBus] GuestToken failed: ${resp.status}`, await resp.text());
        throw new Error(`Failed to get GuestToken: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json() as GuestTokenResponse;
    const token = data.access_token;
    console.log('[iBus] GuestToken acquired.');

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
        console.error(`[iBus] CustomEstimateTime failed: ${resp.status}`, await resp.text());
        throw new Error(`CustomEstimateTime failed: ${resp.status} ${resp.statusText}`);
    }

    // The API returns { status: number, data: [ [StopInfo, ...], [StopInfo, ...] ] }
    const json = await resp.json() as { status: number; data: any[][] };

    if (!json || !Array.isArray(json.data)) {
        console.warn('[iBus] Unexpected response format:', JSON.stringify(json).slice(0, 100));
        return [];
    }

    // Flatten the array of arrays (one array per route/direction requested)
    const rawItems = json.data.flat();

    console.log(`[iBus] Successfully fetched ${rawItems.length} arrival items.`);

    // Map to internal EstimateTimeItem format
    return rawItems.map((item: any) => {
        // estimatetime can be "null" string, null, or a number
        let et: number | null = null;
        if (typeof item.estimatetime === 'number') {
            et = item.estimatetime;
        } else if (typeof item.estimatetime === 'string' && item.estimatetime !== 'null') {
            et = parseInt(item.estimatetime, 10);
            if (isNaN(et)) et = null;
        }

        return {
            stopid: item.stopid || item.stopID,
            stopname: item.stopname_Zh_Tw || item.stopname,
            routeid: item.routeid,
            direction: parseInt(item.direction, 10),
            estimatetime: et,
            nextbustime: item.nextbustime,
            carId: item.carId,
            seqno: item.stopsequence,
            etas: item.etas,
        };
    });
}
