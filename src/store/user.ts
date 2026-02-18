import type { Env, UserSetting, SetupState } from '../types';

const SETTING_PREFIX = 'user:';
const SETUP_PREFIX = 'setup:';

/**
 * Get user's saved commute setting from KV.
 */
export async function getUserSetting(
    kv: KVNamespace,
    chatId: number,
): Promise<UserSetting | null> {
    const data = await kv.get(`${SETTING_PREFIX}${chatId}`, 'json');
    return data as UserSetting | null;
}

/**
 * Save user's commute setting to KV.
 */
export async function saveUserSetting(
    kv: KVNamespace,
    chatId: number,
    setting: UserSetting,
): Promise<void> {
    await kv.put(`${SETTING_PREFIX}${chatId}`, JSON.stringify(setting));
}

/**
 * Delete user's commute setting from KV.
 */
export async function deleteUserSetting(
    kv: KVNamespace,
    chatId: number,
): Promise<void> {
    await kv.delete(`${SETTING_PREFIX}${chatId}`);
    await kv.delete(`${SETUP_PREFIX}${chatId}`);
}

/**
 * Get the current setup flow state (temporary, during /setup).
 */
export async function getSetupState(
    kv: KVNamespace,
    chatId: number,
): Promise<SetupState | null> {
    const data = await kv.get(`${SETUP_PREFIX}${chatId}`, 'json');
    return data as SetupState | null;
}

/**
 * Save setup flow state (expires in 10 minutes).
 */
export async function saveSetupState(
    kv: KVNamespace,
    chatId: number,
    state: SetupState,
): Promise<void> {
    await kv.put(`${SETUP_PREFIX}${chatId}`, JSON.stringify(state), {
        expirationTtl: 600, // 10 minutes
    });
}

/**
 * Clear setup flow state.
 */
export async function clearSetupState(
    kv: KVNamespace,
    chatId: number,
): Promise<void> {
    await kv.delete(`${SETUP_PREFIX}${chatId}`);
}
