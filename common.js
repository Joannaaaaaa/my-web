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

const Store = {
    loadReviews() { return readJson(STORAGE_KEYS.reviews, []); },
    saveReviews(list) { localStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(list)); },
    loadMemo() { return localStorage.getItem(STORAGE_KEYS.memo) || ''; },
    saveMemo(text) { localStorage.setItem(STORAGE_KEYS.memo, text); },
    loadDraft() { return readJson(STORAGE_KEYS.draft, null); },
    saveDraft(data) { localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(data)); },
    clearDraft() { localStorage.removeItem(STORAGE_KEYS.draft); },
    loadUi() { return readJson(STORAGE_KEYS.ui, {}); },
    saveUi(prefs) { localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify(prefs)); },
};

// ---------- 漫畫表單元件 ----------

/**
 * 在 container 裡建立一份漫畫表單，回傳 { getData, setData, isDirty, markClean }。
 * options.onInput：任何欄位改動時呼叫；options.teamOpen：創作團隊區塊預設展開。
 */
function createReviewForm(container, options = {}) {
    const state = { status: DEFAULT_STATUS, updateDay: '', platforms: [], rating: 0 };
    let cleanSnapshot = '';

    container.innerHTML = `
        <div class="form-section">
            <label class="form-label">漫畫名稱</label>
            <input class="input" data-field="title" placeholder="例如：上流社會 (64)">
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
        const filled = JOB_KEYS.filter(j => $(`[data-field="${j.key}"]`).value.trim()).length;
        $('[data-role="team-count"]').textContent = filled ? `(已填 ${filled} 項)` : '';
    }

    function changed() {
        refreshChips();
        options.onInput?.();
    }

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
        return {
            ...data,
            links,
            status: state.status,
            updateDay: state.status === DEFAULT_STATUS ? state.updateDay : '',
            platforms: [...state.platforms],
            rating: state.rating,
        };
    }

    function setData(data = {}) {
        textFields.forEach(el => { el.value = data[el.dataset.field] || ''; });
        container.querySelectorAll('[data-link]').forEach(el => { el.value = (data.links || {})[el.dataset.link] || ''; });
        state.status = STATUS_CONFIG[data.status] ? data.status : DEFAULT_STATUS;
        state.updateDay = DAY_MAP[data.updateDay] ? data.updateDay : '';
        state.platforms = [...(data.platforms || [])];
        state.rating = Math.max(0, Math.min(5, parseInt(data.rating) || 0));
        refreshChips();
        markClean();
    }

    function markClean() { cleanSnapshot = JSON.stringify(getData()); }
    function isDirty() { return JSON.stringify(getData()) !== cleanSnapshot; }

    setData({});
    return { getData, setData, isDirty, markClean, focusTitle: () => $('[data-field="title"]').focus() };
}
