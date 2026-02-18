import type { InlineKeyboardMarkup, InlineKeyboardButton } from '../types';

/**
 * Create a keyboard with a single row of buttons.
 */
export function inlineKeyboard(
    buttons: { text: string; data: string }[],
    columns: number = 2,
): InlineKeyboardMarkup {
    const rows: InlineKeyboardButton[][] = [];
    for (let i = 0; i < buttons.length; i += columns) {
        rows.push(
            buttons.slice(i, i + columns).map((b) => ({
                text: b.text,
                callback_data: b.data,
            })),
        );
    }
    return { inline_keyboard: rows };
}

/**
 * Welcome screen keyboard.
 */
export function welcomeKeyboard(): InlineKeyboardMarkup {
    return inlineKeyboard([
        { text: '📌 設定通勤路線', data: 'cmd:setup' },
        { text: '🔍 直接查公車', data: 'cmd:help_bus' },
    ]);
}

/**
 * Route selection keyboard (for sub-routes like 紅3).
 */
export function routeSelectionKeyboard(
    routes: { routeId: string; routeName: string }[],
): InlineKeyboardMarkup {
    return inlineKeyboard(
        routes.map((r) => ({
            text: r.routeName,
            data: `route:${r.routeId}`,
        })),
        1,
    );
}

/**
 * Direction toggle keyboard after query results.
 */
export function directionToggleKeyboard(
    currentCommute: 'toWork' | 'toHome',
): InlineKeyboardMarkup {
    const opposite = currentCommute === 'toWork' ? 'toHome' : 'toWork';
    const label = opposite === 'toWork' ? '🏢 查上班方向' : '🏠 查下班方向';
    return inlineKeyboard([{ text: `🔄 ${label}`, data: `toggle:${opposite}` }], 1);
}

/**
 * Route direction keyboard (去程/返程 for /bus query).
 */
export function routeDirectionKeyboard(routeId: string): InlineKeyboardMarkup {
    return inlineKeyboard([
        { text: '➡️ 去程', data: `busdir:${routeId}:0` },
        { text: '⬅️ 返程', data: `busdir:${routeId}:1` },
    ]);
}

/**
 * Stop selection keyboard for /setup flow.
 */
export function stopSelectionKeyboard(
    stops: { id: string; name: string }[],
    prefix: string,
): InlineKeyboardMarkup {
    const buttons = stops.slice(0, 20).map((s) => ({
        text: s.name,
        data: `${prefix}:${s.id}:${s.name}`,
    }));
    return inlineKeyboard(buttons, 1);
}

/**
 * Confirmation keyboard for setup.
 */
export function confirmKeyboard(): InlineKeyboardMarkup {
    return inlineKeyboard([
        { text: '✅ 確認儲存', data: 'setup:confirm' },
        { text: '❌ 重新設定', data: 'setup:restart' },
    ]);
}
