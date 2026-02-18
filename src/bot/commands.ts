import type { Env, TelegramMessage, TelegramCallbackQuery, InlineKeyboardMarkup } from '../types';
import { searchRoutes, findRoutesByMasterName, getStops, searchStops, findRoutesConnecting } from '../api/citygpt';
import { getEstimateTime } from '../api/ibus';
import { getUserSetting, saveUserSetting, deleteUserSetting, getSetupState, saveSetupState, clearSetupState } from '../store/user';
import { getCurrentCommute, getCommuteDirection, getCommuteLabel, getOppositeCommute, getCommuteStops } from '../utils/direction';
import { formatCommuteArrival, formatRouteArrival } from '../utils/format';
import {
    welcomeKeyboard,
    routeSelectionKeyboard,
    routeDirectionKeyboard,
    directionToggleKeyboard,
    stopSelectionKeyboard,
    confirmKeyboard,
} from './keyboard';

/**
 * Send a text message via Telegram Bot API.
 */
async function sendMessage(
    token: string,
    chatId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    console.log(`Sending message to ${chatId}: ${text.slice(0, 50)}...`);
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
            parse_mode: undefined,
        }),
    });
    if (!resp.ok) {
        console.error(`Telegram API error: ${resp.status} ${await resp.text()}`);
    }
}

/**
 * Answer a callback query (removes loading spinner).
 */
async function answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
): Promise<void> {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text,
        }),
    });
}

/**
 * Handle incoming text messages (commands).
 */
export async function handleMessage(
    env: Env,
    message: TelegramMessage,
): Promise<void> {
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const token = env.TELEGRAM_BOT_TOKEN;

    console.log(`Received message from ${chatId}: "${text}"`);

    // Parse command
    if (text === '/start') {
        return handleStart(token, chatId);
    }
    if (text === '/help') {
        return handleHelp(token, chatId);
    }
    if (text.startsWith('/bus')) {
        return handleBus(token, chatId, text);
    }
    if (text === '/go') {
        return handleGo(env, chatId, 'auto');
    }
    if (text === '/back') {
        return handleGo(env, chatId, 'opposite');
    }
    if (text === '/setup') {
        return handleSetupStart(env, chatId);
    }
    if (text === '/list') {
        return handleList(env, chatId);
    }
    if (text === '/delete') {
        return handleDelete(env, chatId);
    }

    // Check if user is in setup flow (typed a stop name)
    const setupState = await getSetupState(env.USER_SETTINGS, chatId);
    console.log(`Current setup state for ${chatId}:`, setupState);
    if (setupState) {
        return handleSetupTextInput(env, chatId, text);
    }

    // Unknown command
    console.log(`Unknown command from ${chatId}: ${text}`);
    await sendMessage(token, chatId, '🤔 看不懂你的指令\n\n輸入 /help 查看使用說明');
}

/**
 * Handle callback queries (inline keyboard button presses).
 */
export async function handleCallbackQuery(
    env: Env,
    query: TelegramCallbackQuery,
): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId || !query.data) return;

    const token = env.TELEGRAM_BOT_TOKEN;
    const data = query.data;

    await answerCallbackQuery(token, query.id);

    // Route selected from /bus sub-route list
    if (data.startsWith('route:')) {
        const routeId = data.replace('route:', '');
        return handleBusRouteSelected(token, chatId, routeId);
    }

    // Bus direction selected (去程/返程)
    if (data.startsWith('busdir:')) {
        const [, routeId, dir] = data.split(':');
        return handleBusDirection(token, chatId, routeId, parseInt(dir));
    }

    // Toggle commute direction
    if (data.startsWith('toggle:')) {
        const commute = data.replace('toggle:', '') as 'toWork' | 'toHome';
        return handleGoWithDirection(env, chatId, commute);
    }

    // Setup flow: home stop selected
    if (data.startsWith('home:')) {
        const [, stopId, stopName] = data.split(':');
        return handleSetupHomeSelected(env, chatId, stopId, stopName);
    }

    // Setup flow: work stop selected
    if (data.startsWith('work:')) {
        const [, stopId, stopName] = data.split(':');
        return handleSetupWorkSelected(env, chatId, stopId, stopName);
    }

    // Setup flow: confirm / restart
    if (data === 'setup:confirm') {
        return handleSetupConfirm(env, chatId);
    }
    if (data === 'setup:restart') {
        return handleSetupStart(env, chatId);
    }

    // Welcome keyboard shortcuts
    if (data === 'cmd:setup') {
        return handleSetupStart(env, chatId);
    }
    if (data === 'cmd:help_bus') {
        await sendMessage(token, chatId, '🔍 直接輸入路線名稱查詢：\n\n/bus 紅3\n/bus 紅28\n/bus 0南\n/bus 248');
        return;
    }
}

