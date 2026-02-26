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
            const timeStr = formatEta(arr.estimateMin, arr.nextTime);
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
            const timeStr = formatEta(arr.estimatetime, arr.nextbustime);
            const plateNumb = arr.carId || arr.etas?.[0]?.plateNumb || null;
            const plate = plateNumb ? ` 🚍${plateNumb}` : '';
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
 * Check if the provided HH:MM time string is strictly in the past compared to now.
 * Allows a 2-minute grace period.
 */
function isTimeExpired(timeStr: string): boolean {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return false;

    // Convert current time to Taipei time to compare against the API string
    const now = new Date();
    const taipeiStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Taipei',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });

    // In node < 20, hour ranges 01-24 instead of 00-23 when hour12: false
    // To be safe, just parse them:
    let [nowH, nowM] = taipeiStr.split(':').map(Number);
    if (nowH === 24) nowH = 0;

    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);

    const currentMins = nowH * 60 + nowM;
    let targetMins = h * 60 + m;

    // Handle overnight edge cases if current time is past midnight (0-3) and target is late night (23)
    // or current is late night (23) and target is past midnight (0-3)
    if (nowH < 4 && h > 20) {
        targetMins -= 24 * 60; // target is yesterday
    } else if (nowH > 20 && h < 4) {
        targetMins += 24 * 60; // target is tomorrow
    }

    // If the scheduled time is earlier than right now with a 2-minute grace period
    return targetMins < (currentMins - 2);
}

/**
 * Format estimated time of arrival.
 * @param nextTime - next bus departure/arrival time string (e.g. "08:24"); shown when estimatetime is null
 */
function formatEta(minutes: number | null, nextTime?: string | null): string {
    let activeNextTime = nextTime;
    if (activeNextTime && isTimeExpired(activeNextTime)) {
        activeNextTime = null;
    }

    if (minutes === null || minutes === undefined) {
        if (activeNextTime) return `下一班 ${activeNextTime}`;
        return '未發車';
    }
    if (minutes < 0) {
        // Bus has already passed this stop (API keeps negative countdown briefly).
        // nextbustime is null during this window per API observation;
        // handle theoretically-possible case anyway.
        if (activeNextTime) return `下一班 ${activeNextTime}`;
        return '剛過站';
    }
    if (minutes === 0) {
        // Bus is at the stop. nextbustime (next bus) is always present per API observation.
        if (activeNextTime) return `⚡ 進站中（下一班 ${activeNextTime}）`;
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
