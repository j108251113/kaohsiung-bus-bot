import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { formatCommuteArrival, formatRouteArrival } from './format';
import type { EstimateTimeItem, MatchedRoute } from '../types';

const sampleRoutes: MatchedRoute[] = [
    {
        routeId: '211',
        routeName: '紅3林園幹線',
        toWorkDirection: 1,
        toHomeDirection: 0,
    },
    {
        routeId: '2111',
        routeName: '紅3林園幹線延駛',
        toWorkDirection: 1,
        toHomeDirection: 0,
    },
];

describe('formatCommuteArrival', () => {
    it('formats multiple bus arrivals sorted by time', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: 15,
                carId: 'EAL-5733',
                seqno: 5,
            },
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '2111',
                direction: 1,
                estimatetime: 7,
                carId: 'EAL-5708',
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            sampleRoutes,
            '🏢 上班',
        );

        // Should contain the header
        expect(result).toContain('鳳鼻頭(沿海路)');
        expect(result).toContain('捷運小港站');
        expect(result).toContain('上班');

        // Should show 7分鐘 before 15分鐘 (sorted)
        const idx7 = result.indexOf('7分鐘');
        const idx15 = result.indexOf('15分鐘');
        expect(idx7).toBeGreaterThan(-1);
        expect(idx15).toBeGreaterThan(-1);
        expect(idx7).toBeLessThan(idx15);

        // Should show plate numbers
        expect(result).toContain('EAL-5708');
        expect(result).toContain('EAL-5733');
    });

    it('shows "進站中" for 0 minutes (no nextbustime)', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: 0,
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('進站中');
    });

    // ── Bug fix: et=0 with nextbustime ──────────────────────────────────────
    // Confirmed by API observation: et=0 always has nextbustime present.
    // The bus is at the stop; we should surface the next bus time too.
    it('shows next bus time alongside 進站中 when et=0 and nextbustime is set', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T20:00:00+08:00'));

        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: 0,
                nextbustime: '20:31',
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('進站中');
        expect(result).toContain('20:31');

        vi.useRealTimers();
    });

    // ── Bug fix: et<0 means bus has already passed ───────────────────────────
    // Confirmed by API observation: et goes negative after the bus passes;
    // nextbustime is always null during this period.
    // Should show 剛過站, NOT 進站中.
    it('shows "剛過站" (not 進站中) when et is negative', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: -3,
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('剛過站');
        expect(result).not.toContain('進站中');
    });

    // ── Bug fix: et<0 with nextbustime (theoretically possible) ─────────────
    // In practice the API never provides this, but the logic should handle it.
    it('shows next bus time when et is negative and nextbustime is set', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T20:00:00+08:00'));

        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: -1,
                nextbustime: '21:00',
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('下一班 21:00');
        expect(result).not.toContain('進站中');
        expect(result).not.toContain('剛過站');

        vi.useRealTimers();
    });

    it('shows "即將到站" for 1 minute', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: 1,
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('即將到站');
    });

    it('handles no arrivals gracefully', () => {
        const result = formatCommuteArrival(
            [],
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            sampleRoutes,
            '🏢 上班',
        );

        expect(result).toContain('無到站資料');
    });

    it('handles null estimatetime without nextbustime (未發車)', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: null,
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('未發車');
    });

    it('shows 下一班 HH:MM when estimatetime is null but nextbustime is available', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T08:00:00+08:00'));

        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: null,
                nextbustime: '08:24',
                seqno: 5,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)',
            '捷運小港站',
            [sampleRoutes[0]],
            '🏢 上班',
        );

        expect(result).toContain('下一班 08:24');
        expect(result).not.toContain('未發車');

        vi.useRealTimers();
    });

    it('handles missing stopname (uses empty string)', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                // stopname missing
                routeid: '211',
                direction: 1,
                estimatetime: 5,
                seqno: 5,
            } as any,
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭', // Origin matching isn't possible if stopname is empty unless we match ID?
            // The code checks: !stopName.includes(origin) && origin !== stopName
            // If stopName is '', it won't include '鳳鼻頭'.
            // So this entry will be filtered out.
            // We just want to ensure it doesn't crash.
            '小港站',
            sampleRoutes,
            '上班',
        );

        expect(result).not.toContain('5分鐘');
    });

    it('uses plateNumb from etas if carId is missing', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭',
                routeid: '211',
                direction: 1,
                estimatetime: 5,
                seqno: 5,
                // carId missing
                etas: [{ plateNumb: 'KKA-1234', countdownTime: 300 }]
            } as any,
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭',
            '小港站',
            sampleRoutes,
            '上班',
        );

        expect(result).toContain('KKA-1234');
    });

    it('handles missing plate number completely', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭',
                routeid: '211',
                direction: 1,
                estimatetime: 5,
                seqno: 5,
                // carId and etas missing
            } as any,
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭',
            '小港站',
            sampleRoutes,
            '上班',
        );

        expect(result).toContain('5分鐘');
        expect(result).not.toContain('🚍');
    });

    it('sorts arrivals with null estimatetime to the end', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '1', stopname: '鳳鼻頭', routeid: '211', direction: 1, estimatetime: null, seqno: 1
            },
            {
                stopid: '2', stopname: '鳳鼻頭', routeid: '211', direction: 1, estimatetime: 5, seqno: 2
            },
            {
                stopid: '3', stopname: '鳳鼻頭', routeid: '211', direction: 1, estimatetime: null, seqno: 3
            }
        ];

        const result = formatCommuteArrival(
            arrivals, '鳳鼻頭', '小港站', sampleRoutes, '上班'
        );

        // 5 mins should come before nulls
        const idx5 = result.indexOf('5分鐘');
        const idxUnset = result.indexOf('未發車');
        expect(idx5).toBeLessThan(idxUnset);
    });

    it('includes timestamp', () => {
        const result = formatCommuteArrival(
            [],
            '鳳鼻頭',
            '小港站',
            sampleRoutes,
            '🏢 上班',
        );

        expect(result).toContain('更新');
    });
    it('filters out stops that do not match originStopName', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '鳳鼻頭(沿海路)',
                routeid: '211',
                direction: 1,
                estimatetime: 5,
                seqno: 5,
            },
            {
                stopid: '99999',
                stopname: 'Other Stop', // Should be filtered out
                routeid: '211',
                direction: 1,
                estimatetime: 10,
                seqno: 6,
            },
        ];

        const result = formatCommuteArrival(
            arrivals,
            '鳳鼻頭(沿海路)', // Origin
            '捷運小港站',
            sampleRoutes,
            '🏢 上班',
        );

        expect(result).toContain('5分鐘');
        expect(result).not.toContain('10分鐘');
    });

    describe('stale nextbustime filtering', () => {
        beforeAll(() => {
            // Set current time to 08:30 for these tests
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-01-01T08:30:00+08:00'));
        });

        afterAll(() => {
            vi.useRealTimers();
        });

        it('filters out nextbustime that is strictly in the past (e.g., 08:24 at 08:30)', () => {
            const arrivals: EstimateTimeItem[] = [
                {
                    stopid: '10001',
                    stopname: '鳳鼻頭(沿海路)',
                    routeid: '211',
                    direction: 1,
                    estimatetime: null,
                    nextbustime: '08:24', // Stale
                    seqno: 5,
                },
            ];

            const result = formatCommuteArrival(
                arrivals,
                '鳳鼻頭(沿海路)',
                '捷運小港站',
                sampleRoutes,
                '🏢 上班',
            );

            expect(result).not.toContain('08:24');
            expect(result).toContain('未發車');
        });

        it('allows nextbustime that is in the future (e.g., 08:45 at 08:30)', () => {
            const arrivals: EstimateTimeItem[] = [
                {
                    stopid: '10001',
                    stopname: '鳳鼻頭(沿海路)',
                    routeid: '211',
                    direction: 1,
                    estimatetime: null,
                    nextbustime: '08:45', // Future
                    seqno: 5,
                },
            ];

            const result = formatCommuteArrival(
                arrivals,
                '鳳鼻頭(沿海路)',
                '捷運小港站',
                sampleRoutes,
                '🏢 上班',
            );

            expect(result).toContain('08:45');
            expect(result).not.toContain('未發車');
        });

        it('allows nextbustime if it is exactly current time (08:30)', () => {
            const arrivals: EstimateTimeItem[] = [
                {
                    stopid: '10001',
                    stopname: '鳳鼻頭(沿海路)',
                    routeid: '211',
                    direction: 1,
                    estimatetime: null,
                    nextbustime: '08:30', // Exact match
                    seqno: 5,
                },
            ];

            const result = formatCommuteArrival(
                arrivals,
                '鳳鼻頭(沿海路)',
                '捷運小港站',
                sampleRoutes,
                '🏢 上班',
            );

            expect(result).toContain('08:30');
            expect(result).not.toContain('未發車');
        });
    });
});