// ── Command Handlers ──

async function handleStart(token: string, chatId: number): Promise<void> {
    const text = [
        '👋 歡迎使用高雄公車到站查詢 Bot！',
        '',
        '🚌 我可以幫你即時查詢高雄市公車到站時間',
        '📱 純文字回覆，限速時也能秒開',
        '',
        '你想怎麼開始？',
    ].join('\n');

    await sendMessage(token, chatId, text, welcomeKeyboard());
}

async function handleHelp(token: string, chatId: number): Promise<void> {
    const text = [
        '📖 使用說明',
        '',
        '🔍 即時查詢：',
        '/bus 紅3 — 查某路線到站時間',
        '',
        '🚶 通勤模式（需先設定）：',
        '/setup — 設定上下車站牌',
        '/go — 查詢到站（自動判斷上下班）',
        '/back — 查詢反方向',
        '',
        '⚙️ 管理：',
        '/list — 查看已儲存的設定',
        '/delete — 刪除所有個人設定',
        '/help — 顯示此說明',
    ].join('\n');

    await sendMessage(token, chatId, text);
}

async function handleBus(
    token: string,
    chatId: number,
    text: string,
): Promise<void> {
    const keyword = text.replace(/^\/bus\s*/, '').trim();

    if (!keyword) {
        await sendMessage(token, chatId, '請輸入路線名稱，例如：\n/bus 紅3\n/bus 紅28\n/bus 0南');
        return;
    }

    try {
        const routes = await searchRoutes(keyword);

        if (routes.length === 0) {
            await sendMessage(token, chatId, `❌ 找不到「${keyword}」相關路線\n\n請確認路線名稱後重試`);
            return;
        }

        if (routes.length === 1) {
            // Single match → ask direction
            return handleBusRouteSelected(token, chatId, routes[0].routeid);
        }

        // Multiple matches → show selection
        // Check if they share the same master route name
        const masterNames = new Set(routes.map((r) => r.masterroutename || r.routename_zh_tw));
        if (masterNames.size === 1 && routes.length <= 10) {
            // Same family (e.g., 紅3 variants)
            await sendMessage(
                token,
                chatId,
                `🚌「${keyword}」有 ${routes.length} 個子路線，請選擇：`,
                routeSelectionKeyboard(
                    routes.map((r) => ({ routeId: r.routeid, routeName: r.routename_zh_tw })),
                ),
            );
        } else {
            // Different routes (e.g., "紅" matches 紅3, 紅28, etc.)
            const display = routes.slice(0, 15);
            await sendMessage(
                token,
                chatId,
                `🔍 找到 ${routes.length} 條路線，請選擇：`,
                routeSelectionKeyboard(
                    display.map((r) => ({ routeId: r.routeid, routeName: r.routename_zh_tw })),
                ),
            );
        }
    } catch (err) {
        await sendMessage(token, chatId, '⚠️ 查詢失敗，請稍後再試');
    }
}

async function handleBusRouteSelected(
    token: string,
    chatId: number,
    routeId: string,
): Promise<void> {
    await sendMessage(
        token,
        chatId,
        '請選擇方向：',
        routeDirectionKeyboard(routeId),
    );
}

async function handleBusDirection(
    token: string,
    chatId: number,
    routeId: string,
    direction: number,
): Promise<void> {
    try {
        const arrivals = await getEstimateTime([{ id: routeId, direction }]);

        // Get route name
        const routes = await searchRoutes('');
        const route = routes.find((r) => r.routeid === routeId);
        const routeName = route?.routename_zh_tw || `路線 ${routeId}`;

        const filtered = arrivals.filter(
            (a) => a.routeid === routeId && a.direction === direction,
        );

        const msg = formatRouteArrival(routeName, filtered, direction);
        const otherDir = direction === 0 ? 1 : 0;
        const keyboard = routeDirectionKeyboard(routeId);
        await sendMessage(token, chatId, msg, keyboard);
    } catch (err) {
        await sendMessage(token, chatId, '⚠️ 查詢失敗，請稍後再試');
    }
}

