import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, handleCallbackQuery } from './commands';
import * as citygpt from '../api/citygpt';
import * as userStore from '../store/user';

// Mock the APIs and Store
vi.mock('../api/citygpt');
vi.mock('../store/user');
vi.mock('../api/ibus');

// Mock fetch globally
const globalFetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
        text: () => Promise.resolve('OK'),
    } as any)
);
vi.stubGlobal('fetch', globalFetch);

describe('Setup Flow Integration', () => {
    const env = {
        TELEGRAM_BOT_TOKEN: 'test-token',
        USER_SETTINGS: {} as any,
        BOT_NAME: 'Test Bot'
    };
    const chatId = 12345;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Flow: /setup -> Input Station Name -> Show Selection', async () => {
        // 1. User clicks setup button (callback query)
        const query = {
            id: 'q1',
            data: 'cmd:setup',
            message: { chat: { id: chatId } }
        } as any;

        await handleCallbackQuery(env, query);

        // Verify it saved state and sent instructions
        expect(userStore.saveSetupState).toHaveBeenCalledWith(
            env.USER_SETTINGS,
            chatId,
            expect.objectContaining({ step: 'select_home' })
        );
        expect(globalFetch).toHaveBeenCalledWith(
            expect.stringContaining('sendMessage'),
            expect.objectContaining({
                body: expect.stringContaining('步驟 1/2')
            })
        );

        // 2. User inputs station name "鳳鼻頭"
        const message = {
            chat: { id: chatId },
            text: '鳳鼻頭'
        } as any;

        // Simulate state: select_home
        vi.mocked(userStore.getSetupState).mockResolvedValue({ step: 'select_home' });

        // Simulate API results
        vi.mocked(citygpt.searchStops).mockResolvedValue([
            { id: 'S1', name: '鳳鼻頭' }
        ]);

        await handleMessage(env, message);

        // VERIFICATION: This is where the user says it stops responding
        expect(citygpt.searchStops).toHaveBeenCalledWith('鳳鼻頭');
        expect(globalFetch).toHaveBeenLastCalledWith(
            expect.stringContaining('sendMessage'),
            expect.objectContaining({
                body: expect.stringContaining('選擇你的 🏠 上車站')
            })
        );
    });
});
