import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentCommute, getCommuteDirection, getCommuteLabel, getOppositeCommute, getCommuteStops } from './direction';
import type { UserSetting, MatchedRoute } from '../types';

const baseSetting: UserSetting = {
    homeStop: { id: '10001', name: '鳳鼻頭(沿海路)' },
    workStop: { id: '10002', name: '捷運小港站' },
    matchedRoutes: [
        {
            routeId: '211',
            routeName: '紅3林園幹線',
            toWorkDirection: 1,
            toHomeDirection: 0,
        },
    ],
    switchHour: 12,
};

describe('getCurrentCommute', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns toWork before switchHour (morning in Taiwan)', () => {
        // 08:00 Taiwan time = 00:00 UTC
        vi.setSystemTime(new Date('2025-06-15T00:00:00Z'));
        expect(getCurrentCommute(baseSetting)).toBe('toWork');
    });

    it('returns toHome after switchHour (afternoon in Taiwan)', () => {
        // 14:00 Taiwan time = 06:00 UTC
        vi.setSystemTime(new Date('2025-06-15T06:00:00Z'));
        expect(getCurrentCommute(baseSetting)).toBe('toHome');
    });

    it('returns toHome at exactly switchHour', () => {
        // 12:00 Taiwan time = 04:00 UTC
        vi.setSystemTime(new Date('2025-06-15T04:00:00Z'));
        expect(getCurrentCommute(baseSetting)).toBe('toHome');
    });

    it('returns toWork at midnight Taiwan time', () => {
        // 00:00 Taiwan time = 16:00 UTC (previous day)
        vi.setSystemTime(new Date('2025-06-14T16:00:00Z'));
        expect(getCurrentCommute(baseSetting)).toBe('toWork');
    });

    it('respects custom switchHour', () => {
        const customSetting = { ...baseSetting, switchHour: 14 };
        // 13:00 Taiwan time = 05:00 UTC → should still be toWork
        vi.setSystemTime(new Date('2025-06-15T05:00:00Z'));
        expect(getCurrentCommute(customSetting)).toBe('toWork');

        // 15:00 Taiwan time = 07:00 UTC → should be toHome
        vi.setSystemTime(new Date('2025-06-15T07:00:00Z'));
        expect(getCurrentCommute(customSetting)).toBe('toHome');
    });
});

describe('getCommuteDirection', () => {
    const route: MatchedRoute = {
        routeId: '211',
        routeName: '紅3林園幹線',
        toWorkDirection: 1,
        toHomeDirection: 0,
    };

    it('returns toWorkDirection for toWork commute', () => {
        expect(getCommuteDirection(route, 'toWork')).toBe(1);
    });

    it('returns toHomeDirection for toHome commute', () => {
        expect(getCommuteDirection(route, 'toHome')).toBe(0);
    });
});

describe('getCommuteLabel', () => {
    it('returns 上班 for toWork', () => {
        expect(getCommuteLabel('toWork')).toContain('上班');
    });

    it('returns 下班 for toHome', () => {
        expect(getCommuteLabel('toHome')).toContain('下班');
    });
});

describe('getOppositeCommute', () => {
    it('toWork → toHome', () => {
        expect(getOppositeCommute('toWork')).toBe('toHome');
    });

    it('toHome → toWork', () => {
        expect(getOppositeCommute('toHome')).toBe('toWork');
    });
});

describe('getCommuteStops', () => {
    it('returns home→work for toWork', () => {
        const result = getCommuteStops(baseSetting, 'toWork');
        expect(result.origin).toBe('鳳鼻頭(沿海路)');
        expect(result.destination).toBe('捷運小港站');
    });

    it('returns work→home for toHome (swapped!)', () => {
        const result = getCommuteStops(baseSetting, 'toHome');
        expect(result.origin).toBe('捷運小港站');
        expect(result.destination).toBe('鳳鼻頭(沿海路)');
    });
});