// ── Commute Handlers ──

async function handleGo(
    env: Env,
    chatId: number,
    mode: 'auto' | 'opposite',
): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const setting = await getUserSetting(env.USER_SETTINGS, chatId);

    if (!setting) {
        await sendMessage(
            token,
            chatId,
            '⚠️ 尚未設定通勤路線\n\n請先使用 /setup 設定你的上下車站牌',
        );
        return;
    }

    let commute = getCurrentCommute(setting);
    if (mode === 'opposite') {
        commute = getOppositeCommute(commute);
    }

    return handleGoWithDirection(env, chatId, commute);
}

async function handleGoWithDirection(
    env: Env,
    chatId: number,
    commute: 'toWork' | 'toHome',
): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const setting = await getUserSetting(env.USER_SETTINGS, chatId);
    if (!setting) return;

    try {
        const { origin, destination } = getCommuteStops(setting, commute);

        // Build API requests for all matched routes
        const requests = setting.matchedRoutes.map((route) => ({
            id: route.routeId,
            direction: getCommuteDirection(route, commute),
        }));

        const arrivals = await getEstimateTime(requests);
        const label = getCommuteLabel(commute);

        const msg = formatCommuteArrival(
            arrivals,
            origin,
            destination,
            setting.matchedRoutes,
            label,
        );

        await sendMessage(token, chatId, msg, directionToggleKeyboard(commute));
    } catch (err) {
        await sendMessage(token, chatId, '⚠️ 查詢失敗，請稍後再試');
    }
}

// ── Setup Flow Handlers ──

async function handleSetupStart(env: Env, chatId: number): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;

    await saveSetupState(env.USER_SETTINGS, chatId, {
        step: 'select_home',
    });

    await sendMessage(
        token,
        chatId,
        '📌 設定通勤路線\n\n步驟 1/2：請輸入你的 🏠 上車站牌名稱\n（輸入部分名稱即可，例如「鳳鼻頭」或「小港站」）',
    );
}

async function handleSetupTextInput(
    env: Env,
    chatId: number,
    text: string,
): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const state = await getSetupState(env.USER_SETTINGS, chatId);
    if (!state) return;

    if (state.step === 'select_home') {
        // Search for stops matching the user's input
        try {
            const stops = await searchStops(text);
            if (stops.length === 0) {
                await sendMessage(token, chatId, `❌ 找不到「${text}」相關站牌\n\n請重新輸入站牌名稱`);
                return;
            }

            await sendMessage(
                token,
                chatId,
                `🔍 找到 ${stops.length} 個相關站牌，請選擇你的 🏠 上車站：`,
                stopSelectionKeyboard(stops, 'home'),
            );
        } catch {
            await sendMessage(token, chatId, '⚠️ 查詢站牌失敗，請稍後再試');
        }
    } else if (state.step === 'select_work') {
        try {
            const stops = await searchStops(text);
            if (stops.length === 0) {
                await sendMessage(token, chatId, `❌ 找不到「${text}」相關站牌\n\n請重新輸入站牌名稱`);
                return;
            }

            await sendMessage(
                token,
                chatId,
                `🔍 找到 ${stops.length} 個相關站牌，請選擇你的 🏢 下車站：`,
                stopSelectionKeyboard(stops, 'work'),
            );
        } catch {
            await sendMessage(token, chatId, '⚠️ 查詢站牌失敗，請稍後再試');
        }
    }
}

async function handleSetupHomeSelected(
    env: Env,
    chatId: number,
    stopId: string,
    stopName: string,
): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;

    await saveSetupState(env.USER_SETTINGS, chatId, {
        step: 'select_work',
        homeStop: { id: stopId, name: stopName },
    });

    await sendMessage(
        token,
        chatId,
        `✅ 上車站：${stopName}\n\n步驟 2/2：請輸入你的 🏢 下車站牌名稱`,
    );
}

