// 共用設定、資料存取與漫畫表單元件（index.html、add.html 共用）

// search：沒有填作品網址時，用韓文標題搜尋的網址
const PLATFORM_CONFIG = {
    "Ridibooks": { color: "#00a0e9", short: "Ridi", search: kw => `https://ridibooks.com/search?q=${kw}` },
    "Kakao": { color: "#ffcd00", short: "Kakao", search: kw => `https://page.kakao.com/search/result?keyword=${kw}` },
    "Naver": { color: "#03cf5d", short: "Naver", search: kw => `https://comic.naver.com/search?keyword=${kw}` },
    "Bomtoon": { color: "#ff4d6a", short: "Bom", search: kw => `https://www.bomtoon.com/search?q=${kw}` },
};
const PLATFORMS = Object.keys(PLATFORM_CONFIG);

const STATUS_CONFIG = {
    "連載中": { cls: "status-ongoing", color: "var(--status-ongoing)" },
    "已看完": { cls: "status-completed", color: "var(--status-completed)" },
    "休刊": { cls: "status-paused", color: "var(--status-paused)" },
    "棄坑": { cls: "status-dropped", color: "var(--status-dropped)" },
    "想看": { cls: "status-wishlist", color: "var(--status-wishlist)" },
};
const STATUSES = Object.keys(STATUS_CONFIG);
const DEFAULT_STATUS = "連載中";

const DAY_MAP = { "Mon": "월", "Tue": "화", "Wed": "수", "Thu": "목", "Fri": "금", "Sat": "토", "Sun": "일" };
const DAYS = Object.keys(DAY_MAP);

// 創作團隊欄位：label 顯示在卡片上，hint 是表單上的中文說明
const JOB_KEYS = [
    { key: 'studio', label: '제작팀', hint: '製作團隊' },
    { key: 'pd', label: 'PD', hint: '監製' },
    { key: 'author', label: '원작', hint: '原著' },
    { key: 'adapter', label: '글', hint: '編劇/腳本' },
    { key: 'storyboard', label: '콘티', hint: '分鏡' },
    { key: 'artist', label: '그림', hint: '作畫' },
    { key: 'lineart', label: '선화', hint: '線稿' },
    { key: 'coloring', label: '채색', hint: '上色' },
    { key: 'editing', label: '편집', hint: '編輯' },
    { key: 'ad', label: 'AD', hint: '美術指導' },
    { key: 'other', label: '다른 직원', hint: '其他' },
];

const STORAGE_KEYS = {
    reviews: 'my_review_gallery',
    memo: 'my_review_memo',
    draft: 'comic_review_draft',
    ui: 'my_review_ui',
    commentTracker: 'comment_tracker', // 平台留言追蹤（platform-comments.html）
};

