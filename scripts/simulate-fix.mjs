/**
 * simulate-fix.mjs
 *
 * 多輪抓取 iBus 資料，累積統計：
 *   - et < 0 時 nextbustime 有沒有值？
 *   - et = 0 時 nextbustime 有沒有值？
 * 並用現行版 vs 修正版 formatEta 對比，找出所有結果不同的案例
 *
 * Usage:
 *   node scripts/simulate-fix.mjs <路線關鍵字> [輪數] [間隔秒]
 *   node scripts/simulate-fix.mjs 紅3 5 30
 */

import fs from 'fs';
import path from 'path';

const IBUS_BASE_URL = 'https://ibusplus.tbkc.gov.tw/bsuper';
const CITYGPT_BASE_URL = 'https://citygpt.foxconn.com/data/abfs/dal';
const SUBSCRIPTION_KEY = '676ec13f73aa4cdfbdffd6598189593b';
const CITYGPT_HEADERS = {
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Authorization': `Bearer ${SUBSCRIPTION_KEY}`,
};

const keyword = process.argv[2] ?? '紅3';
const rounds = parseInt(process.argv[3] ?? '5', 10);
const intervalSec = parseInt(process.argv[4] ?? '30', 10);

// ─── 現行版 formatEta ────────────────────────────────────────────────────────
function formatEta_current(minutes, nextTime) {
    if (minutes === null || minutes === undefined) {
        if (nextTime) return `下一班 ${nextTime}`;
        return '未發車';
    }
    if (minutes <= 0) return '⚡ 進站中';
    if (minutes === 1) return '⚡ 即將到站';
    return `${minutes}分鐘`;
}

// ─── 修正版 formatEta ────────────────────────────────────────────────────────
function formatEta_fixed(minutes, nextTime) {
    if (minutes === null || minutes === undefined) {
        if (nextTime) return `下一班 ${nextTime}`;
        return '未發車';
    }
    if (minutes < 0) {
        if (nextTime) return `下一班 ${nextTime}`;
        return '剛過站';
    }
    if (minutes === 0) {
        if (nextTime) return `⚡ 進站中（下一班 ${nextTime}）`;
        return '⚡ 進站中';
    }
    if (minutes === 1) return '⚡ 即將到站';
    return `${minutes}分鐘`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
let cachedToken = null;

async function getGuestToken() {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
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
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 1800) * 1000 };
    return cachedToken.token;
}

async function discoverRoutes(kw) {
    const resp = await fetch(`${CITYGPT_BASE_URL}/v_stg_tdx_route?top=1000`, { headers: CITYGPT_HEADERS });
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

async function fetchItems(routes) {
    const token = await getGuestToken();
    const requests = routes.flatMap(r => [
        { id: r.routeid, direction: 0 },
        { id: r.routeid, direction: 1 },
    ]);
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
    if (resp.status === 401) { cachedToken = null; return fetchItems(routes); }
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
            routeid: item.routeid,
            stopname: item.stopname_Zh_Tw || item.stopname || '',
            seqno: item.stopsequence ?? null,
            direction: parseInt(item.direction, 10),
            estimatetime: et,
            nextbustime: item.nextbustime ?? null,
            carId: item.carId ?? '',
        };
    });
}

// ─── Accumulated stats ────────────────────────────────────────────────────────
const acc = {
    neg_with_next: 0,  // et < 0 AND nextbustime set
    neg_without_next: 0,  // et < 0 AND nextbustime null
    zero_with_next: 0,  // et = 0 AND nextbustime set
    zero_without_next: 0,  // et = 0 AND nextbustime null
    total_items: 0,
    total_diffs: 0,
};

// Unique observations (deduplicated by route+stop+et+next so repeats don't pile up)
const uniqueNegWithNext = new Map();   // key → example item

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const safeKw = keyword.replace(/[^\w\u4e00-\u9fff]/g, '_');
const logPath = path.join('scripts', `simulate-${safeKw}-${ts}.log`);
const logLines = [];

function tee(line) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    const full = `[${time}] ${line}`;
    console.log(full);
    logLines.push(full);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
console.log(`=== 模擬修正效果：路線「${keyword}」 | ${rounds} 輪 × ${intervalSec}s ===\n`);
const routes = await discoverRoutes(keyword);
if (routes.length === 0) { console.error('找不到路線'); process.exit(1); }
console.log(`找到 ${routes.length} 條路線：${routes.map(r => r.routename_zh_tw).join(', ')}\n`);
const nameMap = Object.fromEntries(routes.map(r => [r.routeid, r.routename_zh_tw]));

logLines.push(`路線：${routes.map(r => r.routename_zh_tw).join(', ')}`);
logLines.push(`輪數：${rounds}  間隔：${intervalSec}s\n`);

