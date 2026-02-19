import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('iBus API', () => {
    let ibus: any;
    let globalFetch: any;

    beforeEach(async () => {
        vi.resetModules(); // Clear module cache
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 0));

        globalFetch = vi.fn();
        vi.stubGlobal('fetch', globalFetch);

        // Suppress console logs during tests
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        // Re-import module for every test
        ibus = await import('./ibus');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const mockTokenResponse = {
        ok: true,
        json: async () => ({ access_token: 'valid_token', expires_in: 3600 })
    };

    /** Helper to populate cache */
    async function setupValidCache() {
        globalFetch.mockResolvedValueOnce(mockTokenResponse);
        await ibus.getGuestToken();
        globalFetch.mockClear();
    }

    describe('getGuestToken', () => {
        it('should fetch a new token if cache is empty', async () => {
            // Cache is guaranteed empty due to resetModules
            globalFetch.mockResolvedValueOnce(mockTokenResponse);

            const token = await ibus.getGuestToken();
            expect(token).toBe('valid_token');
            expect(globalFetch).toHaveBeenCalled();
        });

        it('should return cached token if still valid', async () => {
            await setupValidCache();

            const token = await ibus.getGuestToken();
            expect(token).toBe('valid_token');
            expect(globalFetch).not.toHaveBeenCalled();
        });

        it('should refresh token if expired', async () => {
            await setupValidCache();

            // Advance time to 11:01 (expired)
            vi.setSystemTime(new Date(2025, 0, 1, 11, 1, 0));

            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'refreshed_token', expires_in: 3600 }),
            });

            const token = await ibus.getGuestToken();
            expect(token).toBe('refreshed_token');
            expect(globalFetch).toHaveBeenCalled();
        });

        it('should throw error on 500 failure', async () => {
            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
                text: async () => 'Error body',
            });

            await expect(ibus.getGuestToken()).rejects.toThrow('Failed to get GuestToken: 500 Server Error');
        });
    });

    describe('getEstimateTime', () => {
        it('should fetch estimate time successfully', async () => {
            await setupValidCache();

            const mockApiResponse = {
                status: 0,
                data: [[
                    {
                        stopid: '1',
                        stopname_Zh_Tw: 'Stop A',
                        routeid: 'R1',
                        direction: '0',
                        estimatetime: 5,
                        stopsequence: 1
                    },
                    {
                        stopid: '2',
                        stopname: 'Stop B', // sometimes it has this field
                        routeid: 'R1',
                        direction: '0',
                        estimatetime: '10', // string number
                        stopsequence: 2
                    }
                ]]
            };

            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApiResponse,
            });

            const result = await ibus.getEstimateTime([{ id: 'R1', direction: 0 }]);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(expect.objectContaining({
                stopid: '1',
                stopname: 'Stop A',
                estimatetime: 5
            }));
            expect(result[1]).toEqual(expect.objectContaining({
                stopid: '2',
                stopname: 'Stop B',
                estimatetime: 10
            }));
        });

        it('should handle null estimate time strings', async () => {
            await setupValidCache();

            const mockApiResponse = {
                status: 0,
                data: [[
                    {
                        stopid: '1',
                        estimatetime: 'null',
                        routeid: 'R1',
                        direction: '0',
                        stopsequence: 1
                    }
                ]]
            };

            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApiResponse,
            });

            const result = await ibus.getEstimateTime([{ id: 'R1', direction: 0 }]);
            expect(result[0].estimatetime).toBeNull();
        });

        it('should retry on 401', async () => {
            await setupValidCache();

            // 1. Estimate returns 401
            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'Unauthorized',
            });

            // 2. Token refresh
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'refreshed_token_2', expires_in: 3600 }),
            });

            // 3. Retry Estimate
            const mockApiResponse = {
                status: 0,
                data: [[
                    { stopid: '1', estimatetime: 5, routeid: 'R1', direction: '0', stopsequence: 1 }
                ]]
            };

            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApiResponse,
            });

            const result = await ibus.getEstimateTime([{ id: '1', direction: 0 }]);

            expect(result).toHaveLength(1);
            expect(result[0].estimatetime).toBe(5);
            expect(globalFetch).toHaveBeenCalledTimes(3);
        });

        it('should throw on other errors', async () => {
            await setupValidCache();

            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
                text: async () => 'Error',
            });

            await expect(ibus.getEstimateTime([])).rejects.toThrow('CustomEstimateTime failed: 500 Server Error');
        });

        it('should return empty array on invalid JSON or empty response', async () => {
            await setupValidCache();

            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 0, data: null }), // Invalid data format
            });

            const result = await ibus.getEstimateTime([]);
            expect(result).toEqual([]);
        });
    });
});
