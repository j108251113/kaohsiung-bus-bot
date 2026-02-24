/**
 * poll-api.mjs
 *
 * 1. 從 CityGPT 搜尋路線名稱，取得所有匹配的 routeId
 * 2. 一次丟給 iBus 查詢，去程 + 返程都查
 * 3. 每輪追蹤每個站的狀態，自動偵測 estimatetime 的切換
 *    - 負數 → null  (過站後何時跳成「下一班」?)
 *    - BOTH_SET: et 非 null 同時 nextbustime 也有值
 *
 * Usage:
 *   node scripts/poll-api.mjs <路線關鍵字> [intervalSec] [topN]
 *
 * Examples:
 *   node scripts/poll-api.mjs 紅3
 *   node scripts/poll-api.mjs 紅3 20 5
 */

import fs from 'fs';
import path from 'path';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const IBUS_BASE_URL = 'https://ibusplus.tbkc.gov.tw/bsuper';
const CITYGPT_BASE_URL = 'https://citygpt.foxconn.com/data/abfs/dal';
const SUBSCRIPTION_KEY = '676ec13f73aa4cdfbdffd6598189593b';

const keyword = process.argv[2];
const intervalSec = parseInt(process.argv[3] ?? '30', 10);
const topN = parseInt(process.argv[4] ?? '5', 10);

if (!keyword) {
    console.error('Usage: node scripts/poll-api.mjs <路線關鍵字> [intervalSec] [topN]');
    console.error('Example: node scripts/poll-api.mjs 紅3 20 5');
    process.exit(1);
}

const CITYGPT_HEADERS = {
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Authorization': `Bearer ${SUBSCRIPTION_KEY}`,
};