// ─── Rounds ───────────────────────────────────────────────────────────────────
for (let round = 1; round <= rounds; round++) {
    if (round > 1) {
        tee(`等待 ${intervalSec}s...`);
        await new Promise(r => setTimeout(r, intervalSec * 1000));
    }

    tee(`─── 第 ${round}/${rounds} 輪 ───`);
    let items;
    try {
        items = await fetchItems(routes);
    } catch (err) {
        tee(`[error] ${err.message}`);
        continue;
    }

    acc.total_items += items.length;

    let roundDiffs = 0;
    for (const item of items) {
        const cur = formatEta_current(item.estimatetime, item.nextbustime);
        const fix = formatEta_fixed(item.estimatetime, item.nextbustime);
        if (cur !== fix) { acc.total_diffs++; roundDiffs++; }

        if (item.estimatetime !== null && item.estimatetime < 0) {
            if (item.nextbustime) {
                acc.neg_with_next++;
                // Record unique example
                const key = `${item.routeid}:${item.direction}:${item.seqno}`;
                if (!uniqueNegWithNext.has(key)) uniqueNegWithNext.set(key, item);
            } else {
                acc.neg_without_next++;
            }
        }
        if (item.estimatetime === 0) {
            if (item.nextbustime) acc.zero_with_next++;
            else acc.zero_without_next++;
        }
    }

    // Show this round's diff count and any et<0+nextbustime cases (most interesting)
    tee(`  ${items.length} 筆資料，結果不同：${roundDiffs} 筆`);

    const negWithNext = items.filter(i => i.estimatetime !== null && i.estimatetime < 0 && i.nextbustime);
    if (negWithNext.length > 0) {
        tee(`  ⭐ et<0 且有 nextbustime：${negWithNext.length} 筆（重要！）`);
        for (const item of negWithNext) {
            const rn = nameMap[item.routeid] ?? item.routeid;
            const dir = item.direction === 0 ? '去' : '返';
            tee(`    [${rn} ${dir} seq=${item.seqno}] "${item.stopname}" et=${item.estimatetime} next="${item.nextbustime}"`);
            tee(`      現行：${formatEta_current(item.estimatetime, item.nextbustime)}`);
            tee(`      修正：${formatEta_fixed(item.estimatetime, item.nextbustime)}`);
        }
    } else {
        tee(`  et<0 且有 nextbustime：0 筆（負數期 nextbustime 一律 null）`);
    }

    const zeroNext = items.filter(i => i.estimatetime === 0 && i.nextbustime);
    tee(`  et=0 且有 nextbustime：${zeroNext.length} 筆`);
    for (const item of zeroNext.slice(0, 3)) {
        const rn = nameMap[item.routeid] ?? item.routeid;
        const dir = item.direction === 0 ? '去' : '返';
        tee(`    [${rn} ${dir}] "${item.stopname}" next="${item.nextbustime}"  現行→「進站中」  修正→「⚡ 進站中（下一班 ${item.nextbustime}）」`);
    }
}

// ─── Final summary ────────────────────────────────────────────────────────────
tee('\n=== 累積統計（所有輪次）===');
tee(`總資料筆數：${acc.total_items}（${rounds} 輪 × 約 ${Math.round(acc.total_items / rounds)} 筆/輪）`);
tee(`修正前後結果不同：${acc.total_diffs} 筆`);
tee('');
tee(`et < 0，nextbustime 有值  →「剛過站→下一班 HH:MM」  : ${acc.neg_with_next} 筆`);
tee(`et < 0，nextbustime 無值  →「進站中→剛過站」         : ${acc.neg_without_next} 筆`);
tee(`et = 0，nextbustime 有值  →「進站中→進站中+下一班」   : ${acc.zero_with_next} 筆`);
tee(`et = 0，nextbustime 無值  → 行為不變                  : ${acc.zero_without_next} 筆`);

if (uniqueNegWithNext.size > 0) {
    tee(`\n⭐ et<0 且有 nextbustime 的唯一站點（共 ${uniqueNegWithNext.size} 個）：`);
    for (const [, item] of uniqueNegWithNext) {
        const rn = nameMap[item.routeid] ?? item.routeid;
        const dir = item.direction === 0 ? '去' : '返';
        tee(`  [${rn} ${dir} seq=${item.seqno}] "${item.stopname}"`);
    }
} else {
    tee('\n結論：et<0 時 nextbustime 在所有觀測中均為 null，負數期無法顯示下一班。');
}

fs.writeFileSync(logPath, logLines.join('\n'));
console.log(`\nLog 儲存：${logPath}`);
