import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('iBus+ API Wrapper', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('getGuestToken: should fetch and return a token', async () => {
        const { getGuestToken } = await import('./ibus');
        vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ token: 'mock-jwt' })
            } as any)
        ));

        const token = await getGuestToken();
        expect(token).toBe('mock-jwt');
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/Token/GuestToken'));
    });

    it('getEstimateTime: should retry once on 401', async () => {
        const { getEstimateTime } = await import('./ibus');
        let callCount = 0;
        vi.stubGlobal('fetch', vi.fn((url: string) => {
            callCount++;
            if (url.includes('/Token/GuestToken')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ token: `token-${callCount}` })
                } as any);
            }

            if (url.includes('CustomEstimateTime')) {
                if (callCount === 2) {
                    return Promise.resolve({ ok: false, status: 401 } as any);
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([])
                } as any);
            }
            return Promise.resolve({ ok: false } as any);
        }));

        const result = await getEstimateTime([{ id: '211', direction: 0 }]);
        expect(result).toEqual([]);
        expect(callCount).toBe(4); // [Token, POST(401), Token, POST(200)]
    });
});
