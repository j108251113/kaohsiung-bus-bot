import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMessage, handleCallbackQuery } from './commands';
import * as citygpt from '../api/citygpt';
import * as ibus from '../api/ibus';
import * as userStore from '../store/user';
import * as ratelimit from '../utils/ratelimit';
import { welcomeKeyboard } from './keyboard';

// Mock dependencies
vi.mock('../api/citygpt');
vi.mock('../api/ibus');
vi.mock('../store/user');
vi.mock('../utils/ratelimit');

// Mock global fetch
const globalFetch = vi.fn();
vi.stubGlobal('fetch', globalFetch);

describe('Bot Commands', () => {
    const env = {
        TELEGRAM_BOT_TOKEN: 'test-token',
        USER_SETTINGS: {} as any,
        BOT_NAME: 'Test Bot'
    };
    const chatId = 123;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T02:00:00.000Z')); // UTC 02:00 = Taiwan 10:00 → toWork
        globalFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true }),
        });
        vi.mocked(ratelimit.checkRateLimit).mockResolvedValue(true);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handleMessage', () => {
        it('should ignore non-text messages', async () => {
            await handleMessage(env, { chat: { id: chatId } } as any);
            expect(globalFetch).not.toHaveBeenCalled();
        });

        it('should ignore messages if rate limit exceeded', async () => {
            vi.mocked(ratelimit.checkRateLimit).mockResolvedValue(false);
            await handleMessage(env, { chat: { id: chatId }, text: '/start' } as any);
            expect(globalFetch).not.toHaveBeenCalled();
            expect(ratelimit.checkRateLimit).toHaveBeenCalledWith(expect.anything(), chatId, 20);
        });

        it('should handle /start', async () => {
            await handleMessage(env, { chat: { id: chatId }, text: '/start' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('歡迎使用')
                })
            );
        });

        it('should handle /help', async () => {
            await handleMessage(env, { chat: { id: chatId }, text: '/help' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('使用說明')
                })
            );
        });

        it('should log error on sendMessage failure', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            globalFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            });
            await handleMessage(env, { chat: { id: chatId }, text: '/help' } as any);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Telegram API error: 500 Internal Server Error'));
            consoleErrorSpy.mockRestore();
        });

        it('should handle /setup', async () => {
            vi.mocked(userStore.saveSetupState).mockResolvedValue();
            await handleMessage(env, { chat: { id: chatId }, text: '/setup' } as any);
            expect(userStore.saveSetupState).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('步驟 1/2')
                })
            );
        });

        it('should handle /list (empty)', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue(null);
            await handleMessage(env, { chat: { id: chatId }, text: '/list' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('尚未設定')
                })
            );
        });

        it('should handle /list (configured)', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [],
                switchHour: 12
            });
            await handleMessage(env, { chat: { id: chatId }, text: '/list' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Home')
                })
            );
        });

        it('should handle /delete', async () => {
            await handleMessage(env, { chat: { id: chatId }, text: '/delete' } as any);
            expect(userStore.deleteUserSetting).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('已刪除')
                })
            );
        });

        it('should handle unknown command', async () => {
            await handleMessage(env, { chat: { id: chatId }, text: 'hello' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('看不懂你的指令')
                })
            );
        });

        it('should handle /bus command (single match)', async () => {
            // Mock searchRoutes
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: 'Red 1', masterroutename: 'Red' }
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: '/bus Red' } as any);

            expect(citygpt.searchRoutes).toHaveBeenCalledWith('Red');
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('請選擇方向')
                })
            );
        });
    });

    describe('Commute Handlers (/go)', () => {
        it('should handle /go when setting is null', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue(null);
            await handleMessage(env, { chat: { id: chatId }, text: '/go' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('尚未設定')
                })
            );
        });

        it('should handle toggle callback when setting is unexpectedly null', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue(null);
            const query = {
                id: 'q1',
                data: 'toggle:toWork',
                message: { chat: { id: chatId } }
            } as any;
            await handleCallbackQuery(env, query);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找不到你的設定資料')
                })
            );
        });

        it('should handle /go when matchedRoutes is empty', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [],
                switchHour: 12
            });
            await handleMessage(env, { chat: { id: chatId }, text: '/go' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('目前沒有符合的路線資料')
                })
            );
        });

        it('should handle /go API failure in handleGoWithDirection', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
                switchHour: 12
            });
            vi.mocked(ibus.getEstimateTime).mockRejectedValue(new Error('API Failure'));
            await handleMessage(env, { chat: { id: chatId }, text: '/go' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('查詢失敗\\n\\n原因: API Failure')
                })
            );
        });

        it('should handle /go when everything is ok', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
                switchHour: 12
            });
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '1', estimatetime: 5, routeid: 'R1', direction: 0, stopname: 'Home' } as any
            ]);
            await handleMessage(env, { chat: { id: chatId }, text: '/go' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Route 1')
                })
            );
        });

        it('should handle /back when everything is ok', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
                switchHour: 12
            });
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '2', estimatetime: 15, routeid: 'R1', direction: 1, stopname: 'Work' } as any
            ]);
            await handleMessage(env, { chat: { id: chatId }, text: '/back' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Route 1')
                })
            );
        });
    });

    describe('handleBus logic', () => {
        it('should prompt if no keyword provided', async () => {
            await handleMessage(env, { chat: { id: chatId }, text: '/bus' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('請輸入路線名稱')
                })
            );
        });

        it('should show "not found" if no routes', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([]);
            await handleMessage(env, { chat: { id: chatId }, text: '/bus 999' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找不到')
                })
            );
        });

        it('should handle API failures in handleBus', async () => {
            vi.mocked(citygpt.searchRoutes).mockRejectedValueOnce(new Error('API Error'));
            await handleMessage(env, { chat: { id: chatId }, text: '/bus Red' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('查詢失敗，請稍後再試')
                })
            );
        });

        it('should handle multiple matches with different master names', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: 'Red 1' } as any, // missing masterroutename triggers fallback
                { routeid: '2', routename_zh_tw: 'Blue 1', masterroutename: 'Blue' } as any
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: '/bus Color' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找到 2 條路線')
                })
            );
        });

        it('should group routes by master name', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: 'Red 1', masterroutename: 'Red' },
                { routeid: '2', routename_zh_tw: 'Red 2', masterroutename: 'Red' }
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: '/bus Red' } as any);

            // Should show buttons for master route "Red"
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('個子路線')
                })
            );
            // Verify Red 1 is in the body string (inside inline_keyboard structure)
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Red 1')
                })
            );
        });

        it('should NOT group routes as sub-routes when masterroutename equals routename_zh_tw (bug fix)', async () => {
            // Bug scenario: routes have masterroutename === routename_zh_tw.
            // They should be displayed as separate route choices, not as a "sub-route family".
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: '紅3', masterroutename: '紅3' },
                { routeid: '2', routename_zh_tw: '紅3延駛', masterroutename: '紅3延駛' }
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: '/bus 紅3' } as any);

            // Should NOT show 子路線 (sub-route grouping)
            const callArgs = globalFetch.mock.calls.find(
                (call) => call[0].includes('/sendMessage')
            );
            expect(callArgs).toBeDefined();
            const body = JSON.parse(callArgs![1].body);
            expect(body.text).not.toContain('子路線');
            // Should show "找到 N 條路線" or direct direction selector
            expect(body.text).toContain('找到 2 條路線');
        });
    });

    describe('Callback Queries', () => {
        it('should limit rate for callback query', async () => {
            vi.mocked(ratelimit.checkRateLimit).mockResolvedValueOnce(false);
            const query = {
                id: 'q1',
                data: 'route:1',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/answerCallbackQuery'),
                expect.objectContaining({
                    body: expect.stringContaining('操作太頻繁')
                })
            );
            expect(ratelimit.checkRateLimit).toHaveBeenCalledWith(expect.anything(), chatId, 30);
        });

        it('should handle route selection (route:ID)', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: 'R1' } as any
            ]);

            // handleBusRouteSelected calls routeDirectionKeyboard(routeId)
            // It sends "請選擇方向："

            const query = {
                id: 'q1',
                data: 'route:1',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('選擇方向')
                })
            );
        });

        it('should handle direction selection (busdir:ID:Dir)', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '1', routename_zh_tw: 'R1' } as any
            ]);
            vi.mocked(citygpt.getStops).mockResolvedValue([
                { stopid: '1', stopname_zh_tw: 'Stop 1' } as any
            ]);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '1', estimatetime: 5, routeid: '1', direction: 0, stopname: 'Stop 1' } as any
            ]);

            const query = {
                id: 'q1',
                data: 'busdir:1:0',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(ibus.getEstimateTime).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Stop 1')
                })
            );
        });

        it('should unknown callback data', async () => {
            const query = {
                id: 'q1',
                data: 'unknown',
                message: { chat: { id: chatId } }
            } as any;
            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/answerCallbackQuery'),
                expect.anything()
            );
        });

        it('should handle cmd:help_bus callback shortcut', async () => {
            const query = {
                id: 'q1',
                data: 'cmd:help_bus',
                message: { chat: { id: chatId } }
            } as any;
            await handleCallbackQuery(env, query);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('直接輸入路線名稱查詢')
                })
            );
        });

        it('should handle cmd:setup callback shortcut', async () => {
            vi.mocked(userStore.saveSetupState).mockResolvedValue();
            const query = {
                id: 'q1',
                data: 'cmd:setup',
                message: { chat: { id: chatId } }
            } as any;
            await handleCallbackQuery(env, query);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('步驟 1/2')
                })
            );
        });
    });
    describe('Setup Flow Text Input', () => {
        it('should handle stop search input (step: select_home)', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({ step: 'select_home' });
            vi.mocked(citygpt.searchStops).mockResolvedValue([
                { id: 'S1', name: 'Stop A' } as any
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: 'Stop' } as any);

            expect(citygpt.searchStops).toHaveBeenCalledWith('Stop');
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('選擇你的 🏠 上車站')
                })
            );
        });

        it('should handle stop search not found', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({ step: 'select_home' });
            vi.mocked(citygpt.searchStops).mockResolvedValue([]);

            await handleMessage(env, { chat: { id: chatId }, text: 'Unknown' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找不到')
                })
            );
        });

        it('should handle stop search input (step: select_work)', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });
            vi.mocked(citygpt.searchStops).mockResolvedValue([
                { id: 'S2', name: 'Stop B' } as any
            ]);

            await handleMessage(env, { chat: { id: chatId }, text: 'Stop' } as any);

            expect(citygpt.searchStops).toHaveBeenCalledWith('Stop');
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('選擇你的 🏢 下車站')
                })
            );
        });

        it('should handle stop search error (step: select_home)', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({ step: 'select_home' });
            vi.mocked(citygpt.searchStops).mockRejectedValue(new Error('API Error'));

            await handleMessage(env, { chat: { id: chatId }, text: 'Stop' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('查詢站牌失敗')
                })
            );
        });

        it('should handle stop search error (step: select_work)', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });
            vi.mocked(citygpt.searchStops).mockRejectedValue(new Error('API Error'));

            await handleMessage(env, { chat: { id: chatId }, text: 'Stop' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('查詢站牌失敗')
                })
            );
        });
    });

    describe('Setup Flow Error Cases', () => {
        it('should handle timeout/missing state in work selection', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue(null);

            const query = {
                id: 'q1',
                data: 'work:S2:Work',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('已逾時')
                })
            );
        });

        it('should handle no connecting routes found', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });
            vi.mocked(citygpt.findRoutesConnecting).mockResolvedValue([]);

            const query = {
                id: 'q1',
                data: 'work:S2:Work', // User selected Work stop
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(citygpt.findRoutesConnecting).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找不到同時經過')
                })
            );
            expect(userStore.clearSetupState).toHaveBeenCalled();
        });

        it('should handle API failure in work selection', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });
            vi.mocked(citygpt.findRoutesConnecting).mockRejectedValue(new Error('API Error'));

            const query = {
                id: 'q1',
                data: 'work:S2:Work',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('搜尋路線失敗')
                })
            );
        });

        it('should handle missing state in confirm', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue(null);

            const query = {
                id: 'q1',
                data: 'setup:confirm',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('已逾時')
                })
            );
        });

        it('should handle save failure in confirm', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'confirm',
                homeStop: { id: 'S1', name: 'Home' },
                workStop: { id: 'S2', name: 'Work' }
            });
            vi.mocked(citygpt.findRoutesConnecting).mockResolvedValue([]);
            vi.mocked(userStore.saveUserSetting).mockRejectedValue(new Error('Save failed'));

            const query = {
                id: 'q1',
                data: 'setup:confirm',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('儲存失敗')
                })
            );
        });

        it('should handle API failure in /go direction query', async () => {
            // Mock handleGoWithDirection
            // It calls: ibus.getEstimateTime
            vi.mocked(ibus.getEstimateTime).mockRejectedValue(new Error('API Error'));

            // We need to trigger handleGoWithDirection indirectly or directly?
            // It's not exported. It's called by handleBusDirection or handleGo.
            // Let's use handleBusDirection with callback 'busdir:...'

            const query = {
                id: 'q1',
                data: 'busdir:R1:0',
                message: { chat: { id: chatId } }
            } as any;

            // Mock getStops to pass the first check
            vi.mocked(citygpt.getStops).mockResolvedValue([{ stopid: 'S1', stopname_zh_tw: 'Stop1' } as any]);

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('查詢失敗')
                })
            );
        });
    });

    // Test implicitly covered by Setup Flow Text Input, but ensuring select_work coverage
    // ... (Already added in previous step under Setup Flow Text Input) checked: yes, select_work input is there.
    // What is missing in commands.ts coverage?
    // Lines 376-378: catch block in handleGoWithDirection.
    // The above test 'should handle API failure in /go direction query' covers it.

    // Lines 425-426: else if (state.step === 'select_work') { ... }
    // Covered by 'should handle stop search input (step: select_work)'.

    // Lines 431-433: if (stops.length === 0) { ... return; }
    // I need a test for "stops not found" during select_work.

    describe('Setup Flow Edge Cases', () => {
        it('should handle no stops found during work selection input', async () => {
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });
            vi.mocked(citygpt.searchStops).mockResolvedValue([]);

            await handleMessage(env, { chat: { id: chatId }, text: 'Unknown' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找不到')
                })
            );
        });
    });

    describe('Setup Flow Logic', () => {
        it('should handle home stop selection (home:ID:Name)', async () => {
            const query = {
                id: 'q1',
                data: 'home:S1:StopA',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(userStore.saveSetupState).toHaveBeenCalledWith(
                expect.anything(),
                chatId,
                expect.objectContaining({
                    step: 'select_work',
                    homeStop: { id: 'S1', name: 'StopA' }
                })
            );
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('步驟 2/2')
                })
            );
        });

        it('should handle work stop selection and find routes', async () => {
            // Mock state: home selected
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'select_work',
                homeStop: { id: 'S1', name: 'Home' }
            });

            // Mock route finding
            vi.mocked(citygpt.findRoutesConnecting).mockResolvedValue([
                { routeId: 'R1', routeName: 'Route 1' } as any
            ]);

            const query = {
                id: 'q1',
                data: 'work:S2:Work',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(citygpt.findRoutesConnecting).toHaveBeenCalledWith('Home', 'Work');
            expect(userStore.saveSetupState).toHaveBeenCalledWith(
                expect.anything(),
                chatId,
                expect.objectContaining({ step: 'confirm' })
            );
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('確認要儲存嗎')
                })
            );
        });

        it('should handle setup confirmation', async () => {
            // Mock state: ready to confirm
            vi.mocked(userStore.getSetupState).mockResolvedValue({
                step: 'confirm',
                homeStop: { id: 'S1', name: 'Home' },
                workStop: { id: 'S2', name: 'Work' }
            });

            // Mock re-finding routes on confirm
            vi.mocked(citygpt.findRoutesConnecting).mockResolvedValue([
                { routeId: 'R1', routeName: 'Route 1' } as any
            ]);

            const query = {
                id: 'q1',
                data: 'setup:confirm',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(citygpt.findRoutesConnecting).toHaveBeenCalled();
            expect(userStore.saveUserSetting).toHaveBeenCalled();
            expect(userStore.clearSetupState).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('設定完成')
                })
            );
        });

        it('should handle setup restart', async () => {
            const query = {
                id: 'q1',
                data: 'setup:restart',
                message: { chat: { id: chatId } }
            } as any;

            await handleCallbackQuery(env, query);

            expect(userStore.saveSetupState).toHaveBeenCalledWith(
                expect.anything(),
                chatId,
                expect.objectContaining({ step: 'select_home' })
            );
        });
    });

    describe('Additional Coverage Cases', () => {
        it('should return on missing chatId or query data', async () => {
            await handleCallbackQuery(env, { id: 'q1', message: { chat: { id: chatId } } } as any);
            await handleCallbackQuery(env, { id: 'q1', data: 'data', message: { chat: { id: 0 } } } as any);
            expect(globalFetch).not.toHaveBeenCalled();
        });

        it('should handle large number of same-master-name routes (> 10)', async () => {
            const routes = Array.from({ length: 11 }, (_, i) => ({
                routeid: `id${i}`,
                routename_zh_tw: `Red ${i}`,
                masterroutename: 'Red'
            })) as any[];
            vi.mocked(citygpt.searchRoutes).mockResolvedValue(routes);

            await handleMessage(env, { chat: { id: chatId }, text: '/bus Red' } as any);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('找到 11 條路線')
                })
            );
        });

        it('should handle direction 1 and missing route match in direction query', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([]);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '1', estimatetime: 5, routeid: '1', direction: 1, stopname: 'Stop 1' } as any
            ]);
            const query = {
                id: 'q1',
                data: 'busdir:1:1',
                message: { chat: { id: chatId } }
            } as any;
            await handleCallbackQuery(env, query);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('路線 1')
                })
            );
        });

        it('should format non-Error objects in /go exception', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue({
                homeStop: { id: '1', name: 'Home' },
                workStop: { id: '2', name: 'Work' },
                matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
                switchHour: 12
            });
            vi.mocked(ibus.getEstimateTime).mockRejectedValue('String Error');
            await handleMessage(env, { chat: { id: chatId }, text: '/go' } as any);
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('原因: String Error')
                })
            );
        });

        it('should return early if no setup state in handleSetupTextInput', async () => {
            vi.mocked(userStore.getSetupState)
                .mockResolvedValueOnce({ step: 'select_home' }) // first call returns truthy
                .mockResolvedValueOnce(null); // second call returns null
            await handleMessage(env, { chat: { id: chatId }, text: 'Stop' } as any);
            expect(citygpt.searchStops).not.toHaveBeenCalled();
        });
    });

    describe('Refresh Callbacks', () => {
        const setting = {
            homeStop: { id: '1', name: 'Home' },
            workStop: { id: '2', name: 'Work' },
            matchedRoutes: [{ routeId: 'R1', routeName: 'Route 1', toWorkDirection: 0, toHomeDirection: 1 }],
            switchHour: 12,
        };

        it('should handle refresh:commute:toWork by re-fetching and sending a new message', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue(setting);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '1', estimatetime: 5, routeid: 'R1', direction: 0, stopname: 'Home' } as any,
            ]);

            const query = {
                id: 'q1',
                data: 'refresh:commute:toWork',
                message: { chat: { id: chatId } },
            } as any;

            await handleCallbackQuery(env, query);

            expect(ibus.getEstimateTime).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Route 1'),
                }),
            );
        });

        it('should handle refresh:commute:toHome by re-fetching and sending a new message', async () => {
            vi.mocked(userStore.getUserSetting).mockResolvedValue(setting);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: '2', estimatetime: 10, routeid: 'R1', direction: 1, stopname: 'Work' } as any,
            ]);

            const query = {
                id: 'q1',
                data: 'refresh:commute:toHome',
                message: { chat: { id: chatId } },
            } as any;

            await handleCallbackQuery(env, query);

            expect(ibus.getEstimateTime).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('Route 1'),
                }),
            );
        });

        it('should handle refresh:bus:ROUTEID:DIR by re-fetching and sending a new message', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '211', routename_zh_tw: '紅3' } as any,
            ]);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: 'S1', estimatetime: 3, routeid: '211', direction: 0, stopname: '鳳鼻頭' } as any,
            ]);

            const query = {
                id: 'q1',
                data: 'refresh:bus:211:0',
                message: { chat: { id: chatId } },
            } as any;

            await handleCallbackQuery(env, query);

            expect(ibus.getEstimateTime).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('鳳鼻頭'),
                }),
            );
        });

        it('should handle refresh:bus for direction 1 (返程)', async () => {
            vi.mocked(citygpt.searchRoutes).mockResolvedValue([
                { routeid: '211', routename_zh_tw: '紅3' } as any,
            ]);
            vi.mocked(ibus.getEstimateTime).mockResolvedValue([
                { stopid: 'S2', estimatetime: 8, routeid: '211', direction: 1, stopname: '小港站' } as any,
            ]);

            const query = {
                id: 'q1',
                data: 'refresh:bus:211:1',
                message: { chat: { id: chatId } },
            } as any;

            await handleCallbackQuery(env, query);

            expect(ibus.getEstimateTime).toHaveBeenCalled();
            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    body: expect.stringContaining('小港站'),
                }),
            );
        });

        it('should respect rate limit for refresh callbacks', async () => {
            vi.mocked(ratelimit.checkRateLimit).mockResolvedValueOnce(false);

            const query = {
                id: 'q1',
                data: 'refresh:commute:toWork',
                message: { chat: { id: chatId } },
            } as any;

            await handleCallbackQuery(env, query);

            expect(globalFetch).toHaveBeenCalledWith(
                expect.stringContaining('/answerCallbackQuery'),
                expect.objectContaining({
                    body: expect.stringContaining('操作太頻繁'),
                }),
            );
            expect(ibus.getEstimateTime).not.toHaveBeenCalled();
        });
    });
});
