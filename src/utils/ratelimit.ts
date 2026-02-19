/**
 * Check if a user has exceeded the rate limit.
 * Uses a fixed window counter approach with 1-minute windows.
 *
 * @param kv The KV Namespace to use for storage
 * @param chatId The Telegram User ID
 * @param limit Max requests per minute
 * @returns true if allowed, false if limited
 */
export async function checkRateLimit(
    kv: KVNamespace,
    chatId: number,
    limit: number = 20,
): Promise<boolean> {
    const currentMinute = Math.floor(Date.now() / 60000);
    const key = `ratelimit:${chatId}:${currentMinute}`;

    const countStr = await kv.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;

    if (count >= limit) {
        return false;
    }

    // Increment counter
    // Expiration: 60s is enough to cover the current minute window
    await kv.put(key, (count + 1).toString(), { expirationTtl: 60 });

    return true;
}
