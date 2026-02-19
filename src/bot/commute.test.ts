import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from './commands';
import * as ibus from '../api/ibus';
import * as userStore from '../store/user';
import * as ratelimit from '../utils/ratelimit';

vi.mock('../api/ibus');
vi.mock('../store/user');
vi.mock('../api/citygpt');
vi.mock('../utils/ratelimit');

const globalFetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('OK'),
    } as any)
);
vi.stubGlobal('fetch', globalFetch);

describe('Commute Flow (/go)', () => {
    const env = {
        TELEGRAM_BOT_TOKEN: 'test-token',
        USER_SETTINGS: {} as any,
        BOT_NAME: 'Test Bot'
    };
    const chatId = 12345;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ratelimit.checkRateLimit).mockResolvedValue(true);
        // Simulate Taiwan working hours (e.g. 09:00 AM)
        vi.setSystemTime(new Date('2024-06-20T01:00:00Z')); // 01:00 UTC = 09:00 Taiwan
    });

    it('should show "no data" instead of error if matchedRoutes is empty', async () => {
        vi.mocked(userStore.getUserSetting).mockResolvedValue({
            homeStop: { id: 'S1', name: 'Home' },
            workStop: { id: 'S2', name: 'Work' },
            matchedRoutes: [], // EMPTY
            switchHour: 12
        });

        const message = { chat: { id: chatId }, text: '/go' } as any;

        // If requests is empty, getEstimateTime might be called with []
        vi.mocked(ibus.getEstimateTime).mockResolvedValue([]);

        await handleMessage(env, message);

        expect(globalFetch).toHaveBeenCalledWith(
            expect.stringContaining('sendMessage'),
            expect.objectContaining({
                body: expect.stringContaining('目前沒有符合的路線資料')
            })
        );
    });

    it('should handle API failure gracefully and show the error message', async () => {
        vi.mocked(userStore.getUserSetting).mockResolvedValue({
            homeStop: { id: 'S1', name: 'Home' },
            workStop: { id: 'S2', name: 'Work' },
            matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
            switchHour: 12
        });

        vi.mocked(ibus.getEstimateTime).mockRejectedValue(new Error('API Down'));

        const message = { chat: { id: chatId }, text: '/go' } as any;

        await handleMessage(env, message);

        expect(globalFetch).toHaveBeenCalledWith(
            expect.stringContaining('sendMessage'),
            expect.objectContaining({
                body: expect.stringContaining('查詢失敗')
            })
        );
    });
});