// ---------- 小工具 ----------

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cleanTitleBrackets(title) {
    if (!title) return '';
    return title.replace(/\s*[（(].*$/, '').trim(); // 去掉「(64)」「（64）」這類括號後綴
}

function splitNames(value) {
    return (value || '').split('、').map(n => n.trim()).filter(Boolean);
}

function platformColor(name) {
    return PLATFORM_CONFIG[name]?.color || '#ccc';
}

function platformTagsHtml(platforms) {
    return (platforms || []).map(p => `<span class="tag" style="--tag-color: ${platformColor(p)}">${escapeHtml(p)}</span>`).join(' ');
}

// 回傳 { url, isSearch }；有填作品網址就用網址，否則用韓文（或中文）標題搜尋
function platformLink(review, platform) {
    const saved = (review.links || {})[platform];
    if (saved && /^https?:\/\//i.test(saved)) return { url: saved, isSearch: false };
    const config = PLATFORM_CONFIG[platform];
    const keyword = (review.krTitle || '').trim() || cleanTitleBrackets(review.title);
    if (!config || !keyword) return null;
    return { url: config.search(encodeURIComponent(keyword)), isSearch: true };
}

// 可點的平台標籤：直接連結顯示 ↗，搜尋顯示 🔍
function platformLinkTagsHtml(review) {
    return (review.platforms || []).map(p => {
        const link = platformLink(review, p);
        if (!link) return `<span class="tag" style="--tag-color: ${platformColor(p)}">${escapeHtml(p)}</span>`;
        return `<a class="tag tag-link" style="--tag-color: ${platformColor(p)}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener"
            onclick="event.stopPropagation()" title="${link.isSearch ? '在平台上搜尋' : '打開作品頁'}">${escapeHtml(p)} ${link.isSearch ? '🔍' : '↗'}</a>`;
    }).join(' ') + twWebtoonTagHtml(review);
}

// 台版 Webtoon 標記（不是發行平台，不算進平台統計）：點了到台版用譯名搜尋
const TW_WEBTOON_COLOR = '#00d564';
function twWebtoonTitle(review) {
    return (review.twTitle || '').trim() || cleanTitleBrackets(review.title);
}
function twWebtoonTagHtml(review) {
    if (!review.twWebtoon) return '';
    const url = `https://www.webtoons.com/zh-hant/search?keyword=${encodeURIComponent(twWebtoonTitle(review))}`;
    return ` <a class="tag tag-link" style="--tag-color: ${TW_WEBTOON_COLOR}" href="${escapeHtml(url)}" target="_blank" rel="noopener"
        onclick="event.stopPropagation()" title="在台版 Webtoon 搜尋">台版 🔍</a>`;
}

// ---------- 日期 ----------

function toDateStr(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 本週（週一開始）某一天的日期字串，例如 weekDateOf('Fri') → '2026-09-25'
function weekDateOf(day, now = new Date()) {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    return toDateStr(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + DAYS.indexOf(day)));
}

// 已讀記錄存的是「這週那一天」的日期，到下週自然就不相等，等於自動重置
function isReadThisWeek(review) {
    return !!review.updateDay && review.lastReadDate === weekDateOf(review.updateDay);
}

// 距離某日期還有幾天（今天 = 0，過去為負數）
function daysUntil(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const now = new Date();
    return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}

// ---------- 話數 ----------
// episode = { main: 本篇, side: 外傳, after: 後記 }，三段皆選填，沒有就不存。
const EPISODE_PARTS = [
    { key: 'main', label: '本篇', short: '' },
    { key: 'side', label: '外傳', short: '外' },
    { key: 'after', label: '後記', short: '後' },
];

// 統一轉成 { main?, side?, after? } 或 null；也接受舊格式：數字 64、字串 "70+2+1"（依序 = 本篇+外傳+後記）
function normalizeEpisode(value) {
    if (value === undefined || value === null || value === '') return null;
    let parts = {};
    if (typeof value === 'object') {
        EPISODE_PARTS.forEach(({ key }) => {
            const n = parseInt(value[key]);
            if (Number.isInteger(n) && n >= 0) parts[key] = n;
        });
    } else {
        const text = String(value).replace(/\s/g, '').replace(/＋/g, '+'); // 中文輸入法常打出全形＋
        if (!/^\d+(\+\d+){0,2}$/.test(text)) return null;
        text.split('+').forEach((n, k) => { parts[EPISODE_PARTS[k].key] = Number(n); });
    }
    return Object.keys(parts).length ? parts : null;
}

// 顯示用：70話、70話·外2、70話·外2·後1、70話·後1
function episodeLabel(value) {
    const ep = normalizeEpisode(value);
    if (!ep) return '';
    return EPISODE_PARTS.filter(({ key }) => ep[key] !== undefined)
        .map(({ key, short }) => key === 'main' ? `${ep.main}話` : `${short}${ep[key]}`).join('·');
}

// 目前在看的段落：有後記就是後記，其次外傳，否則本篇
function currentEpisodePart(value) {
    const ep = normalizeEpisode(value) || {};
    return [...EPISODE_PARTS].reverse().find(({ key }) => ep[key] !== undefined) || EPISODE_PARTS[0];
}

function stepEpisode(value, step) {
    const ep = normalizeEpisode(value) || { main: 0 };
    const { key } = currentEpisodePart(ep);
    ep[key] = Math.max(0, ep[key] + step);
    return ep;
}

// ---------- 回歸時間 ----------
// 使用者輸入的文字（returnText）→ 換算成日期區間（returnFrom ～ returnTo，確定日期時兩者相同）
// 規則依序比對，第一條符合的生效；都不符合 = 未定（回傳 null）

const pad2 = n => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

// 「上次編輯」的時間，用來推算舊資料沒寫年份的日期
function refDateOf(review) {
    if (review.updatedAtTs) return new Date(review.updatedAtTs);
    const m = String(review.updatedAt || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

function parseReturnText(text, ref = new Date()) {
    const t = String(text || '').replace(/\s+/g, '')
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (!t) return null;

    let year = ref.getFullYear(), explicitYear = false, body = t;
    const y = t.match(/(20\d{2})年?/);
    if (y) { year = Number(y[1]); explicitYear = true; body = t.replace(y[0], ''); }
    else if (t.includes('明年')) { year += 1; explicitYear = true; }
    else if (t.includes('今年')) { explicitYear = true; }

    // range = [起始月, 起始日, 結束月, 結束日]；結束月比起始月小代表跨年（冬天 12～2 月）
    let range = null, m;
    const validMonth = n => n >= 1 && n <= 12;
    if ((m = body.match(/(\d{1,2})[\/月](\d{1,2})日?/)) && validMonth(+m[1]) && +m[2] >= 1 && +m[2] <= 31) {
        range = [+m[1], +m[2], +m[1], +m[2]];                                   // 10/14、10月14日
    } else if ((m = body.match(/(\d{1,2})月(初|上旬|中旬|中後|中|下旬|底|末)/)) && validMonth(+m[1])) {
        const mo = +m[1], end = lastDayOf(year, mo);
        range = { 初: [mo, 1, mo, 10], 上旬: [mo, 1, mo, 10], 中旬: [mo, 11, mo, 20], 中: [mo, 11, mo, 20],
            中後: [mo, 15, mo, end], 下旬: [mo, 21, mo, end], 底: [mo, 21, mo, end], 末: [mo, 21, mo, end] }[m[2]];
    } else if ((m = body.match(/(\d{1,2})月?[,，、\-~～到至](\d{1,2})月/)) && validMonth(+m[1]) && validMonth(+m[2])) {
        range = [+m[1], 1, +m[2], 0];                                            // 6, 7月、6-7月
    } else if ((m = body.match(/(\d{1,2})月/)) && validMonth(+m[1])) {
        range = [+m[1], 1, +m[1], 0];                                            // 6月
    } else if (body.includes('上半年')) {
        range = [1, 1, 6, 0];
    } else if (body.includes('下半年')) {
        range = [7, 1, 12, 0];
    } else if ((m = body.match(/[春夏秋冬]/))) {
        range = { 春: [3, 1, 5, 0], 夏: [6, 1, 8, 0], 秋: [9, 1, 11, 0], 冬: [12, 1, 2, 0] }[m[0]];
    } else if (body.includes('年初')) {
        range = [1, 1, 2, 0];
    } else if (body.includes('年中')) {
        range = [6, 1, 7, 0];
    } else if (/年[底末]/.test(body)) {
        range = [11, 1, 12, 0];
    }
    if (!range) return null;

    const build = yr => {
        const [fm, fd, tm, td] = range;
        const toYear = tm < fm ? yr + 1 : yr;
        return {
            from: `${yr}-${pad2(fm)}-${pad2(fd)}`,
            to: `${toYear}-${pad2(tm)}-${pad2(td || lastDayOf(toYear, tm))}`,
        };
    };
    let result = build(year);
    // 沒寫年份、而且整段在參考日之前已經過完 → 算明年（9 月輸入「春天」= 明年春天）
    const refKey = `${ref.getFullYear()}-${pad2(ref.getMonth() + 1)}-${pad2(ref.getDate())}`;
    if (!explicitYear && result.to < refKey) result = build(year + 1);
    return result;
}

// 回歸狀態：unknown / upcoming（還沒到）/ today / due（確定日期已過）/ window（區間中）/ overdue（區間已過）
function returnStatus(review) {
    if (!review.returnFrom) return { state: 'unknown' };
    const exact = review.returnFrom === review.returnTo;
    const d1 = daysUntil(review.returnFrom), d2 = daysUntil(review.returnTo);
    if (d1 > 0) return { state: 'upcoming', days: d1, exact };
    if (exact) return { state: d1 === 0 ? 'today' : 'due', exact };
    return { state: d2 >= 0 ? 'window' : 'overdue', exact };
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// 2026-10-14 → 10/14（三）；區間 → 7/1～12/31；不是今年的會加年份
function returnRangeLabel(from, to) {
    const fmt = (str, withWeekday) => {
        const [y, m, d] = str.split('-').map(Number);
        const yearPart = y !== new Date().getFullYear() ? `${y}/` : '';
        return `${yearPart}${m}/${d}${withWeekday ? `（${WEEKDAY_ZH[new Date(y, m - 1, d).getDay()]}）` : ''}`;
    };
    if (!from) return '';
    return from === to ? fmt(from, true) : `${fmt(from)}～${fmt(to)}`;
}

// ---------- 最新話數／待補 ----------
// latest = { n: 52, part: 'main', asOf: '2026-09-26' }：asOf 那天平台最新是第 n 話。
// 連載中的作品，asOf 之後每經過一次更新日就自動 +1（即時算，不改資料）；休刊或延更時使用者手動修正。

// fromStr（不含）到 toDate（含）之間，有幾個指定的星期幾
function countWeekdaysAfter(fromStr, toDate, day) {
    const idx = DAYS.indexOf(day);
    if (idx < 0 || !fromStr) return 0;
    const [y, m, d] = fromStr.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    const diff = Math.round((end - start) / 864e5);
    if (diff <= 0) return 0;
    const target = (idx + 1) % 7; // DAYS 從週一開始，getDay() 週日是 0
    let count = Math.floor(diff / 7);
    for (let k = 1; k <= diff % 7; k++) if ((start.getDay() + k) % 7 === target) count++;
    return count;
}

function latestEpisode(review, today = new Date()) {
    const l = review.latest;
    if (!l || !Number.isInteger(l.n)) return null;
    const auto = (review.status || DEFAULT_STATUS) === DEFAULT_STATUS && review.updateDay ? countWeekdaysAfter(l.asOf, today, review.updateDay) : 0;
    return { n: l.n + auto, part: l.part || 'main' };
}

// 待補 = 最新話數 − 看到的話數（同一段才算）；無法計算時回傳 null
function backlogOf(review) {
    const latest = latestEpisode(review);
    const ep = normalizeEpisode(review.episode);
    if (!latest || !ep) return null;
    const part = currentEpisodePart(ep).key;
    if (part !== latest.part) return null;
    return Math.max(0, latest.n - (ep[part] ?? 0));
}

// 把自動 +1 的結果固定下來（改狀態、改更新日前呼叫，避免休刊期間也被算進去）
function freezeLatest(review) {
    const latest = latestEpisode(review);
    if (latest) review.latest = { n: latest.n, part: latest.part, asOf: toDateStr(new Date()) };
}

function episodeText(review) {
    const label = episodeLabel(review.episode);
    return label ? `看到 ${label}` : '';
}

// ---------- 閱讀筆記 ----------
// notes = [{ date: '2026-06-16', part: 'main'|'side'|'after', from: 40, to: 41, toEnd: false, text }]
// from/to 皆可為 null；toEnd = 範圍到「最後」

function noteEpisodeLabel(note) {
    const range = note.from == null ? ''
        : note.toEnd ? `${note.from}～最後`
        : note.to != null && note.to !== note.from ? `${note.from}–${note.to}` : `${note.from}`;
    if (note.part === 'side') return `外傳${range}`;
    if (note.part === 'after') return `後記${range}`;
    if (note.toEnd) return `${note.from}話～最後`;
    return range ? `${range}話` : '';
}

function noteDateLabel(note) {
    if (!note.date) return '';
    const [, m, d] = note.date.split('-').map(Number);
    return `${m}/${d}`;
}

// ---------- 整理舊資料：標題括號、心得裡的日期 ----------

// 標題：「以為只是普通穿越（100+15+後記）」「TOY DADDY（40+後記）10/14」「無法逃離的黑暗（105）找不到外傳」
// 回傳 { title, episode, note, returnText, returnFrom, returnTo, flags } 或 null（沒有括號）
// ref：推算年份用的日期，預設為作品最後編輯的時間
function parseTitleExtras(review, ref = refDateOf(review)) {
    const m = (review.title || '').match(/^(.*?)\s*[（(]([^（()）]*)[)）](.*)$/);
    if (!m || !m[1].trim()) return null;
    const inner = m[2].trim(), trailing = m[3].trim();
    const result = { title: m[1].trim(), episode: null, note: '', returnText: '', returnFrom: '', returnTo: '', flags: [] };
    const notes = [];

    // 話數：70、70+2、100+15+後記；「後記還沒看」「後記還沒有翻譯」代表還沒讀，不算
    const ep = inner.match(/^(\d+)((?:\s*[+＋]\s*(?:\d+|後記(?!還沒|未)))*)/);
    if (ep) {
        const parts = [ep[1], ...(ep[2].match(/\d+|後記/g) || [])];
        const episode = { main: Number(parts[0]) };
        if (parts[1] === '後記') episode.after = 1;
        else if (parts[1]) episode.side = Number(parts[1]);
        if (parts[2]) {
            episode.after = parts[2] === '後記' ? 1 : Number(parts[2]);
            if (parts[2] !== '後記') result.flags.push(`第三個數字 ${parts[2]} 當成後記，如果是特別外傳請之後手動修改`);
        }
        if (parts.length > 3) result.flags.push('超過三段的話數只取前三段');
        result.episode = episode;
        const rest = inner.slice(ep[0].length).replace(/^\s*[+＋]?\s*/, '').trim();
        if (rest) notes.push(rest);
    } else if (inner) {
        notes.push(inner);
    }
    if (trailing) notes.push(trailing);

    // 休刊作品的「7/19回歸」「10/14」「下半年回歸」「6月中後繼續」→ 回歸時間；「季1休」這種沒有時間的留在備註
    if (review.status === '休刊') {
        for (let k = notes.length - 1; k >= 0; k--) {
            const piece = notes[k];
            const looksLikeReturn = /回歸|繼續|回來|復更/.test(piece) || /^\d{1,2}\/\d{1,2}$/.test(piece);
            const range = looksLikeReturn ? parseReturnText(piece, ref) : null;
            if (!range) continue;
            result.returnText = piece.replace(/(回歸|繼續|回來|復更)$/, '').trim() || piece;
            result.returnFrom = range.from;
            result.returnTo = range.to;
            notes.splice(k, 1);
        }
    }
    result.note = notes.join('・');
    if (/\d/.test(result.note)) result.flags.push('備註裡有數字，請確認話數是否正確');
    return result;
}

const CN_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function chineseNumber(text) {
    if (/^\d+$/.test(text)) return Number(text);
    // 支援到九十九：四、十二、二十、二十一
    const m = text.match(/^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    if (!m[2]) return CN_DIGITS[m[1]];
    return (m[1] ? CN_DIGITS[m[1]] : 1) * 10 + (m[3] ? CN_DIGITS[m[3]] : 0);
}

const EP_PART_WORDS = { '特別外傳': 'side', '外傳': 'side', '番外': 'side', '後記': 'after' };
const NOT_EPISODE_AFTER = '(?![\\d週個天年月次部萬%點號.:/])'; // 「6週沒看」「3個禮拜」不是話數

// 日期後面的話數：「 - 40」「 31-38」「48 49話」「 - 特別外傳1~3」「 - 後記」「133-最後」
function parseNoteHeader(text, pos) {
    const re = new RegExp(
        `\\s*(?:[-–]\\s*)?(?:來補|補個|補完|補)?\\s*(?:(特別外傳|外傳|番外|後記)\\s*)?` +
        `(?:(\\d{1,4}|最後)${NOT_EPISODE_AFTER}(?:\\s*(?:[-~～、,，]\\s*|\\s+)(\\d{1,4}|最後)${NOT_EPISODE_AFTER})?\\s*(?:話|集)?)?\\s*[)）]?`, 'y');
    re.lastIndex = pos;
    const m = re.exec(text);
    const note = { part: EP_PART_WORDS[m[1]] || 'main', from: null, to: null, toEnd: false };
    if (m[2] && m[2] !== '最後') note.from = Number(m[2]);
    if (m[3] === '最後') note.toEnd = true;
    else if (m[3]) note.to = Number(m[3]);
    return { note, end: re.lastIndex };
}

// 同一天裡又分「3話 …」「第四集 …」的，拆成多則（只在空白之後、且後面接空白才算）
function splitSubNotes(base, text) {
    const re = /(^|\s)(?:第\s*)?([一二三四五六七八九十]+|\d{1,3})\s*(?:話|集)(?=\s)/g;
    const cuts = [];
    let m;
    while ((m = re.exec(text))) {
        const n = chineseNumber(m[2]);
        if (n != null) cuts.push({ start: m.index + m[1].length, end: re.lastIndex, n });
    }
    if (!cuts.length) return [{ ...base, text: text.trim() }];
    const out = [];
    const head = text.slice(0, cuts[0].start).trim();
    if (head || base.from != null || base.part !== 'main') out.push({ ...base, text: head });
    cuts.forEach((c, k) => {
        const body = text.slice(c.end, k + 1 < cuts.length ? cuts[k + 1].start : text.length).trim();
        out.push({ date: base.date, part: base.part, from: c.n, to: null, toEnd: false, text: body });
    });
    return out;
}

// 心得：找出「5/30 31-38 …」「（6/4 - 39）…」「6/16 - 40 …」這類有日期的段落，拆成筆記
// 回傳 { comment（第一個日期之前的總評）, notes, flags } 或 null（沒有日期段落）
function parseCommentNotes(review) {
    const text = review.comment || '';
    const dateRe = /(^|[\s（(])[（(]?\s*(\d{1,2})\/(\d{1,2})(?:[-～~]\d{1,2})?/g;
    const headers = [];
    let m;
    while ((m = dateRe.exec(text))) {
        const month = Number(m[2]), day = Number(m[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;
        const { note, end } = parseNoteHeader(text, dateRe.lastIndex);
        headers.push({ start: m.index + m[1].length, end, month, day, note });
        dateRe.lastIndex = end;
    }
    if (!headers.length) return null;

    // 年份：以最後編輯時間為準；日期比最後編輯還晚的，算前一年
    const edited = review.updatedAtTs ? new Date(review.updatedAtTs) : new Date(String(review.updatedAt || '').match(/^\d{4}\/\d{1,2}\/\d{1,2}/)?.[0] || Date.now());
    const baseYear = isNaN(edited) ? new Date().getFullYear() : edited.getFullYear();
    const editedKey = isNaN(edited) ? 1231 : (edited.getMonth() + 1) * 100 + edited.getDate();

    const flags = [];
    const ep = normalizeEpisode(review.episode) || {};
    const notes = [];
    headers.forEach((h, k) => {
        const year = h.month * 100 + h.day > editedKey ? baseYear - 1 : baseYear;
        const date = `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
        // 下一則若以「（6/4 - 4）」開頭，那個「（」不屬於這一則
        const body = text.slice(h.end, k + 1 < headers.length ? headers[k + 1].start : text.length).replace(/[（(]\s*$/, '');
        const base = { date, ...h.note };
        // 有外傳的作品，很小的話數多半是外傳（例如本篇 91 話、筆記寫「6/4 - 4」）
        if (base.part === 'main' && base.from != null && ep.side && base.from <= ep.side && (base.to ?? base.from) <= ep.side && ep.main && base.from < ep.main / 2) {
            base.part = 'side';
            flags.push(`${h.month}/${h.day} 的 ${base.from}${base.to ? '–' + base.to : ''} 推測為外傳`);
        }
        notes.push(...splitSubNotes(base, body));
    });
    return { comment: text.slice(0, headers[0].start).replace(/[（(]\s*$/, '').trim(), notes, flags };
}

// 評分以 0.5 為單位（0 = 未評分）
function ratingValue(rating) {
    return Math.max(0, Math.min(5, Math.round((parseFloat(rating) || 0) * 2) / 2));
}

// 星星顯示：整顆、半顆（左半邊上色）、空的
function starsHtml(rating) {
    const r = ratingValue(rating);
    return `<span class="stars-display" aria-label="${r ? `${r} 星` : '未評分'}">${[1, 2, 3, 4, 5].map(k =>
        `<span class="${r >= k ? 'on' : r === k - 0.5 ? 'half' : ''}">★</span>`).join('')}</span>`;
}

function starsText(rating) {
    const r = Math.floor(ratingValue(rating));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// ---------- 資料存取 ----------

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
        console.error(`讀取 ${key} 失敗`, err);
        return fallback;
    }
}

// 舊資料遷移：
// 1. 話數寫在標題括號裡，例如「上流社會 (64)」「上流社會 (70+2+1)」→ 搬到 episode 欄位
// 2. episode 是舊格式（數字 64、字串 "70+2+1"）→ 轉成 { main, side, after }
// 3. 舊版 returnDate → returnText / returnFrom / returnTo
function migrateReviews(list) {
    let changed = false;
    list.forEach(r => {
        // 舊版只有確定日期 returnDate → 回歸時間
        if (r.returnDate) {
            if (!r.returnFrom) {
                const [, mo, d] = r.returnDate.split('-').map(Number);
                Object.assign(r, { returnText: `${mo}/${d}`, returnFrom: r.returnDate, returnTo: r.returnDate });
            }
            delete r.returnDate;
            changed = true;
        }
        if (r.episode !== undefined && r.episode !== '' && typeof r.episode !== 'object') {
            r.episode = normalizeEpisode(r.episode) || '';
            changed = true;
        }
        if (r.episode !== undefined && r.episode !== '') return;
        // 只自動處理一段或兩段（64、91+8）；三段的意思不一定，交給「整理舊資料」讓使用者確認
        const m = (r.title || '').match(/^(.*?)\s*[（(]\s*(\d+(?:\s*[+＋]\s*\d+)?)\s*[)）]\s*$/);
        if (!m || !m[1].trim()) return;
        r.title = m[1].trim();
        r.episode = normalizeEpisode(m[2]);
        changed = true;
    });
    return changed;
}

const Store = {
    loadReviews() {
        const list = readJson(STORAGE_KEYS.reviews, []);
        if (migrateReviews(list)) this.saveReviews(list);
        return list;
    },
    saveReviews(list) { localStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(list)); },
    loadMemo() { return localStorage.getItem(STORAGE_KEYS.memo) || ''; },
    saveMemo(text) { localStorage.setItem(STORAGE_KEYS.memo, text); },
    loadDraft() { return readJson(STORAGE_KEYS.draft, null); },
    saveDraft(data) { localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(data)); },
    clearDraft() { localStorage.removeItem(STORAGE_KEYS.draft); },
    loadUi() { return readJson(STORAGE_KEYS.ui, {}); },
    saveUi(prefs) { localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify(prefs)); },
    loadTracker() { return readJson(STORAGE_KEYS.commentTracker, null); },
    saveTracker(data) { localStorage.setItem(STORAGE_KEYS.commentTracker, JSON.stringify(data)); },
};

// ---------- 封面圖 ----------
// 封面存在 IndexedDB（localStorage 容量不夠放圖片），作品只記 coverId。

const CoverStore = {
    _db: null,
    open() {
        if (!this._db) {
            this._db = new Promise((resolve, reject) => {
                const req = indexedDB.open('webtoon_covers', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('covers');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return this._db;
    },
    async _run(mode, fn) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('covers', mode);
            const out = fn(tx.objectStore('covers'));
            tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
            tx.onerror = () => reject(tx.error);
        });
    },
    get(id) { return this._run('readonly', s => s.get(id)); },
    put(id, blob) { return this._run('readwrite', s => s.put(blob, id)); },
    delete(id) { return this._run('readwrite', s => s.delete(id)); },
    clear() { return this._run('readwrite', s => s.clear()); },
    getAll() {
        return this._run('readonly', s => {
            const map = new Map();
            s.openCursor().onsuccess = e => {
                const cursor = e.target.result;
                if (cursor) { map.set(cursor.key, cursor.value); cursor.continue(); }
            };
            return map;
        });
    },
};

const COVER_W = 240, COVER_H = 320; // 3:4 直式，顯示時最大約 96×128，2 倍解析度

// 把使用者選的圖片從中間裁成 3:4 並壓縮成小 JPEG（約 10–30KB）
async function makeCoverBlob(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('無法讀取這張圖片'));
            el.src = url;
        });
        const scale = Math.max(COVER_W / img.naturalWidth, COVER_H / img.naturalHeight);
        const sw = COVER_W / scale, sh = COVER_H / scale;
        const canvas = document.createElement('canvas');
        canvas.width = COVER_W;
        canvas.height = COVER_H;
        canvas.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, COVER_W, COVER_H);
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    } finally {
        URL.revokeObjectURL(url);
    }
}

function newCoverId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blobToDataUrl(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// 封面或佔位圖（標題第一個字）；url 由呼叫端提供
function coverHtml(review, url, size = 'md') {
    if (url) return `<img class="cover cover-${size}" src="${url}" alt="" loading="lazy">`;
    const first = Array.from(cleanTitleBrackets(review.title) || '?')[0];
    return `<div class="cover cover-${size} cover-placeholder" aria-hidden="true">${escapeHtml(first)}</div>`;
}

// ---------- 外觀（深色／淺色） ----------
// ui.theme：'auto'（跟隨手機）｜'dark'｜'light'
const THEME_LABELS = { auto: '跟隨手機', dark: '深色', light: '淺色' };

function currentTheme() {
    return Store.loadUi().theme || 'auto';
}

function applyTheme(theme = currentTheme()) {
    if (document.documentElement.hasAttribute('data-theme-lock')) return; // 固定外觀的頁面
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    // 手機瀏覽器上方的顏色跟著背景
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f1218';
}

if (typeof window !== 'undefined' && window.matchMedia) {
    applyTheme();
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme());
}

// ---------- 漫畫表單元件 ----------

/**
 * 在 container 裡建立一份漫畫表單，回傳 { getData, setData, isDirty, markClean }。
 * options.onInput：任何欄位改動時呼叫；options.teamOpen：創作團隊區塊預設展開。
 */
function createReviewForm(container, options = {}) {
    const state = { status: DEFAULT_STATUS, updateDay: '', platforms: [], rating: 0, coverId: '', twWebtoon: false };
    let cleanSnapshot = '';
    // 回歸時間換算後就固定下來；文字沒改就沿用原本的區間，避免過一陣子再存時「春天」被改算成明年
    let returnOrig = { text: '', from: '', to: '' };

    function currentReturn() {
        const text = $('[data-field="returnText"]').value.trim();
        if (text === returnOrig.text) return { text, from: returnOrig.from, to: returnOrig.to };
        const range = parseReturnText(text);
        return { text, from: range?.from || '', to: range?.to || '' };
    }

    container.innerHTML = `
        <div class="form-section cover-edit">
            <div data-role="cover-preview"></div>
            <div class="cover-actions">
                <label class="btn">🖼 選擇封面<input type="file" accept="image/*" hidden data-role="cover-input"></label>
                <button type="button" class="btn btn-ghost" data-role="cover-remove" hidden>移除封面</button>
                <div class="form-hint">會自動從中間裁成直式並壓縮</div>
            </div>
        </div>
        <div class="form-section">
            <label class="form-label">漫畫名稱</label>
            <input class="input" data-field="title" placeholder="例如：上流社會">
        </div>
        <div class="form-section">
            <label class="form-label">한국어 제목</label>
            <input class="input" data-field="krTitle" placeholder="예: 상류사회" lang="ko">
        </div>
        <div class="form-section">
            <label class="form-label">備註</label>
            <input class="input" data-field="note" placeholder="例如：等翻譯、找不到外傳、季1休">
        </div>
        <div class="form-section">
            <label class="form-label">閱讀狀態</label>
            <div class="chip-group" data-group="status">
                ${STATUSES.map(s => `<button type="button" class="chip" data-value="${s}" style="--opt-color: ${STATUS_CONFIG[s].color}">${s}</button>`).join('')}
            </div>
        </div>
        <div class="form-section" data-role="day-section">
            <label class="form-label">連載更新日</label>
            <div class="chip-group" data-group="day">
                ${DAYS.map(d => `<button type="button" class="chip chip-day" data-value="${d}">${DAY_MAP[d]}</button>`).join('')}
            </div>
        </div>
        <div class="form-section" data-role="return-section">
            <label class="form-label">回歸時間</label>
            <input class="input" data-field="returnText" placeholder="例如：10/14、6月中後、6, 7月、下半年、不定">
            <div class="form-hint" data-role="return-hint"></div>
        </div>
        <div class="form-section">
            <label class="form-label">看到第幾話</label>
            <div class="episode-grid">
                ${EPISODE_PARTS.map(({ key, label }) => `
                    <div>
                        <label class="form-label episode-label">${label}</label>
                        <input class="input" type="text" inputmode="numeric" autocomplete="off" data-ep="${key}" placeholder="—">
                    </div>`).join('')}
            </div>
            <div class="form-hint">有才填；「+1 話」會加在最後一個有填的欄位</div>
        </div>
        <div class="form-section">
            <label class="form-label">平台最新話數</label>
            <input class="input" type="text" inputmode="numeric" autocomplete="off" data-role="latest" placeholder="—" style="max-width: 160px; text-align: center;">
            <div class="form-hint" data-role="latest-hint">填了就會顯示「待補 N 話」；連載中會在每週更新日自動 +1，休刊或延更再手動修正</div>
        </div>
        <div class="form-section">
            <label class="form-label">發行平台</label>
            <div class="chip-group" data-group="platform">
                ${PLATFORMS.map(p => `<button type="button" class="chip" data-value="${p}" style="--opt-color: ${platformColor(p)}">${p}</button>`).join('')}
            </div>
            <div class="link-fields">
                ${PLATFORMS.map(p => `
                    <div class="link-field" data-link-row="${p}">
                        <span class="swatch" style="background: ${platformColor(p)}"></span>
                        <input class="input" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"
                            data-link="${p}" placeholder="${p} 作品網址（選填，貼上分享連結）">
                    </div>`).join('')}
            </div>
            <div class="form-hint">沒填網址時，點平台標籤會用韓文標題在該平台搜尋</div>
            <div class="tw-toggle">
                <button type="button" class="chip" data-toggle="twWebtoon" style="--opt-color: ${TW_WEBTOON_COLOR}">台版 Webtoon</button>
                <input class="input" data-field="twTitle" data-role="tw-title" placeholder="台版譯名（跟標題不同才填）">
            </div>
        </div>
        <div class="form-section">
            <label class="form-label">評分</label>
            <div class="star-input" data-group="rating">
                ${[1, 2, 3, 4, 5].map(n => `
                    <span class="star" data-star="${n}">★
                        <button type="button" class="half-left" data-value="${n - 0.5}" aria-label="${n - 0.5} 星"></button>
                        <button type="button" class="half-right" data-value="${n}" aria-label="${n} 星"></button>
                    </span>`).join('')}
                <span class="rating-number" data-role="rating-number"></span>
            </div>
            <div class="form-hint">點星星左半邊是半顆；再點一次目前的評分可以清除</div>
        </div>
        <div class="form-section form-row">
            <div>
                <label class="form-label">시작 (開始)</label>
                <input class="input" type="date" data-field="startDate">
            </div>
            <div>
                <label class="form-label">끝내다 (結束)</label>
                <input class="input" type="date" data-field="endDate">
            </div>
        </div>
        <div class="form-section">
            <label class="form-label">評論</label>
            <textarea class="input" data-field="comment" rows="6" placeholder="寫下你的心得..."></textarea>
        </div>
        <details class="team-details form-section"${options.teamOpen ? ' open' : ''}>
            <summary><span>創作團隊 <span data-role="team-count"></span></span></summary>
            <div class="team-grid">
                ${JOB_KEYS.map(j => `
                    <div>
                        <label class="form-label">${j.label} (${j.hint})</label>
                        <input class="input" data-field="${j.key}" lang="ko">
                    </div>`).join('')}
            </div>
            <div class="form-hint" style="padding: 0 16px 14px;">多位人員請用「、」分隔，會自動找出合作過的其他作品</div>
        </details>
    `;

    const $ = sel => container.querySelector(sel);
    const textFields = Array.from(container.querySelectorAll('[data-field]'));

    function refreshChips() {
        container.querySelectorAll('[data-group="status"] .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === state.status));
        container.querySelectorAll('[data-group="day"] .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === state.updateDay));
        container.querySelectorAll('[data-group="platform"] .chip').forEach(b => b.classList.toggle('selected', state.platforms.includes(b.dataset.value)));
        container.querySelectorAll('[data-group="rating"] .star').forEach(star => {
            const k = Number(star.dataset.star);
            star.classList.toggle('on', state.rating >= k);
            star.classList.toggle('half', state.rating === k - 0.5);
        });
        $('[data-role="rating-number"]').textContent = state.rating ? state.rating : '';
        container.querySelectorAll('[data-link-row]').forEach(row => { row.hidden = !state.platforms.includes(row.dataset.linkRow); });
        $('[data-toggle="twWebtoon"]').classList.toggle('selected', state.twWebtoon);
        $('[data-role="tw-title"]').hidden = !state.twWebtoon;
        $('[data-role="day-section"]').style.display = state.status === DEFAULT_STATUS ? '' : 'none';
        $('[data-role="return-section"]').style.display = state.status === '休刊' ? '' : 'none';
        const ret = currentReturn();
        $('[data-role="return-hint"]').textContent = !ret.text ? '輸入後會換算成日期；到了會在本週頁和首頁提醒你'
            : ret.from ? `→ ${returnRangeLabel(ret.from, ret.to)}` : '→ 未定（不會提醒）';
        const filled = JOB_KEYS.filter(j => $(`[data-field="${j.key}"]`).value.trim()).length;
        $('[data-role="team-count"]').textContent = filled ? `(已填 ${filled} 項)` : '';
    }

    function changed() {
        refreshChips();
        options.onInput?.();
    }

    let previewUrl = null;
    let coverBusy = false; // 壓縮封面中，避免這時按儲存漏掉新封面
    async function refreshCover() {
        const id = state.coverId;
        const blob = id ? await CoverStore.get(id).catch(() => null) : null;
        if (id !== state.coverId) return; // 讀取期間又換了封面
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = blob ? URL.createObjectURL(blob) : null;
        $('[data-role="cover-preview"]').innerHTML = coverHtml({ title: $('[data-field="title"]').value }, previewUrl, 'lg');
        $('[data-role="cover-remove"]').hidden = !id;
    }

    $('[data-role="cover-input"]').addEventListener('change', async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        coverBusy = true;
        $('[data-role="cover-preview"]').innerHTML = '<div class="cover cover-lg cover-placeholder">…</div>';
        try {
            const blob = await makeCoverBlob(file);
            const id = newCoverId();
            await CoverStore.put(id, blob);
            state.coverId = id;
            await refreshCover();
            changed();
        } catch (err) {
            alert(`封面儲存失敗：${err.message}`);
            refreshCover();
        } finally {
            coverBusy = false;
        }
    });
    $('[data-role="cover-remove"]').addEventListener('click', () => {
        state.coverId = '';
        refreshCover();
        changed();
    });
    // 沒有封面時，佔位圖顯示標題第一個字
    $('[data-field="title"]').addEventListener('input', () => { if (!state.coverId) refreshCover(); });

    container.addEventListener('click', e => {
        const toggle = e.target.closest('button[data-toggle="twWebtoon"]');
        if (toggle) {
            state.twWebtoon = !state.twWebtoon;
            changed();
            return;
        }
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        const group = btn.closest('[data-group]').dataset.group;
        const value = btn.dataset.value;
        if (group === 'status') state.status = value;
        if (group === 'day') state.updateDay = state.updateDay === value ? '' : value;
        if (group === 'platform') {
            state.platforms = state.platforms.includes(value)
                ? state.platforms.filter(p => p !== value)
                : [...state.platforms, value];
        }
        if (group === 'rating') {
            const n = Number(value);
            state.rating = state.rating === n ? 0 : n;
        }
        changed();
    });
    container.addEventListener('input', changed);

    function getData() {
        const data = {};
        textFields.forEach(el => { data[el.dataset.field] = el.value; });
        const links = {};
        container.querySelectorAll('[data-link]').forEach(el => {
            const p = el.dataset.link;
            if (state.platforms.includes(p) && el.value.trim()) links[p] = el.value.trim();
        });
        const episode = {};
        container.querySelectorAll('[data-ep]').forEach(el => {
            const n = parseInt(el.value);
            if (/^\d+$/.test(el.value.trim()) && n >= 0) episode[el.dataset.ep] = n;
        });
        // 最新話數：表單顯示的是「目前」最新（含自動 +1），存檔時以今天為基準固定下來
        const latestRaw = $('[data-role="latest"]').value.trim();
        const latestPart = currentEpisodePart(episode).key;
        const latest = /^\d+$/.test(latestRaw) ? { n: Number(latestRaw), part: latestPart, asOf: toDateStr(new Date()) } : '';
        return {
            ...data,
            latest,
            episode: Object.keys(episode).length ? episode : '',
            links,
            status: state.status,
            updateDay: state.status === DEFAULT_STATUS ? state.updateDay : '',
            ...(() => {
                const ret = state.status === '休刊' ? currentReturn() : { text: '', from: '', to: '' };
                return { returnText: ret.text, returnFrom: ret.from, returnTo: ret.to };
            })(),
            platforms: [...state.platforms],
            rating: state.rating,
            coverId: state.coverId,
            twWebtoon: state.twWebtoon,
            twTitle: state.twWebtoon ? data.twTitle.trim() : '',
        };
    }

    function setData(data = {}) {
        returnOrig = { text: (data.returnText || '').trim(), from: data.returnFrom || '', to: data.returnTo || '' };
        textFields.forEach(el => { el.value = data[el.dataset.field] ?? ''; });
        container.querySelectorAll('[data-link]').forEach(el => { el.value = (data.links || {})[el.dataset.link] || ''; });
        const ep = normalizeEpisode(data.episode) || {};
        container.querySelectorAll('[data-ep]').forEach(el => { el.value = ep[el.dataset.ep] ?? ''; });
        $('[data-role="latest"]').value = latestEpisode(data)?.n ?? '';
        state.status = STATUS_CONFIG[data.status] ? data.status : DEFAULT_STATUS;
        state.updateDay = DAY_MAP[data.updateDay] ? data.updateDay : '';
        state.platforms = [...(data.platforms || [])];
        state.rating = ratingValue(data.rating);
        state.coverId = data.coverId || '';
        state.twWebtoon = !!data.twWebtoon;
        refreshCover();
        refreshChips();
        markClean();
    }

    // 回傳錯誤訊息，沒問題則回傳空字串
    function validate() {
        if (coverBusy) return '封面處理中，請稍候再儲存';
        const latestRaw = $('[data-role="latest"]').value.trim();
        if (latestRaw && !/^\d+$/.test(latestRaw)) return '「平台最新話數」只能填數字';
        const bad = EPISODE_PARTS.find(({ key }) => {
            const v = $(`[data-ep="${key}"]`).value.trim();
            return v && !/^\d+$/.test(v);
        });
        return bad ? `「${bad.label}」話數只能填數字` : '';
    }

    function markClean() { cleanSnapshot = JSON.stringify(getData()); }
    function isDirty() { return JSON.stringify(getData()) !== cleanSnapshot; }

    setData({});
    return { getData, setData, isDirty, markClean, validate, focusTitle: () => $('[data-field="title"]').focus() };
}
