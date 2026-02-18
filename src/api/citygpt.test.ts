import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as citygpt from './citygpt';

describe('CityGPT API - Performance & Efficiency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('searchStops: should FAIL if it makes too many API calls (reproducing the setup hang)', async () => {
        let fetchCount = 0;

        // Stub global fetch to count calls
        vi.stubGlobal('fetch', vi.fn((url: string) => {
            fetchCount++;
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: [] })
            } as any);
        }));

        await citygpt.searchStops('鳳鼻頭');

        // Optimization: Should be just 1 direct API call now
        expect(fetchCount).toBeLessThanOrEqual(2);
    });

    it('findRoutesConnecting: should not make hundreds of API calls', async () => {
        let fetchCount = 0;
        vi.stubGlobal('fetch', vi.fn(() => {
            fetchCount++;
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: [] })
            } as any);
        }));

        // This should make:
        // 1 call for home stops
        // 1 call for work stops
        // 1 call for getAllRoutes
        // Total = 3 calls
        await citygpt.findRoutesConnecting('Home', 'Work');

        expect(fetchCount).toBeLessThanOrEqual(5);
    });
});
