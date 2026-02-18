import type { UserSetting, MatchedRoute } from '../types';

/**
 * Determine the current commute direction based on current hour.
 *
 * @param setting - User's saved setting (includes switchHour, default 12)
 * @returns 'toWork' if before switchHour, 'toHome' otherwise
 */
export function getCurrentCommute(setting: UserSetting): 'toWork' | 'toHome' {
    const now = new Date();
    // Convert to Taiwan time (UTC+8)
    const taiwanHour = (now.getUTCHours() + 8) % 24;
    return taiwanHour < setting.switchHour ? 'toWork' : 'toHome';
}

/**
 * Get the API direction number for the current commute.
 */
export function getCommuteDirection(
    route: MatchedRoute,
    commute: 'toWork' | 'toHome',
): number {
    return commute === 'toWork' ? route.toWorkDirection : route.toHomeDirection;
}

/**
 * Get a human-readable label for the commute direction.
 */
export function getCommuteLabel(commute: 'toWork' | 'toHome'): string {
    return commute === 'toWork' ? '🏢 上班' : '🏠 下班';
}

/**
 * Get the opposite commute direction.
 */
export function getOppositeCommute(
    commute: 'toWork' | 'toHome',
): 'toWork' | 'toHome' {
    return commute === 'toWork' ? 'toHome' : 'toWork';
}

/**
 * Get origin and destination stop names for a given commute direction.
 */
export function getCommuteStops(
    setting: UserSetting,
    commute: 'toWork' | 'toHome',
): { origin: string; destination: string } {
    if (commute === 'toWork') {
        return {
            origin: setting.homeStop.name,
            destination: setting.workStop.name,
        };
    }
    return {
        origin: setting.workStop.name,
        destination: setting.homeStop.name,
    };
}
