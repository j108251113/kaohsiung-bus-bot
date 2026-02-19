
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit } from './ratelimit';

describe('checkRateLimit', () => {
    let mockKV: any;
    const chatId = 12345;

    beforeEach(() => {
        vi.useFakeTimers();
        mockKV = {
            get: vi.fn(),
            put: vi.fn(),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should allow request if under limit', async () => {
        mockKV.get.mockResolvedValue(null); // First request
        const result = await checkRateLimit(mockKV, chatId, 10);
        expect(result).toBe(true);
        expect(mockKV.put).toHaveBeenCalledWith(
            expect.stringContaining('ratelimit:12345:'),
            '1',
            expect.objectContaining({ expirationTtl: 60 })
        );
    });

    it('should increment counter', async () => {
        mockKV.get.mockResolvedValue('5');
        const result = await checkRateLimit(mockKV, chatId, 10);
        expect(result).toBe(true);
        expect(mockKV.put).toHaveBeenCalledWith(
            expect.anything(),
            '6',
            expect.anything()
        );
    });

    it('should block request if limit exceeded', async () => {
        mockKV.get.mockResolvedValue('10');
        const result = await checkRateLimit(mockKV, chatId, 10);
        expect(result).toBe(false);
        // Should NOT increment if blocked (optional design, but creating less KV writes is better)
        expect(mockKV.put).not.toHaveBeenCalled();
    });
});
