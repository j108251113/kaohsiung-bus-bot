import type { Env, TelegramUpdate } from './types';
import { handleMessage, handleCallbackQuery } from './bot/commands';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Health check endpoint
        if (url.pathname === '/' && request.method === 'GET') {
            return new Response('🚌 高雄公車到站查詢 Bot is running!', {
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        // Telegram webhook endpoint
        if (url.pathname === '/webhook' && request.method === 'POST') {
            try {
                const update = await request.json() as TelegramUpdate;

                if (update.message) {
                    ctx.waitUntil(handleMessage(env, update.message));
                } else if (update.callback_query) {
                    ctx.waitUntil(handleCallbackQuery(env, update.callback_query));
                }

                return new Response('OK', { status: 200 });
            } catch (err) {
                console.error('Webhook error:', err);
                return new Response('Internal Error', { status: 500 });
            }
        }

        // Setup webhook helper endpoint (for convenience)
        if (url.pathname === '/setup-webhook' && request.method === 'GET') {
            const token = env.TELEGRAM_BOT_TOKEN;
            if (!token) {
                return new Response('TELEGRAM_BOT_TOKEN not set', { status: 500 });
            }

            const webhookUrl = `${url.origin}/webhook`;
            const resp = await fetch(
                `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
            );
            const result = await resp.text();

            return new Response(
                `Setting webhook to: ${webhookUrl}\n\nTelegram response:\n${result}`,
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                },
            );
        }

        return new Response('Not Found', { status: 404 });
    },
};
