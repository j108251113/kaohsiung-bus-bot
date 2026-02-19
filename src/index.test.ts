import { describe, it, expect, vi } from 'vitest';
import worker from './index';
// @ts-ignore - vitest knows how to mock this
import { handleMessage, handleCallbackQuery } from './bot/commands';

vi.mock('./bot/commands', () => ({
    handleMessage: vi.fn(() => Promise.resolve()),
    handleCallbackQuery: vi.fn(() => Promise.resolve()),
}));

describe('Worker Entry Point (index.ts)', () => {
    const env = { TELEGRAM_BOT_TOKEN: 'test-token' } as any;

    it('responds with 200 on health check', async () => {
        const request = new Request('https://example.com/');
        const response = await worker.fetch(request, env, {} as any);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('is running');
    });

    it('processes webhook messages and uses ctx.waitUntil', async () => {
        const ctx = { waitUntil: vi.fn() } as any;
        const update = { message: { chat: { id: 123 }, text: '/start' } };
        const request = new Request('https://example.com/webhook', {
            method: 'POST',
            body: JSON.stringify(update),
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('OK');

        // Core Verification:
        // This would FAIL in the previous version because it was using a local mock ctx
        // instead of the one passed as the third argument to fetch.
        expect(ctx.waitUntil).toHaveBeenCalled();
        expect(handleMessage).toHaveBeenCalledWith(env, update.message);
    });

    it('processes callback queries and uses ctx.waitUntil', async () => {
        const ctx = { waitUntil: vi.fn() } as any;
        const update = { callback_query: { id: 'q123', data: 'btn1' } };
        const request = new Request('https://example.com/webhook', {
            method: 'POST',
            body: JSON.stringify(update),
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        expect(ctx.waitUntil).toHaveBeenCalled();
        expect(handleCallbackQuery).toHaveBeenCalledWith(env, update.callback_query);
    });

    it('handles setup-webhook endpoint', async () => {
        // Mock the global fetch for Telegram API call
        const mockResponse = new Response('{"ok":true}', { status: 200 });
        const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

        const request = new Request('https://example.com/setup-webhook');
        const response = await worker.fetch(request, env, {} as any);

        expect(response.status).toBe(200);
        expect(globalFetchSpy).toHaveBeenCalledWith(expect.stringContaining('setWebhook'));

        globalFetchSpy.mockRestore();
        globalFetchSpy.mockRestore();
    });

    it('handles handleMessage error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.mocked(handleMessage).mockRejectedValueOnce(new Error('Msg Error'));

        const ctx = { waitUntil: vi.fn((p) => p) } as any; // await the promise immediately
        const update = { message: { chat: { id: 123 }, text: '/start' } };
        const request = new Request('https://example.com/webhook', {
            method: 'POST',
            body: JSON.stringify(update),
        });

        await worker.fetch(request, env, ctx);
        // We need to wait for the promise passed to waitUntil to resolve/reject
        // verification depends on implementation.
        // The implementation catches error.

        // Since ctx.waitUntil is mocked to return the promise, we need to await it?
        // Actually, fetch returns before waitUntil promise settles.
        // BUT in test environment we might need to await it.
        // My mock: ctx.waitUntil = vi.fn((p) => p);
        // The fetch code: ctx.waitUntil(handleMessage(...).catch(...));

        // So we need to capture the promise passed to waitUntil.
        expect(ctx.waitUntil).toHaveBeenCalled();
        const promise = ctx.waitUntil.mock.calls[0][0];
        await promise;

        expect(consoleErrorSpy).toHaveBeenCalledWith('handleMessage error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('handles handleCallbackQuery error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.mocked(handleCallbackQuery).mockRejectedValueOnce(new Error('CB Error'));

        const ctx = { waitUntil: vi.fn((p) => p) } as any;
        const update = { callback_query: { id: 'q1', data: 'd' } };
        const request = new Request('https://example.com/webhook', {
            method: 'POST',
            body: JSON.stringify(update),
        });

        await worker.fetch(request, env, ctx);

        const promise = ctx.waitUntil.mock.calls[0][0];
        await promise;

        expect(consoleErrorSpy).toHaveBeenCalledWith('handleCallbackQuery error:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('handles Invalid JSON (Webhook error)', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const request = new Request('https://example.com/webhook', {
            method: 'POST',
            body: 'invalid-json',
        });

        const response = await worker.fetch(request, env, {} as any);
        expect(response.status).toBe(500);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Webhook error:', expect.any(Error));

        consoleErrorSpy.mockRestore();
    });

    it('handles unknown paths', async () => {
        const request = new Request('https://example.com/unknown');
        const response = await worker.fetch(request, env, {} as any);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe('Not Found');
    });
});