describe('formatRouteArrival', () => {
    it('formats full route arrival with direction label', () => {
        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '捷運小港站',
                routeid: '211',
                direction: 0,
                estimatetime: 3,
                carId: 'EAL-5733',
                seqno: 1,
            },
            {
                stopid: '10002',
                stopname: '鳳鼻頭',
                routeid: '211',
                direction: 0,
                estimatetime: 12,
                seqno: 5,
            },
        ];

        const result = formatRouteArrival('紅3林園幹線', arrivals, 0);

        expect(result).toContain('紅3林園幹線');
        expect(result).toContain('去程');
        expect(result).toContain('捷運小港站');
        expect(result).toContain('3分鐘');
        expect(result).toContain('鳳鼻頭');
        expect(result).toContain('12分鐘');
    });

    it('shows 返程 for direction 1', () => {
        const result = formatRouteArrival('紅3', [], 1);
        expect(result).toContain('返程');
    });

    it('handles empty arrivals', () => {
        const result = formatRouteArrival('紅3', [], 0);
        expect(result).toContain('無到站資料');
    });

    it('shows 下一班 HH:MM when estimatetime is null but nextbustime is available', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T08:00:00+08:00'));

        const arrivals: EstimateTimeItem[] = [
            {
                stopid: '10001',
                stopname: '捷運小港站',
                routeid: '211',
                direction: 0,
                estimatetime: null,
                nextbustime: '09:15',
                seqno: 1,
            },
        ];

        const result = formatRouteArrival('紅3', arrivals, 0);

        expect(result).toContain('下一班 09:15');
        expect(result).not.toContain('未發車');

        vi.useRealTimers();
    });

    it('truncates very long messages', () => {
        // Create many stops
        const arrivals: EstimateTimeItem[] = Array.from({ length: 200 }, (_, i) => ({
            stopid: `stop${i}`,
            stopname: `站牌名稱很長的站牌第${i}站會讓訊息變很長很長`,
            routeid: '211',
            direction: 0,
            estimatetime: i + 1,
            seqno: i,
        }));

        const result = formatRouteArrival('測試路線', arrivals, 0);

        // Should be within Telegram's limit
        expect(result.length).toBeLessThanOrEqual(4096);
        expect(result).toContain('僅顯示部分資料');
    });
    it('sorts by seqno and handles missing seqno', () => {
        const arrivals: EstimateTimeItem[] = [
            { stopid: '3', stopname: 'Stop 3', routeid: '1', direction: 0, estimatetime: 15 } as any, // missing seqno (undefined)
            { stopid: '4', stopname: 'Stop 4', routeid: '1', direction: 0, estimatetime: 20, seqno: 0 }, // explicit 0
            { stopid: '2', stopname: 'Stop 2', routeid: '1', direction: 0, estimatetime: 5, seqno: 2 },
            { stopid: '1', stopname: 'Stop 1', routeid: '1', direction: 0, estimatetime: 10, seqno: 1 }
        ];

        const result = formatRouteArrival('R1', arrivals, 0);
        const idx1 = result.indexOf('Stop 1');
        const idx2 = result.indexOf('Stop 2');
        const idx3 = result.indexOf('Stop 3');
        const idx4 = result.indexOf('Stop 4');
        expect(idx3).toBeLessThan(idx1); // Missing seqno (evaluates to 0) comes first
        expect(idx4).toBeLessThan(idx1); // 0 seqno comes first
        expect(idx1).toBeLessThan(idx2);
    });

    it('handles missing stopname by using ID', () => {
        const arrivals: EstimateTimeItem[] = [
            { stopid: '999', routeid: '1', direction: 0, estimatetime: 5, seqno: 1 } as any
        ];

        const result = formatRouteArrival('R1', arrivals, 0);
        expect(result).toContain('站牌 999');
    });
});
