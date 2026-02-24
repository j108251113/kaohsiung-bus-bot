import { describe, it, expect } from 'vitest';
import {
    inlineKeyboard,
    welcomeKeyboard,
    routeSelectionKeyboard,
    directionToggleKeyboard,
    routeDirectionKeyboard,
    stopSelectionKeyboard,
    confirmKeyboard,
    refreshBusKeyboard,
} from './keyboard';

describe('inlineKeyboard', () => {
    it('creates rows with specified columns', () => {
        const buttons = [
            { text: 'A', data: 'a' },
            { text: 'B', data: 'b' },
            { text: 'C', data: 'c' },
        ];

        const kb = inlineKeyboard(buttons, 2);
        expect(kb.inline_keyboard).toHaveLength(2);
        expect(kb.inline_keyboard[0]).toHaveLength(2);
        expect(kb.inline_keyboard[1]).toHaveLength(1);
    });

    it('creates single-column layout', () => {
        const buttons = [
            { text: 'A', data: 'a' },
            { text: 'B', data: 'b' },
        ];

        const kb = inlineKeyboard(buttons, 1);
        expect(kb.inline_keyboard).toHaveLength(2);
        expect(kb.inline_keyboard[0]).toHaveLength(1);
    });

    it('maps text and callback_data correctly', () => {
        const kb = inlineKeyboard([{ text: '按鈕', data: 'action:1' }], 1);
        expect(kb.inline_keyboard[0][0]).toEqual({
            text: '按鈕',
            callback_data: 'action:1',
        });
    });
});

describe('welcomeKeyboard', () => {
    it('has two buttons', () => {
        const kb = welcomeKeyboard();
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(2);
        expect(allButtons[0].callback_data).toBe('cmd:setup');
        expect(allButtons[1].callback_data).toBe('cmd:help_bus');
    });
});

describe('routeSelectionKeyboard', () => {
    it('creates one button per route', () => {
        const routes = [
            { routeId: '211', routeName: '紅3林園幹線' },
            { routeId: '2111', routeName: '紅3延駛' },
            { routeId: '2112', routeName: '紅3鳳林接駁' },
        ];

        const kb = routeSelectionKeyboard(routes);
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(3);
        expect(allButtons[0].callback_data).toBe('route:211');
        expect(allButtons[1].text).toBe('紅3延駛');
    });
});

describe('directionToggleKeyboard', () => {
    it('shows 下班 toggle when currently toWork', () => {
        const kb = directionToggleKeyboard('toWork');
        const allButtons = kb.inline_keyboard.flat();
        const toggleBtn = allButtons.find((b) => b.callback_data === 'toggle:toHome');
        expect(toggleBtn).toBeDefined();
        expect(toggleBtn!.text).toContain('下班');
    });

    it('shows 上班 toggle when currently toHome', () => {
        const kb = directionToggleKeyboard('toHome');
        const allButtons = kb.inline_keyboard.flat();
        const toggleBtn = allButtons.find((b) => b.callback_data === 'toggle:toWork');
        expect(toggleBtn).toBeDefined();
        expect(toggleBtn!.text).toContain('上班');
    });

    it('includes a refresh button with correct callback for toWork', () => {
        const kb = directionToggleKeyboard('toWork');
        const allButtons = kb.inline_keyboard.flat();
        const refreshBtn = allButtons.find((b) => b.callback_data === 'refresh:commute:toWork');
        expect(refreshBtn).toBeDefined();
        expect(refreshBtn!.text).toContain('🔄');
    });

    it('includes a refresh button with correct callback for toHome', () => {
        const kb = directionToggleKeyboard('toHome');
        const allButtons = kb.inline_keyboard.flat();
        const refreshBtn = allButtons.find((b) => b.callback_data === 'refresh:commute:toHome');
        expect(refreshBtn).toBeDefined();
        expect(refreshBtn!.text).toContain('🔄');
    });

    it('has exactly 2 buttons total', () => {
        const kb = directionToggleKeyboard('toWork');
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(2);
    });
});

describe('refreshBusKeyboard', () => {
    it('includes a refresh button with correct callback', () => {
        const kb = refreshBusKeyboard('211', 0);
        const allButtons = kb.inline_keyboard.flat();
        const refreshBtn = allButtons.find((b) => b.callback_data === 'refresh:bus:211:0');
        expect(refreshBtn).toBeDefined();
        expect(refreshBtn!.text).toContain('🔄');
    });

    it('includes the opposite direction button for 去程 (dir 0)', () => {
        const kb = refreshBusKeyboard('211', 0);
        const allButtons = kb.inline_keyboard.flat();
        const dirBtn = allButtons.find((b) => b.callback_data === 'busdir:211:1');
        expect(dirBtn).toBeDefined();
        expect(dirBtn!.text).toContain('返程');
    });

    it('includes the opposite direction button for 返程 (dir 1)', () => {
        const kb = refreshBusKeyboard('211', 1);
        const allButtons = kb.inline_keyboard.flat();
        const dirBtn = allButtons.find((b) => b.callback_data === 'busdir:211:0');
        expect(dirBtn).toBeDefined();
        expect(dirBtn!.text).toContain('去程');
    });

    it('has exactly 2 buttons total', () => {
        const kb = refreshBusKeyboard('211', 0);
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(2);
    });
});

describe('routeDirectionKeyboard', () => {
    it('has 去程 and 返程 buttons', () => {
        const kb = routeDirectionKeyboard('211');
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(2);
        expect(allButtons[0].callback_data).toBe('busdir:211:0');
        expect(allButtons[1].callback_data).toBe('busdir:211:1');
    });
});

describe('stopSelectionKeyboard', () => {
    it('limits to 20 stops', () => {
        const stops = Array.from({ length: 30 }, (_, i) => ({
            id: `stop${i}`,
            name: `站牌${i}`,
        }));

        const kb = stopSelectionKeyboard(stops, 'home');
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(20);
    });

    it('uses correct callback prefix', () => {
        const stops = [{ id: '10001', name: '鳳鼻頭' }];
        const kb = stopSelectionKeyboard(stops, 'work');
        const btn = kb.inline_keyboard[0][0];
        expect(btn.callback_data).toBe('work:10001:鳳鼻頭');
    });
});

describe('confirmKeyboard', () => {
    it('has confirm and restart buttons', () => {
        const kb = confirmKeyboard();
        const allButtons = kb.inline_keyboard.flat();
        expect(allButtons).toHaveLength(2);
        expect(allButtons[0].callback_data).toBe('setup:confirm');
        expect(allButtons[1].callback_data).toBe('setup:restart');
    });
});
