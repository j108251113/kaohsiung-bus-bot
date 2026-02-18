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
    const normalized = keyword.trim();
    if (!normalized) return [];

    // Use direct OData filter to find stops by name
    const filter = encodeURIComponent(`contains(stopname_zh_tw, '${normalized}')`);
    const resp = await fetch(
        `${CITYGPT_BASE_URL}/v_stg_tdx_stop?filter=${filter}&top=100`,
        { headers: HEADERS },
    );

    if (!resp.ok) {
        throw new Error(`Failed to search stops: ${resp.status}`);
    }

    const json = await resp.json() as CityGPTResponse<Stop> | Stop[];
    const data = Array.isArray(json) ? json : json.data;

    const seen = new Map<string, { id: string; name: string }>();
    for (const stop of data) {
        const name = stop.stopname_zh_tw;
        if (!seen.has(name)) {
            seen.set(name, { id: stop.stopid, name });
        }
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
    // 1. Find all stops matching homeStopName
    // 2. Find all stops matching workStopName
    // 3. Find common routeid and check sequence
    const homeFilter = encodeURIComponent(`stopname_zh_tw eq '${homeStopName}'`);
    const workFilter = encodeURIComponent(`stopname_zh_tw eq '${workStopName}'`);

    const [homeResp, workResp, allRoutes] = await Promise.all([
        fetch(`${CITYGPT_BASE_URL}/v_stg_tdx_stop?filter=${homeFilter}&top=1000`, { headers: HEADERS }),
        fetch(`${CITYGPT_BASE_URL}/v_stg_tdx_stop?filter=${workFilter}&top=1000`, { headers: HEADERS }),
        getAllRoutes()
    ]);

    if (!homeResp.ok || !workResp.ok) {
        throw new Error('Failed to fetch stop data for connection search');
    }

    const homeData = await homeResp.json().then((j: any) => Array.isArray(j) ? j : j.data) as Stop[];
    const workData = await workResp.json().then((j: any) => Array.isArray(j) ? j : j.data) as Stop[];

    const results: {
        routeId: string;
        routeName: string;
        toWorkDirection: number;
        toHomeDirection: number;
    }[] = [];

    // Map work stops by routeId and direction for fast lookup
    const workMap = new Map<string, Stop>();
    for (const s of workData) {
        workMap.set(`${s.routeid}:${s.direction}`, s);
    }

    for (const homeStop of homeData) {
        const key = `${homeStop.routeid}:${homeStop.direction}`;
        const workStop = workMap.get(key);

        if (workStop && homeStop.stopsequence < workStop.stopsequence) {
            const route = allRoutes.find(r => r.routeid === homeStop.routeid);
            if (route) {
                const oppositeDir = homeStop.direction === 0 ? 1 : 0;
                results.push({
                    routeId: route.routeid,
                    routeName: route.routename_zh_tw,
                    toWorkDirection: homeStop.direction,
                    toHomeDirection: oppositeDir,
                });
            }
        }
    }

    return results;
}