// ─── Log file ─────────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeKw = keyword.replace(/[^\w\u4e00-\u9fff]/g, '_');
const logFile = path.join('scripts', `poll-${safeKw}-${ts}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    const line = `[${time}] ${msg}`;
    console.log(line);
    logStream.write(line + '\n');
}

// ─── CityGPT: discover routes ─────────────────────────────────────────────────
async function discoverRoutes(kw) {
    const resp = await fetch(`${CITYGPT_BASE_URL}/v_stg_tdx_route?top=1000`, {
        headers: CITYGPT_HEADERS,
    });
    if (!resp.ok) throw new Error(`CityGPT routes failed: ${resp.status}`);
    const json = await resp.json();
    const all = Array.isArray(json) ? json : json.data;
    const norm = kw.trim().toLowerCase();
    return all.filter(r => {
        const name = (r.routename_zh_tw || '').toLowerCase();
        const master = (r.masterroutename || '').toLowerCase();
        return name.includes(norm) || master.includes(norm);
    });
}

// ─── iBus helpers ─────────────────────────────────────────────────────────────
let cachedToken = null;

async function getGuestToken() {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
        return cachedToken.token;
    }
    const resp = await fetch(`${IBUS_BASE_URL}/Token/GuestToken`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://ibusplus.tbkc.gov.tw',
            'Referer': 'https://ibusplus.tbkc.gov.tw/',
        },
        body: JSON.stringify({}),
    });
    if (!resp.ok) throw new Error(`GuestToken failed: ${resp.status}`);
    const data = await resp.json();
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
    };
    log('[token] GuestToken refreshed.');
    return cachedToken.token;
}

async function fetchItems(requests) {
    const token = await getGuestToken();
    const resp = await fetch(
        `${IBUS_BASE_URL}/Extended/Dal/CustomEstimateTime?extraType=All`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requests),
        },
    );
    if (resp.status === 401) {
        cachedToken = null;
        log('[token] 401 – refreshing and retrying…');
        return fetchItems(requests);
    }
    if (!resp.ok) throw new Error(`CustomEstimateTime failed: ${resp.status}`);

    const json = await resp.json();
    if (!json || !Array.isArray(json.data)) return [];

    return json.data.flat().map(item => {
        let et = null;
        if (typeof item.estimatetime === 'number') {
            et = item.estimatetime;
        } else if (typeof item.estimatetime === 'string' && item.estimatetime !== 'null') {
            const p = parseInt(item.estimatetime, 10);
            if (!isNaN(p)) et = p;
        }
        return {
            key: `${item.routeid}:${item.direction}:${item.stopid || item.stopID}`,
            routeid: item.routeid,
            stopname: item.stopname_Zh_Tw || item.stopname || '',
            seqno: item.stopsequence ?? null,
            direction: item.direction,
            estimatetime: et,
            nextbustime: item.nextbustime ?? null,
            carId: item.carId ?? '',
            _raw_et: item.estimatetime,
        };
    });
}

// ─── State tracking ───────────────────────────────────────────────────────────
// prev[key] = { estimatetime, nextbustime, carId }
const prev = {};

function detectTransition(cur) {
    const p = prev[cur.key];
    if (!p) return null;

    const events = [];

    // negative → null  (the key moment: does nextbustime appear at the same time?)
    if (p.estimatetime !== null && p.estimatetime < 0 && cur.estimatetime === null) {
        events.push(`🔄 et 負數→null | 同時 nextbustime="${cur.nextbustime ?? 'null'}" car="${cur.carId}"`);
    }

    // low positive / zero → null
    if (p.estimatetime !== null && p.estimatetime >= 0 && p.estimatetime <= 2 && cur.estimatetime === null) {
        events.push(`🔄 et ${p.estimatetime}→null | 同時 nextbustime="${cur.nextbustime ?? 'null'}" car="${cur.carId}"`);
    }

    // null → estimatetime (新一班車出現)
    if (p.estimatetime === null && cur.estimatetime !== null) {
        events.push(`🆕 et null→${cur.estimatetime} | nextbustime="${cur.nextbustime ?? 'null'}" car="${cur.carId}"`);
    }

    // BOTH_SET: et 很小（接近 0）且 nextbustime 同時有值 → bug 直接重現
    if (cur.estimatetime !== null && cur.estimatetime <= 2 && cur.nextbustime) {
        events.push(`⚑ BOTH_SET et=${cur.estimatetime} AND nextbustime="${cur.nextbustime}"`);
    }

    return events.length > 0 ? events : null;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
log(`=== Searching routes for "${keyword}"… ===`);
let routes;
try {
    routes = await discoverRoutes(keyword);
} catch (err) {
    console.error(`Failed to fetch routes: ${err.message}`);
    process.exit(1);
}
if (routes.length === 0) {
    console.error(`No routes found for keyword "${keyword}"`);
    process.exit(1);
}

const requests = routes.flatMap(r => [
    { id: r.routeid, direction: 0 },
    { id: r.routeid, direction: 1 },
]);
const nameMap = Object.fromEntries(routes.map(r => [r.routeid, r.routename_zh_tw]));

log(`Found ${routes.length} route(s): ${routes.map(r => r.routename_zh_tw).join(', ')}`);
log(`Querying ${requests.length} route+direction combos. interval=${intervalSec}s top=${topN}`);
log(`Log file: ${logFile}`);
log('');

// ─── Polling ──────────────────────────────────────────────────────────────────
async function poll() {
    try {
        const items = await fetchItems(requests);

        // ── Detect transitions first (across ALL stops, not just top N) ──────
        const transitions = [];
        for (const cur of items) {
            const events = detectTransition(cur);
            if (events) {
                const routeName = nameMap[cur.routeid] ?? cur.routeid;
                const dir = cur.direction === 0 ? '去' : '返';
                for (const ev of events) {
                    transitions.push(`  [${routeName} ${dir} seq=${String(cur.seqno).padStart(3)}] "${cur.stopname}" → ${ev}`);
                }
            }
            // Save current as previous
            prev[cur.key] = {
                estimatetime: cur.estimatetime,
                nextbustime: cur.nextbustime,
                carId: cur.carId,
            };
        }

        if (transitions.length > 0) {
            log('🔔 狀態切換偵測：');
            transitions.forEach(t => log(t));
        }

        // ── 只在沒有切換事件的輪次印一行心跳，避免洗版 ──────────────────
        if (transitions.length === 0) {
            const withEt = items.filter(i => i.estimatetime !== null);
            withEt.sort((a, b) => a.estimatetime - b.estimatetime);
            const best = withEt[0];
            if (best) {
                const routeName = nameMap[best.routeid] ?? best.routeid;
                const dir = best.direction === 0 ? '去' : '返';
                log(`  (heartbeat) 最快: [${routeName} ${dir}] "${best.stopname}" et=${best.estimatetime} | ${items.length} stops total`);
            }
        }

    } catch (err) {
        log(`[error] ${err.message}`);
    }
}

await poll();
setInterval(poll, intervalSec * 1000);

process.on('SIGINT', () => {
    log('=== Polling stopped ===');
    logStream.end();
    process.exit(0);
});
