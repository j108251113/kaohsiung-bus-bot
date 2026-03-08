import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CityGPT API', () => {
    let citygpt: any;
    let globalFetch: any;

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 0, 1));

        globalFetch = vi.fn();
        vi.stubGlobal('fetch', globalFetch);

        citygpt = await import('./citygpt');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('getAllRoutes', () => {
        it('should fetch routes and cache them', async () => {
            const mockRoutes = [
                { routeid: '1', routename_zh_tw: 'Route 1', masterroutename: 'R1' }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: mockRoutes })
            });

            const routes = await citygpt.getAllRoutes();
            expect(routes).toEqual(mockRoutes);
            expect(globalFetch).toHaveBeenCalled();

            // 2. Call again (should use cache)
            globalFetch.mockClear();
            const routes2 = await citygpt.getAllRoutes();
            expect(routes2).toEqual(mockRoutes);
            expect(globalFetch).not.toHaveBeenCalled();
        });

        it('should handle array response directly', async () => {
            const mockRoutes = [
                { routeid: '1', routename_zh_tw: 'Route 1', masterroutename: 'R1' }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockRoutes // Array instead of { data: [...] }
            });

            const routes = await citygpt.getAllRoutes();
            expect(routes).toEqual(mockRoutes);
        });

        it('should refresh cache after 24 hours', async () => {
            // 1. First fetch
            const mockRoutes = [{ routeid: '1' }];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: mockRoutes })
            });
            await citygpt.getAllRoutes();
            globalFetch.mockClear();

            // 2. Advance time 24h+
            vi.setSystemTime(new Date(new Date().getTime() + 24 * 60 * 60 * 1000 + 1000));

            // 3. Second fetch
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [{ routeid: '2' }] })
            });
            const routes = await citygpt.getAllRoutes();
            expect(routes[0].routeid).toBe('2');
            expect(globalFetch).toHaveBeenCalled();
        });
    });

    describe('searchRoutes', () => {
        it('should filter routes by name', async () => {
            const mockRoutes = [
                { routeid: '1', routename_zh_tw: 'Red 1', masterroutename: 'Red' },
                { routeid: '2', routename_zh_tw: 'Blue 1', masterroutename: 'Blue' }
            ];
            globalFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: mockRoutes })
            });

            const results = await citygpt.searchRoutes('Red');
            expect(results).toHaveLength(1);
            expect(results[0].routeid).toBe('1');
        });

        it('should handle missing routename_zh_tw or masterroutename', async () => {
            const mockRoutes = [
                { routeid: '1' } // Missing both, should fallback to empty strings and not throw
            ];
            globalFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: mockRoutes })
            });

            const results = await citygpt.searchRoutes('Red');
            expect(results).toHaveLength(0);
        });
    });

    describe('findRoutesByMasterName', () => {
        it('should find routes by master name', async () => {
            const mockRoutes = [
                { routeid: '1', routename_zh_tw: 'Red 1', masterroutename: 'Red' },
                { routeid: '2', routename_zh_tw: 'Red 2', masterroutename: 'Red' },
                { routeid: '3', routename_zh_tw: 'Blue 1', masterroutename: 'Blue' },
                { routeid: '4', routename_zh_tw: 'Red', masterroutename: 'Red' }
            ];

            globalFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: mockRoutes })
            });

            const results = await citygpt.findRoutesByMasterName('Red');
            expect(results).toHaveLength(3);
        });
    });

    describe('getStops', () => {
        it('should fetch and sort stops', async () => {
            const mockStops = [
                { stopid: '2', stopsequence: 2 },
                { stopid: '1', stopsequence: 1 }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: mockStops })
            });

            const result = await citygpt.getStops('R1', 0);
            expect(result[0].stopid).toBe('1');
            expect(result[1].stopid).toBe('2');
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining("routeid%20eq%20'R1'"),
                expect.anything()
            );
        });

        it('should handle array response directly', async () => {
            const mockStops = [
                { stopid: '1', stopsequence: 1 }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockStops
            });

            const result = await citygpt.getStops('R1', 0);
            expect(result[0].stopid).toBe('1');
        });

        it('should throw on failure', async () => {
            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });
            await expect(citygpt.getStops('R1', 0)).rejects.toThrow('Failed to fetch stops');
        });
    });

    describe('searchStops', () => {
        it('should search unique stops', async () => {
            const mockStops = [
                { stopid: '1', stopname_zh_tw: 'Stop A' },
                { stopid: '2', stopname_zh_tw: 'Stop A' },
                { stopid: '3', stopname_zh_tw: 'Stop B' }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: mockStops })
            });

            const result = await citygpt.searchStops('Stop');
            expect(result).toHaveLength(2);
            expect(result.map((s: any) => s.name)).toEqual(['Stop A', 'Stop B']);
        });

        it('should handle array response directly', async () => {
            const mockStops = [
                { stopid: '1', stopname_zh_tw: 'Stop A' }
            ];
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockStops
            });

            const result = await citygpt.searchStops('Stop');
            expect(result).toHaveLength(1);
        });

        it('should escape special characters in keyword', async () => {
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [] })
            });

            await citygpt.searchStops("Stop' OR '1'='1");

            // Check if the URL contains the escaped single quotes (doubled)
            // We need to match the encoded format or parts of it
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining("Stop''%20OR%20''1''%3D''1'"),
                expect.anything()
            );
        });

        it('should return empty for empty keyword', async () => {
            const result = await citygpt.searchStops('   ');
            expect(result).toEqual([]);
            expect(globalFetch).not.toHaveBeenCalled();
        });

        it('should throw on failure', async () => {
            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });
            await expect(citygpt.searchStops('Stop')).rejects.toThrow('Failed to search stops');
        });
    });

    describe('findRoutesConnecting', () => {
        it('should find connecting routes correctly', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                const decoded = decodeURIComponent(url);

                if (decoded.includes("stopname_zh_tw eq 'Home'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 0, stopsequence: 5, stopname_zh_tw: 'Home' },
                            ]
                        })
                    };
                }
                if (decoded.includes("stopname_zh_tw eq 'Work'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 0, stopsequence: 10, stopname_zh_tw: 'Work' },
                            ]
                        })
                    };
                }
                if (decoded.includes("v_stg_tdx_route")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', routename_zh_tw: 'Route 1' },
                            ]
                        })
                    };
                }
                return { ok: false };
            });

            const result = await citygpt.findRoutesConnecting('Home', 'Work');

            expect(result).toHaveLength(1);
            expect(result[0].routeId).toBe('R1');
        });

        it('should handle connecting routes with opposite home direction', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                const decoded = decodeURIComponent(url);

                if (decoded.includes("stopname_zh_tw eq 'Home'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 1, stopsequence: 5, stopname_zh_tw: 'Home' },
                            ]
                        })
                    };
                }
                if (decoded.includes("stopname_zh_tw eq 'Work'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 1, stopsequence: 10, stopname_zh_tw: 'Work' },
                            ]
                        })
                    };
                }
                if (decoded.includes("v_stg_tdx_route")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', routename_zh_tw: 'Route 1' },
                            ]
                        })
                    };
                }
                return { ok: false };
            });

            const result = await citygpt.findRoutesConnecting('Home', 'Work');

            expect(result).toHaveLength(1);
            expect(result[0].routeId).toBe('R1');
            expect(result[0].toWorkDirection).toBe(1);
            expect(result[0].toHomeDirection).toBe(0);
        });

        it('should handle array response for stops directly', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                const decoded = decodeURIComponent(url);

                if (decoded.includes("stopname_zh_tw eq 'Home'")) {
                    return {
                        ok: true, json: async () => [
                            { routeid: 'R1', direction: 0, stopsequence: 5, stopname_zh_tw: 'Home' },
                        ] // Array direct
                    };
                }
                if (decoded.includes("stopname_zh_tw eq 'Work'")) {
                    return {
                        ok: true, json: async () => [
                            { routeid: 'R1', direction: 0, stopsequence: 10, stopname_zh_tw: 'Work' },
                        ] // Array direct
                    };
                }
                if (decoded.includes("v_stg_tdx_route")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', routename_zh_tw: 'Route 1' },
                            ]
                        })
                    };
                }
                return { ok: false };
            });

            const result = await citygpt.findRoutesConnecting('Home', 'Work');
            expect(result).toHaveLength(1);
        });

        it('should deduplicate routes if the same route is matched multiple times', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                const decoded = decodeURIComponent(url);
                if (decoded.includes("stopname_zh_tw eq 'Home'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 0, stopsequence: 5, stopname_zh_tw: 'Home' },
                                { routeid: 'R1', direction: 0, stopsequence: 20, stopname_zh_tw: 'Home' }
                            ]
                        })
                    };
                }
                if (decoded.includes("stopname_zh_tw eq 'Work'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R1', direction: 0, stopsequence: 10, stopname_zh_tw: 'Work' },
                                { routeid: 'R1', direction: 0, stopsequence: 25, stopname_zh_tw: 'Work' }
                            ]
                        })
                    };
                }
                if (decoded.includes("v_stg_tdx_route")) {
                    return {
                        ok: true, json: async () => ({
                            data: [{ routeid: 'R1', routename_zh_tw: 'Route 1' }]
                        })
                    };
                }
                return { ok: false };
            });

            const result = await citygpt.findRoutesConnecting('Home', 'Work');
            expect(result).toHaveLength(1); // Should be deduplicated
            expect(result[0].routeId).toBe('R1');
        });

        it('should correctly handle reversed sequence stops (work sequence < home sequence)', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                const decoded = decodeURIComponent(url);
                if (decoded.includes("stopname_zh_tw eq 'Home'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R2', direction: 0, stopsequence: 15, stopname_zh_tw: 'Home' }
                            ]
                        })
                    };
                }
                if (decoded.includes("stopname_zh_tw eq 'Work'")) {
                    return {
                        ok: true, json: async () => ({
                            data: [
                                { routeid: 'R2', direction: 0, stopsequence: 5, stopname_zh_tw: 'Work' }
                            ]
                        })
                    };
                }
                if (decoded.includes("v_stg_tdx_route")) {
                    return {
                        ok: true, json: async () => ({
                            data: [{ routeid: 'R2', routename_zh_tw: 'Route 2' }]
                        })
                    };
                }
                return { ok: false };
            });

            const result = await citygpt.findRoutesConnecting('Home', 'Work');
            expect(result).toHaveLength(1);
            expect(result[0].routeId).toBe('R2');
            expect(result[0].toWorkDirection).toBe(1); // Swaps direction due to reverse
            expect(result[0].toHomeDirection).toBe(0);
        });

        it('should throw if stop data fetch fails', async () => {
            globalFetch.mockImplementation(async (url: string) => {
                if (url.includes('v_stg_tdx_route')) {
                    return { ok: true, json: async () => ({ data: [] }) };
                }
                return { ok: false, status: 500 };
            });

            await expect(citygpt.findRoutesConnecting('Home', 'Work'))
                .rejects.toThrow('Failed to fetch stop data');
        });
    });

    describe('API Error Handling', () => {
        it('getAllRoutes should throw on failure', async () => {
            globalFetch.mockResolvedValueOnce({ ok: false, status: 500 });
            await expect(citygpt.getAllRoutes()).rejects.toThrow('Failed to fetch routes');
        });
    });
});
