import type { EstimateTimeItem, MatchedRoute } from '../types';

/**
 * Format arrival data for a single commute query (/go or /back).
 * Shows only the user's origin stop arrivals, sorted by soonest.
 */
export function formatCommuteArrival(
    arrivals: EstimateTimeItem[],
    originStopName: string,
    destinationStopName: string,
    routes: MatchedRoute[],
    commuteLabel: string,
): string {
    const lines: string[] = [];
    lines.push(`${commuteLabel}  📍 ${originStopName} → ${destinationStopName}`);
    lines.push('');

    // Collect arrivals for origin stop across all matched routes
    const stopArrivals: {
        routeName: string;
        estimateMin: number | null;
        nextTime: string | null;
        plateNumb: string | null;
    }[] = [];

    for (const route of routes) {
        const routeArrivals = arrivals.filter(
            (a) => a.routeid === route.routeId,
        );

        for (const arrival of routeArrivals) {
            const stopName = arrival.stopname || '';
            if (!stopName.includes(originStopName) && originStopName !== stopName) {
                continue;
            }

            stopArrivals.push({
                routeName: route.routeName,
                estimateMin: arrival.estimatetime,
                nextTime: arrival.nextbustime || null,
                plateNumb: arrival.carId || arrival.etas?.[0]?.plateNumb || null,
            });
        }
    }

    if (stopArrivals.length === 0) {
        lines.push('⚠️ 目前無到站資料');
        lines.push('');
        lines.push('可能原因：末班已過、路線停駛、或春節特殊班表');
    } else {
        // Sort by arrival time (null = no data, put at end)
        stopArrivals.sort((a, b) => {
            if (a.estimateMin === null) return 1;
            if (b.estimateMin === null) return -1;
            return a.estimateMin - b.estimateMin;
        });

        for (const arr of stopArrivals) {
            const icon = '🚌';
            const routeTag = arr.routeName;
            const timeStr = formatEta(arr.estimateMin);
            const plate = arr.plateNumb ? `  🚍 ${arr.plateNumb}` : '';
            lines.push(`${icon} ${routeTag}${plate}   ${timeStr}`);
        }
    }

    lines.push('');
    lines.push(`⏰ ${formatTimestamp()} 更新`);

    return lines.join('\n');
}

/**
 * Format arrival data for a full route query (/bus).
 * Shows all stops with arrival info.
 */
export function formatRouteArrival(
    routeName: string,
    arrivals: EstimateTimeItem[],
    direction: number,
): string {
    const lines: string[] = [];
    const dirLabel = direction === 0 ? '去程' : '返程';
    lines.push(`🚌 ${routeName}（${dirLabel}）`);
    lines.push('');

    if (arrivals.length === 0) {
        lines.push('⚠️ 目前無到站資料');
        lines.push('');
        lines.push('可能原因：末班已過、路線停駛、或春節特殊班表');
    } else {
        // Sort by stop sequence if available
        const sorted = [...arrivals].sort(
            (a, b) => (a.seqno || 0) - (b.seqno || 0),
        );

        for (const arr of sorted) {
            const stopName = arr.stopname || `站牌 ${arr.stopid}`;
            const timeStr = formatEta(arr.estimatetime);
            const plate = arr.carId ? ` 🚍${arr.carId}` : '';
            lines.push(`📍 ${stopName}${plate}  ${timeStr}`);
        }
    }

    lines.push('');
    lines.push(`⏰ ${formatTimestamp()} 更新`);

    // Telegram message limit check
    const result = lines.join('\n');
    if (result.length > 4000) {
        // Truncate and add note
        const truncated = result.substring(0, 3900);
        return truncated + '\n\n⚠️ 站牌過多，僅顯示部分資料';
    }

    return result;
}

/**
 * Format estimated time of arrival.
 */
function formatEta(minutes: number | null): string {
    if (minutes === null || minutes === undefined) {
        return '未發車';
    }
    if (minutes <= 0) {
        return '⚡ 進站中';
    }
    if (minutes === 1) {
        return '⚡ 即將到站';
    }
    return `${minutes}分鐘`;
}

/**
 * Format current timestamp in Taiwan time.
 */
function formatTimestamp(): string {
    const now = new Date();
    const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hours = taiwanTime.getUTCHours().toString().padStart(2, '0');
    const mins = taiwanTime.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
}