async function handleSetupWorkSelected(
    env: Env,
    chatId: number,
    stopId: string,
    stopName: string,
): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const state = await getSetupState(env.USER_SETTINGS, chatId);
    if (!state || !state.homeStop) {
        await sendMessage(token, chatId, '⚠️ 設定階段已逾時，請重新 /setup');
        return;
    }

    await sendMessage(token, chatId, '🔍 正在搜尋經過這兩站的路線...');

    try {
        const matchedRoutes = await findRoutesConnecting(
            state.homeStop.name,
            stopName,
        );

        if (matchedRoutes.length === 0) {
            await sendMessage(
                token,
                chatId,
                `❌ 找不到同時經過「${state.homeStop.name}」和「${stopName}」的路線\n\n請確認站牌名稱後重新 /setup`,
            );
            await clearSetupState(env.USER_SETTINGS, chatId);
            return;
        }

        // Update setup state with work stop
        await saveSetupState(env.USER_SETTINGS, chatId, {
            step: 'confirm',
            homeStop: state.homeStop,
            workStop: { id: stopId, name: stopName },
        });

        const routeList = matchedRoutes
            .map((r) => `  🚌 ${r.routeName}`)
            .join('\n');

        await sendMessage(
            token,
            chatId,
            [
                '📋 設定確認',
                '',
                `🏠 上車站：${state.homeStop.name}`,
                `🏢 下車站：${stopName}`,
                '',
                `找到 ${matchedRoutes.length} 條路線：`,
                routeList,
                '',
                '確認要儲存嗎？',
            ].join('\n'),
            confirmKeyboard(),
        );

        // Temporarily store matched routes for confirmation
        await saveSetupState(env.USER_SETTINGS, chatId, {
            step: 'confirm',
            homeStop: state.homeStop,
            workStop: { id: stopId, name: stopName },
            searchResults: matchedRoutes.map((r) => ({
                id: r.routeId,
                name: r.routeName,
                routeId: r.routeId,
            })),
        });
    } catch {
        await sendMessage(token, chatId, '⚠️ 搜尋路線失敗，請稍後再試');
    }
}

async function handleSetupConfirm(env: Env, chatId: number): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const state = await getSetupState(env.USER_SETTINGS, chatId);

    if (!state || !state.homeStop || !state.workStop) {
        await sendMessage(token, chatId, '⚠️ 設定階段已逾時，請重新 /setup');
        return;
    }

    try {
        // Re-find routes to ensure fresh data
        const matchedRoutes = await findRoutesConnecting(
            state.homeStop.name,
            state.workStop.name,
        );

        const setting = {
            homeStop: state.homeStop,
            workStop: state.workStop,
            matchedRoutes,
            switchHour: 12,
        };

        await saveUserSetting(env.USER_SETTINGS, chatId, setting);
        await clearSetupState(env.USER_SETTINGS, chatId);

        await sendMessage(token, chatId, [
            '✅ 設定完成！',
            '',
            `🏠 ${state.homeStop.name} ↔ 🏢 ${state.workStop.name}`,
            '',
            '現在你可以用：',
            '/go — 查詢到站（自動判斷上下班方向）',
            '/back — 查詢反方向',
        ].join('\n'));
    } catch {
        await sendMessage(token, chatId, '⚠️ 儲存失敗，請重新 /setup');
    }
}

// ── Management Handlers ──

async function handleList(env: Env, chatId: number): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const setting = await getUserSetting(env.USER_SETTINGS, chatId);

    if (!setting) {
        await sendMessage(token, chatId, '📋 尚未設定通勤路線\n\n使用 /setup 開始設定');
        return;
    }

    const routeList = setting.matchedRoutes
        .map((r) => `  🚌 ${r.routeName}`)
        .join('\n');

    await sendMessage(token, chatId, [
        '📋 目前的通勤設定',
        '',
        `🏠 上車站：${setting.homeStop.name}`,
        `🏢 下車站：${setting.workStop.name}`,
        `⏰ 切換時間：${setting.switchHour}:00（之前=上班，之後=下班）`,
        '',
        `匹配路線（${setting.matchedRoutes.length} 條）：`,
        routeList,
    ].join('\n'));
}

async function handleDelete(env: Env, chatId: number): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    await deleteUserSetting(env.USER_SETTINGS, chatId);
    await sendMessage(token, chatId, '🗑️ 已刪除所有個人設定\n\n使用 /setup 重新設定');
}
