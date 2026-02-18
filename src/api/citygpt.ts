import type { Route, Stop, CityGPTResponse } from '../types';

const CITYGPT_BASE_URL = 'https://citygpt.foxconn.com/data/abfs/dal';
const SUBSCRIPTION_KEY = '676ec13f73aa4cdfbdffd6598189593b';

const HEADERS = {
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Authorization': `Bearer ${SUBSCRIPTION_KEY}`,
};

/** Cached route list */
let routeCache: { routes: Route[]; expiresAt: number } | null = null;

/**
 * Fetch all bus routes from CityGPT.
 * Results are cached for 24 hours since route data rarely changes.
 */
export async function getAllRoutes(): Promise<Route[]> {
    if (routeCache && Date.now() < routeCache.expiresAt) {
        return routeCache.routes;
    }

    const resp = await fetch(`${CITYGPT_BASE_URL}/v_stg_tdx_route?top=1000`, {
        headers: HEADERS,
    });

    if (!resp.ok) {
        throw new Error(`Failed to fetch routes: ${resp.status}`);
    }

    const json = await resp.json() as CityGPTResponse<Route> | Route[];
    const routes = Array.isArray(json) ? json : json.data;

    routeCache = {
        routes,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    return routes;
}

/**
 * Search routes by name (fuzzy match).
 * Returns grouped results by masterroutename when applicable.
 */
export async function searchRoutes(keyword: string): Promise<Route[]> {
    const allRoutes = await getAllRoutes();
    const normalized = keyword.trim().toLowerCase();

    return allRoutes.filter((r) => {
        const name = (r.routename_zh_tw || '').toLowerCase();
        const master = (r.masterroutename || '').toLowerCase();
        return name.includes(normalized) || master.includes(normalized);
    });
}

/**
 * Find routes that exactly match a master route name.
 * e.g., "紅3" → returns all 紅3 variants
 */
export async function findRoutesByMasterName(masterName: string): Promise<Route[]> {
    const allRoutes = await getAllRoutes();
    return allRoutes.filter(
        (r) => r.masterroutename === masterName || r.routename_zh_tw === masterName,
    );
}

/**
 * Get all stops for a specific route and direction.
 */
export async function getStops(routeId: string, direction: number): Promise<Stop[]> {
    const filter = encodeURIComponent(
        `routeid eq '${routeId}' and direction eq ${direction}`,
    );
    const resp = await fetch(
        `${CITYGPT_BASE_URL}/v_stg_tdx_stop?filter=${filter}&top=200`,
        { headers: HEADERS },
    );

    if (!resp.ok) {
        throw new Error(`Failed to fetch stops: ${resp.status}`);
    }

    const json = await resp.json() as CityGPTResponse<Stop> | Stop[];
    const stops = Array.isArray(json) ? json : json.data;

    return stops.sort((a, b) => a.stopsequence - b.stopsequence);
}

/**
 * Search for a stop by name across all routes.
 * Returns unique stops (deduplicated by name).
 */
export async function searchStops(keyword: string): Promise<{ id: string; name: string }[]> {
    const allRoutes = await getAllRoutes();
    const normalized = keyword.trim().toLowerCase();
    const seen = new Map<string, { id: string; name: string }>();

    // Fetch stops for a subset of routes to keep API calls reasonable
    // We search direction 0 and 1 for all routes
    for (const route of allRoutes) {
        for (const dir of [0, 1]) {
            try {
                const stops = await getStops(route.routeid, dir);
                for (const stop of stops) {
                    const stopName = stop.stopname_zh_tw || '';
                    if (stopName.toLowerCase().includes(normalized) && !seen.has(stopName)) {
                        seen.set(stopName, { id: stop.stopid, name: stopName });
                    }
                }
            } catch {
                // Skip errors for individual routes
            }

            // Limit to first 100 unique matches
            if (seen.size >= 100) break;
        }
        if (seen.size >= 100) break;
    }

    return Array.from(seen.values());
}

/**
 * Find all routes that pass through both stops, and determine directions.
 * Returns the route IDs with the correct direction for each journey.
 */
export async function findRoutesConnecting(
    homeStopName: string,
    workStopName: string,
): Promise<{
    routeId: string;
    routeName: string;
    toWorkDirection: number;
    toHomeDirection: number;
}[]> {
    const allRoutes = await getAllRoutes();
    const results: {
        routeId: string;
        routeName: string;
        toWorkDirection: number;
        toHomeDirection: number;
    }[] = [];

    for (const route of allRoutes) {
        for (const dir of [0, 1] as const) {
            try {
                const stops = await getStops(route.routeid, dir);
                const homeIdx = stops.findIndex(
                    (s) => s.stopname_zh_tw === homeStopName,
                );
                const workIdx = stops.findIndex(
                    (s) => s.stopname_zh_tw === workStopName,
                );

                if (homeIdx !== -1 && workIdx !== -1 && homeIdx < workIdx) {
                    // This direction goes from home → work
                    const oppositeDir = dir === 0 ? 1 : 0;
                    // Only add if not already found
                    if (!results.find((r) => r.routeId === route.routeid)) {
                        results.push({
                            routeId: route.routeid,
                            routeName: route.routename_zh_tw,
                            toWorkDirection: dir,
                            toHomeDirection: oppositeDir,
                        });
                    }
                }
            } catch {
                // Skip errors
            }
        }
    }

    return results;
}
