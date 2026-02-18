/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
    USER_SETTINGS: KVNamespace;
    TELEGRAM_BOT_TOKEN: string;
    BOT_NAME: string;
}

/**
 * iBus+ GuestToken response
 */
export interface GuestTokenResponse {
    token: string;
    expiration?: string;
}

/**
 * CityGPT API paginated response wrapper
 */
export interface CityGPTResponse<T> {
    data: T[];
}

/**
 * Route from v_stg_tdx_route
 */
export interface Route {
    routeid: string;
    routename_zh_tw: string;
    masterroutename?: string;
    departurestopcn?: string;
    destinationstopcn?: string;
}

/**
 * Stop from v_stg_tdx_stop
 */
export interface Stop {
    stopid: string;
    stopname_zh_tw: string;
    stopsequence: number;
    routeid: string;
    direction: number;
    positionlat: number;
    positionlon: number;
}

/**
 * CustomEstimateTime response item
 */
export interface EstimateTimeItem {
    stopid: string;
    stopname?: string;
    routeid: string;
    direction: number;
    estimatetime: number | null;  // minutes, null = no data
    nextbustime?: string;         // "08:24"
    carId?: string;               // bus plate number
    etas?: EstimateTimeEta[];
    goback?: number;
    seqno?: number;
}

export interface EstimateTimeEta {
    countdownTime: number;  // seconds
    plateNumb?: string;
    isLastBus?: boolean;
}

/**
 * CustomEstimateTime POST body item
 */
export interface EstimateTimeRequest {
    id: string;        // routeid
    direction: number;  // 0 or 1
}

/**
 * User saved commute setting (stored in KV)
 */
export interface UserSetting {
    homeStop: {
        id: string;
        name: string;
    };
    workStop: {
        id: string;
        name: string;
    };
    matchedRoutes: MatchedRoute[];
    switchHour: number;  // hour to switch direction, default 12
}

export interface MatchedRoute {
    routeId: string;
    routeName: string;
    toWorkDirection: number;
    toHomeDirection: number;
}

/**
 * Telegram Bot API types (subset)
 */
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
    message_id: number;
    from?: TelegramUser;
    chat: TelegramChat;
    text?: string;
    date: number;
}

export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
}

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
}

export interface TelegramChat {
    id: number;
    type: string;
}

export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
}

export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Setup flow state (stored temporarily in KV)
 */
export interface SetupState {
    step: 'select_home' | 'select_work' | 'confirm';
    homeStop?: { id: string; name: string };
    workStop?: { id: string; name: string };
    searchResults?: { id: string; name: string; routeId: string }[];
}
