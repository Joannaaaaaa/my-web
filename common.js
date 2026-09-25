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
    }).join(' ');
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

function episodeText(review) {
    const label = episodeLabel(review.episode);
    return label ? `看到 ${label}` : '';
}

function starsText(rating) {
    const r = Math.max(0, Math.min(5, parseInt(rating) || 0));
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
function migrateReviews(list) {
    let changed = false;
    list.forEach(r => {
        if (r.episode !== undefined && r.episode !== '' && typeof r.episode !== 'object') {
            r.episode = normalizeEpisode(r.episode) || '';
            changed = true;
        }
        if (r.episode !== undefined && r.episode !== '') return;
        const m = (r.title || '').match(/^(.*?)\s*[（(]\s*(\d+(?:\s*[+＋]\s*\d+){0,2})\s*[)）]\s*$/);
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

// ---------- 漫畫表單元件 ----------

/**
 * 在 container 裡建立一份漫畫表單，回傳 { getData, setData, isDirty, markClean }。
 * options.onInput：任何欄位改動時呼叫；options.teamOpen：創作團隊區塊預設展開。
 */
function createReviewForm(container, options = {}) {
    const state = { status: DEFAULT_STATUS, updateDay: '', platforms: [], rating: 0, coverId: '' };
    let cleanSnapshot = '';

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
            <label class="form-label">預計回歸日</label>
            <input class="input" type="date" data-field="returnDate" style="max-width: 220px;">
            <div class="form-hint">到了這天，本週頁和首頁上方會提醒你</div>
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
        </div>
        <div class="form-section">
            <label class="form-label">評分</label>
            <div class="star-input" data-group="rating">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-value="${n}" aria-label="${n} 星">★</button>`).join('')}
            </div>
            <div class="form-hint">再點一次目前的星等可以清除評分</div>
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
        container.querySelectorAll('[data-group="rating"] button').forEach(b => b.classList.toggle('on', parseInt(b.dataset.value) <= state.rating));
        container.querySelectorAll('[data-link-row]').forEach(row => { row.hidden = !state.platforms.includes(row.dataset.linkRow); });
        $('[data-role="day-section"]').style.display = state.status === DEFAULT_STATUS ? '' : 'none';
        $('[data-role="return-section"]').style.display = state.status === '休刊' ? '' : 'none';
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
        const btn = e.target.closest('button[data-value]');
        if (!btn) return;
        const group = btn.parentElement.dataset.group;
        const value = btn.dataset.value;
        if (group === 'status') state.status = value;
        if (group === 'day') state.updateDay = state.updateDay === value ? '' : value;
        if (group === 'platform') {
            state.platforms = state.platforms.includes(value)
                ? state.platforms.filter(p => p !== value)
                : [...state.platforms, value];
        }
        if (group === 'rating') {
            const n = parseInt(value);
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
        return {
            ...data,
            episode: Object.keys(episode).length ? episode : '',
            links,
            status: state.status,
            updateDay: state.status === DEFAULT_STATUS ? state.updateDay : '',
            returnDate: state.status === '休刊' ? data.returnDate : '',
            platforms: [...state.platforms],
            rating: state.rating,
            coverId: state.coverId,
        };
    }

    function setData(data = {}) {
        textFields.forEach(el => { el.value = data[el.dataset.field] ?? ''; });
        container.querySelectorAll('[data-link]').forEach(el => { el.value = (data.links || {})[el.dataset.link] || ''; });
        const ep = normalizeEpisode(data.episode) || {};
        container.querySelectorAll('[data-ep]').forEach(el => { el.value = ep[el.dataset.ep] ?? ''; });
        state.status = STATUS_CONFIG[data.status] ? data.status : DEFAULT_STATUS;
        state.updateDay = DAY_MAP[data.updateDay] ? data.updateDay : '';
        state.platforms = [...(data.platforms || [])];
        state.rating = Math.max(0, Math.min(5, parseInt(data.rating) || 0));
        state.coverId = data.coverId || '';
        refreshCover();
        refreshChips();
        markClean();
    }

    // 回傳錯誤訊息，沒問題則回傳空字串
    function validate() {
        if (coverBusy) return '封面處理中，請稍候再儲存';
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
