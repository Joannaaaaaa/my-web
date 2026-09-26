import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();

// 💡 允許你的前端網頁 (不論是本機打開還是部署在 GitHub Pages) 跨網域存取

app.use(cors()); // 允許你的前端網頁存取這個後端
axios.defaults.timeout = 20000; // 平台太久沒回應就放棄，免得一直卡住

// 平台錯誤轉給網頁：404＝這一話不存在（還沒出），其他是逾時或平台出錯（網頁會顯示「查詢失敗」）
function sendUpstreamError(res, error, what) {
    const status = error.response?.status;
    if (status === 404) return res.status(404).send('這一話不存在');
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return res.status(504).send('平台回應逾時');
    res.status(502).send(`${what}失敗${status ? `（平台回應 ${status}）` : ''}`);
}
app.get('/get-comments', async (req, res) => {
    try {
        // 新增接收 offsetPostId 參數
        const { bookId, platform, limit, offsetPostId = "" } = req.query;
        let response;

        // pinRepresentation=distinct：BEST 留言另外放在 result.tops（不會重複出現在 posts），=none 的話平台不回傳 BEST
        if (platform === 'webtoon') {
            // 將 offsetPostId 動態帶入 URL
            const targetUrl = `https://www.webtoons.com/p/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=distinct&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&withCursor=false&offsetPostId=${offsetPostId}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'epicom',
                    'user-agent': 'Mozilla/5.0...'
                }
            });
        } else if (platform === 'naver') {
            const targetUrl = `https://comic.naver.com/comment/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=distinct&pinType=&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&offsetPostId=${offsetPostId}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'comic_webtoon',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                }
            });

        } else {
            // Ridibooks 邏輯不變[cite: 2]
            const offset = req.query.offset || 0;
            const targetUrl = `https://reading-data-api.ridibooks.com/serial-comment/${bookId}?offset=${offset}&limit=${limit}&sort=MOST_LIKED`;
            response = await axios.get(targetUrl);
        }
        res.json(response.data);
    } catch (error) {
        sendUpstreamError(res, error, '抓取留言');
    }
});

app.get('/get-replies', async (req, res) => {
    try {
        const { postId, limit, bookId, platform } = req.query;
        // 韓版 Naver Child Posts API
        console.log(`🚀 正在發送請求至 ${platform} 的回覆 API，postId: ${postId}, bookId: ${bookId}, limit: ${limit}`);
        let response, targetUrl;
        if (platform === 'webtoon') {
            targetUrl = `https://www.webtoons.com/p/api/community/v2/post/${postId}/child-posts?sort=oldest&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&withCursor=false&offsetPostId=`;

            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'epicom',
                    'user-agent': 'Mozilla/5.0...'
                }
            });
        }
        else if(platform === 'naver') {
            targetUrl = `https://comic.naver.com/comment/api/community/v2/post/${postId}/child-posts?sort=oldest&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'comic_webtoon',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
                }
            });
        } else if (platform === 'ridi') {
            // 新增：處理 Ridibooks 的回覆 API
            // 注意：Ridi 的回覆 API 路徑通常包含 bookId 與 commentId (postId)
            targetUrl = `https://reading-data-api.ridibooks.com/serial-comment/${bookId}/comments/${postId}/replies?offset=0&limit=2147483647`;
            response = await axios.get(targetUrl);
        }
        res.json(response.data);
    } catch (error) {
        sendUpstreamError(res, error, '抓取回覆');
    }
});

// 讓前端先把 Render 從休眠叫醒
app.get('/ping', (req, res) => res.json({ ok: true }));

// Ridi 每一話是不同的 bookId，從作品頁的資料找出「第幾話 → bookId」對照
// 回傳 [{ volume: 45, id: '4928005136' }, ...]；同一部作品快取一小時
const ridiEpisodeCache = new Map();
app.get('/ridi-episodes', async (req, res) => {
    const { bookId } = req.query;
    if (!/^\d+$/.test(bookId || '')) return res.status(400).send('bookId 格式錯誤');
    const cached = ridiEpisodeCache.get(bookId);
    if (cached && Date.now() - cached.at < 60 * 60 * 1000) return res.json(cached.episodes);
    try {
        // 用內建 fetch：Ridi 會擋 axios 的連線（同樣的標頭也回 403）
        const page = await fetch(`https://ridibooks.com/books/${bookId}`, {
            headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
        });
        if (!page.ok) throw new Error(`Ridi ${page.status}`);
        const html = await page.text();
        const re = /"id":"(\d{6,})","title":"(?:[^"\\]|\\.)*","series_title":(?:null|"(?:[^"\\]|\\.)*"),"author":(?:null|"(?:[^"\\]|\\.)*"),"genre":"[a-z]+","pub_id":"\d+","volume":"(\d+)"/g;
        const byVolume = new Map();
        let m;
        while ((m = re.exec(html))) {
            if (!byVolume.has(Number(m[2]))) byVolume.set(Number(m[2]), m[1]);
        }
        const episodes = [...byVolume].sort((a, b) => a[0] - b[0]).map(([volume, id]) => ({ volume, id }));
        if (!episodes.length) return res.status(404).send('找不到話數資料');
        ridiEpisodeCache.set(bookId, { at: Date.now(), episodes });
        res.json(episodes);
    } catch (error) {
        res.status(500).send('抓取 Ridi 話數失敗');
    }
});

// 用標題查作品：Naver、Ridi、Naver Series、Bomtoon 用韓文標題，台版 Webtoon 用中文標題
// 回傳 [{ seriesId, title, author, edition }]；Ridi 只留漫畫（웹툰分類 1600），排除小說
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const decodeEntities = str => String(str || '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
app.get('/search-series', async (req, res) => {
    const { platform } = req.query;
    const keyword = String(req.query.keyword || '').trim();
    if (!keyword) return res.status(400).send('缺少 keyword');
    const q = encodeURIComponent(keyword);
    try {
        let results = [];
        if (platform === 'naver') {
            const r = await fetch(`https://comic.naver.com/api/search/all?keyword=${q}`, { headers: { 'user-agent': MOBILE_UA } });
            const data = await r.json();
            results = (data.searchWebtoonResult?.searchViewList || []).map(it => ({
                seriesId: String(it.titleId), title: it.titleName, author: it.displayAuthor || '',
            }));
        } else if (platform === 'ridi') {
            const r = await fetch(`https://search-api.ridibooks.com/search?keyword=${q}&where=book&site=ridi-store&what=base&adult_exclude=n`, { headers: { 'user-agent': MOBILE_UA } });
            const data = await r.json();
            results = (data.books || []).filter(b => b.parent_category === 1600).map(b => ({
                seriesId: String(b.b_id), title: b.title, author: b.author || '',
                edition: (b.title.match(/\[(완전판|개정판)\]/) || [])[1] || '',
            }));
        } else if (platform === 'webtoon') {
            const r = await fetch(`https://m.webtoons.com/zh-hant/search/result?keyword=${q}&searchType=WEBTOON&start=1`, {
                headers: { 'user-agent': MOBILE_UA, referer: 'https://m.webtoons.com/zh-hant/search', 'x-requested-with': 'XMLHttpRequest' },
            });
            const data = await r.json();
            results = (data.result?.webtoonResult?.titleList || []).map(t => ({
                seriesId: String(t.titleNo), title: t.title,
                author: [t.writingAuthorName, t.pictureAuthorName].filter(Boolean).join(' / '),
            }));
        } else if (platform === 'series') {
            // Naver Series 沒有公開 API，解析「만화」分頁的搜尋結果
            const r = await fetch(`https://series.naver.com/search/search.series?t=comic&q=${q}`, { headers: { 'user-agent': DESKTOP_UA } });
            const html = await r.text();
            const seen = new Set();
            const re = /href="\/comic\/detail\.series\?productNo=(\d+)" class="N=a:com\.title">([^<]*)/g;
            let m;
            while ((m = re.exec(html))) {
                if (seen.has(m[1])) continue;
                seen.add(m[1]);
                const [name, extra = ''] = decodeEntities(m[2]).split('\n');
                results.push({ seriesId: m[1], title: name.trim(), author: '', edition: extra.includes('완결') && !extra.includes('미완결') ? '완결' : '' });
            }
        } else if (platform === 'kakaowebtoon') {
            results = await kakaoWebtoonSearch(keyword);
        } else if (platform === 'bomtoon') {
            const r = await fetch(`https://www.bomtoon.com/api/balcony-search-api/search?searchText=${q}`, { headers: { 'user-agent': DESKTOP_UA } });
            const data = await r.json();
            results = (data.data?.results || []).filter(b => b.contentsType !== 'novel').map(b => ({
                seriesId: b.alias, title: b.title, author: (b.author || []).join(', '),
                edition: (b.title.match(/\[(완전판|개정판)\]/) || [])[1] || '',
            }));
        } else {
            return res.status(400).send('platform 必須是 naver、ridi、webtoon、series、bomtoon 或 kakaowebtoon');
        }
        res.json(results);
    } catch (error) {
        res.status(500).send('搜尋失敗');
    }
});

// 自動填入用：用作品編號查資料
// 回傳 { platform, seriesId, url, title, cover, latest, latestParts, day, finished, people: { author, adapter, artist, studio } }
// latestParts = { main, side, special, after }：本篇／外傳／特別外傳／後記各自最新第幾話（Naver 含付費預覽），latest = latestParts.main
// day 是 Mon～Sun 或空字串
const DAY_FROM_EN = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
const DAY_FROM_KR = { 월: 'Mon', 화: 'Tue', 수: 'Wed', 목: 'Thu', 금: 'Fri', 토: 'Sat', 일: 'Sun' };
// 話次標題 → 數字：取最後一個「N화」，或「331. 제107장」這種開頭數字；「마지막 화」「엔딩」回傳 null
const episodeNo = title => {
    const t = String(title || '');
    const all = [...t.matchAll(/(\d+)\s*화/g)];
    if (all.length) return Number(all[all.length - 1][1]);
    const lead = t.match(/^(\d+)[.\s]/);
    return lead ? Number(lead[1]) : null;
};
const SPECIAL_RE = /특별\s*외전|특외|특별편/; // 特別外傳（比一般外傳先判斷）
const SIDE_RE = /외전|번외/;
const AFTER_RE = /후기/;

// 依「新 → 舊」的話次標題算出本篇／外傳／特別外傳／後記各自最新第幾話
// 特別外傳：특별외전、특외、특별편；外傳：외전、번외；後記：후기（「외전 마지막화+후기」同時算外傳和後記）
// 沒有數字的（마지막 화、엔딩）= 同一段前一個有數字的話 + 1
function createPartCounter() {
    const parts = { main: { n: null, extra: 0 }, side: { n: null, extra: 0 }, special: { n: null, extra: 0 } };
    let after = 0;
    return {
        add(title) {
            const t = String(title || '');
            const key = SPECIAL_RE.test(t) ? 'special' : SIDE_RE.test(t) ? 'side' : 'main';
            if (AFTER_RE.test(t)) {
                after++;
                if (key === 'main') return;
            }
            const part = parts[key];
            if (part.n != null) return;
            const n = episodeNo(t);
            if (n == null) part.extra++;
            else part.n = n + part.extra;
        },
        get mainFound() { return parts.main.n != null; },
        // 找到本篇，而且（有指定的話）也找到正在看的那一段
        done(need) {
            if (parts.main.n == null) return false;
            if (need === 'after') return after > 0;
            return !parts[need] || parts[need].n != null; // 沒編號的（특별편 [Change off]）要數完才知道幾話
        },
        result() {
            const pick = p => p.n ?? (p.extra || null);
            return { main: pick(parts.main), side: pick(parts.side), special: pick(parts.special), after: after || null };
        },
    };
}
const MAX_LIST_PAGES = 10; // 找本篇最新話最多往回翻幾頁（外傳很長的作品要翻比較多頁）
// 使用者正在看外傳／特別外傳時（need），那一段可能夾在很前面，最多翻到這麼多頁
const MAX_LIST_PAGES_NEED = 40;
const STUDIO_RE = /코믹스|스튜디오|studio|comics|웹툰|엔터|미디어|media|ent\b/i;

async function naverInfo(id, need) {
    const headers = { 'user-agent': MOBILE_UA };
    const info = await (await fetch(`https://comic.naver.com/api/article/list/info?titleId=${id}`, { headers })).json();
    if (!info.titleName) throw new Error('找不到作品');
    // 付費預覽（chargeFolderArticleList）比免費的新，一起算；往回翻頁直到找到本篇的話數
    const counter = createPartCounter();
    const maxPages = need && need !== 'main' ? MAX_LIST_PAGES_NEED : MAX_LIST_PAGES;
    for (let page = 1; page <= maxPages && !counter.done(need); page++) {
        const list = await (await fetch(`https://comic.naver.com/api/article/list?titleId=${id}&page=${page}&sort=DESC`, { headers })).json();
        const articles = [...(page === 1 ? list.chargeFolderArticleList || [] : []), ...(list.articleList || [])];
        articles.forEach(a => counter.add(a.subtitle));
        if (page >= (list.pageInfo?.totalPages || 1)) break;
    }
    const latestParts = counter.result();
    const people = { author: [], adapter: [], artist: [], studio: [] };
    for (const a of info.communityArtists || []) {
        const types = a.artistTypeList || [];
        if (types.includes('ARTIST_NOVEL_ORIGIN')) people.author.push(a.name);
        if (types.includes('ARTIST_WRITER')) people.adapter.push(a.name);
        if (types.includes('ARTIST_PAINTER')) people.artist.push(a.name);
    }
    return {
        title: info.titleName,
        url: `https://comic.naver.com/webtoon/list?titleId=${id}`,
        cover: info.thumbnailUrl || '',
        latest: latestParts.main,
        latestParts,
        day: (info.publishDayOfWeekList || []).map(d => DAY_FROM_EN[d]).find(Boolean) || '',
        finished: !!info.finished,
        people,
    };
}

async function ridiInfo(id) {
    const get = async bookId => {
        const r = await fetch(`https://book-api.ridibooks.com/books/${bookId}`, { headers: { 'user-agent': MOBILE_UA } });
        if (!r.ok) throw new Error('找不到作品');
        return r.json();
    };
    const book = await get(id);
    const series = book.series || {};
    const prop = series.property || {};
    const rootId = series.id || id;
    // 作品頁有每一話的標題（含還沒開放的），只算到已開放的最後一話
    let openedVolume = Infinity;
    if (prop.opened_last_volume_id) {
        const last = prop.opened_last_volume_id === id ? book : await get(prop.opened_last_volume_id);
        openedVolume = last.series?.volume ?? Infinity;
    }
    const page = await fetch(`https://ridibooks.com/books/${rootId}`, { headers: { 'user-agent': MOBILE_UA } });
    const html = page.ok ? await page.text() : '';
    const titles = new Map();
    const re = /"id":"\d{6,}","title":"((?:[^"\\]|\\.)*)","series_title":(?:null|"(?:[^"\\]|\\.)*"),"author":(?:null|"(?:[^"\\]|\\.)*"),"genre":"[a-z]+","pub_id":"\d+","volume":"(\d+)"/g;
    let m;
    while ((m = re.exec(html))) {
        const volume = Number(m[2]);
        if (volume <= openedVolume && !titles.has(volume)) titles.set(volume, JSON.parse(`"${m[1]}"`));
    }
    const counter = createPartCounter();
    [...titles].sort((a, b) => b[0] - a[0]).forEach(([, title]) => counter.add(title));
    const latestParts = counter.result();
    if (!titles.size && Number.isFinite(openedVolume)) latestParts.main = openedVolume;
    const schedule = (html.match(/"schedules":\[\{"content":"[^"]*","title":"([^"]*)"/) || [])[1] || '';
    const dayMatch = schedule.match(/매주\s*([월화수목금토일])/);
    const people = { author: [], adapter: [], artist: [], studio: [] };
    for (const a of book.authors || []) {
        const role = String(a.role || '').toUpperCase();
        if (role === 'ORIGINAL_AUTHOR') people.author.push(a.name);
        else if (role === 'STORY_WRITER') people.adapter.push(a.name);
        else if (role === 'ILLUSTRATOR') people.artist.push(a.name);
        else if (role === 'AUTHOR' || role === 'COMIC_AUTHOR') (STUDIO_RE.test(a.name) ? people.studio : people.artist).push(a.name);
    }
    return {
        title: prop.title || book.title?.main || '',
        url: `https://ridibooks.com/books/${rootId}`,
        cover: `https://img.ridicdn.net/cover/${rootId}/xxlarge`,
        latest: latestParts.main,
        latestParts,
        day: dayMatch ? DAY_FROM_KR[dayMatch[1]] : '',
        finished: !!(prop.is_serial_complete || prop.is_completed),
        people,
    };
}

async function seriesInfo(id, need) {
    const r = await fetch(`https://series.naver.com/comic/detail.series?productNo=${id}`, { headers: { 'user-agent': DESKTOP_UA } });
    if (!r.ok) throw new Error('找不到作品');
    const html = await r.text();
    const meta = name => decodeEntities((html.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`)) || [])[1] || '');
    const title = meta('title');
    if (!title) throw new Error('找不到作品');
    const desc = meta('description');
    const people = { author: [], adapter: [], artist: [], studio: [] };
    const roles = { 원작: 'author', 글: 'adapter', 그림: 'artist' };
    const re = /<li><span>(원작|글|그림)<\/span>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const names = [...m[2].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map(x => decodeEntities(x[1]).trim()).filter(Boolean);
        people[roles[m[1]]].push(...(names.length ? names : [decodeEntities(m[2].replace(/<[^>]*>/g, '')).trim()].filter(Boolean)));
    }
    const dayMatch = decodeEntities(html).match(/매주\s*([월화수목금토일])요일/);
    // 話次清單（新 → 舊，一頁 30 話），標題像「화산귀환[독점] 181화」
    const counter = createPartCounter();
    const maxPages = need && need !== 'main' ? MAX_LIST_PAGES_NEED : MAX_LIST_PAGES;
    for (let page = 1; page <= maxPages && !counter.done(need); page++) {
        const r2 = await fetch(`https://series.naver.com/comic/volumeList.series?productNo=${id}&sortOrder=DESC&totalCount=9999&page=${page}`, { headers: { 'user-agent': DESKTOP_UA } });
        const list = (await r2.json().catch(() => ({}))).resultData || [];
        list.forEach(v => counter.add(String(v.expansionProductName || '').replace(v.productName || '', '')));
        if (list.length < 30) break;
    }
    const latestParts = counter.result();
    return {
        title,
        url: `https://series.naver.com/comic/detail.series?productNo=${id}`,
        cover: meta('image').replace(/\?type=.*$/, '?type=m260'),
        latest: latestParts.main,
        latestParts,
        day: dayMatch ? DAY_FROM_KR[dayMatch[1]] : '',
        finished: /^\d+\s*화\s*완결/.test(desc),
        people,
    };
}

// Bomtoon：作品頁（Next.js）的 __NEXT_DATA__ 有完整資料；作品編號是網址上的英文代號（detail/j_jinx）
// 成人作品未登入時沒有 ssrDetail，改用 openGraphData（標題、封面、作者、話次標題），連載狀態未知
const BOMTOON_DAY = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
async function bomtoonInfo(alias) {
    const r = await fetch(`https://www.bomtoon.com/detail/${alias}`, { headers: { 'user-agent': DESKTOP_UA } });
    if (!r.ok) throw new Error('找不到作品');
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    const props = m ? JSON.parse(m[1]).props?.pageProps || {} : {};
    const detail = props.ssrDetail;
    const og = props.openGraphData;
    if (!detail && !og?.title) throw new Error('找不到作品');
    const people = { author: [], adapter: [], artist: [], studio: [] };
    if (detail) {
        for (const c of detail.creators || []) {
            if (c.type === 'ORIGINAL') people.author.push(c.name);
            else if (c.type === 'WRITER' || c.type === 'ADAPTER') people.adapter.push(c.name);
            else if (c.type === 'ARTIST') people.artist.push(c.name);
            else (STUDIO_RE.test(c.name) ? people.studio : people.artist).push(c.name);
        }
    } else {
        String(og.creators || '').split(',').map(n => n.trim()).filter(Boolean)
            .forEach(n => (STUDIO_RE.test(n) ? people.studio : people.artist).push(n));
    }
    const counter = createPartCounter();
    [...((detail || og).episodes || [])].reverse().forEach(e => counter.add(e.title));
    const latestParts = counter.result();
    const schedule = (detail?.schedules || []).map(x => BOMTOON_DAY[String(x).replace('GROUP_SCHEDULE_', '')]).find(Boolean) || '';
    return {
        title: detail?.title || og.title,
        url: `https://www.bomtoon.com/detail/${alias}`,
        cover: og?.thumbnail?.imagePath || '',
        latest: latestParts.main,
        latestParts,
        day: schedule,
        finished: detail ? detail.status === 'COMPLETED' || !!detail.isComplete : false,
        people,
    };
}

// Kakao Webtoon（webtoon.kakao.com，跟 KakaoPage 不同平台，但很多 KakaoPage 作品也在這裡）：
// 搜尋、作品資料（作者有角色、封面、完結、更新星期）是公開的；話次清單要登入 token，拿不到最新話數
const KW_API = 'https://gateway-kw.kakao.com';
const KW_DAYS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const serverTitleKey = t => String(t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, '').toLowerCase();

async function kakaoWebtoonSearch(keyword) {
    const r = await fetch(`${KW_API}/search/v2/content?word=${encodeURIComponent(keyword)}&limit=10&offset=0`, { headers: { 'user-agent': MOBILE_UA } });
    const data = await r.json();
    return (data.data?.content || []).map(c => ({ seriesId: String(c.id), title: c.title, author: '', edition: '' }));
}

async function kakaoWebtoonInfo(id) {
    const r = await fetch(`${KW_API}/decorator/v2/decorator/contents/${id}`, { headers: { 'user-agent': MOBILE_UA } });
    const d = (await r.json().catch(() => ({}))).data;
    if (!d?.title) throw new Error('找不到作品');
    const people = { author: [], adapter: [], artist: [], studio: [] };
    const unassigned = [];
    for (const a of d.authors || []) {
        if (a.type === 'ORIGINAL_STORY') people.author.push(a.name);
        else if (a.type === 'AUTHOR') people.adapter.push(a.name);
        else if (a.type === 'ILLUSTRATOR') people.artist.push(a.name);
        else if (a.type !== 'PUBLISHER') unassigned.push(a.name); // 出版社不算創作團隊
    }
    const badges = (d.badges || []).map(b => String(b.title || '').toLowerCase());
    const cover = d.sharingThumbnailImage || d.thumbnailImage || '';
    return {
        title: d.title,
        url: `https://webtoon.kakao.com/content/${encodeURIComponent(d.seoId || 'x')}/${id}`,
        cover: cover && !/\.(jpe?g|png|webp)$/i.test(cover) ? `${cover}.jpg` : cover,
        latest: null,
        latestParts: { main: null, side: null, special: null, after: null },
        day: badges.map(b => KW_DAYS[b]).find(Boolean) || '',
        finished: badges.includes('completed'),
        people,
        unassigned,
    };
}

// KakaoPage：API 都會擋，但給「分享預覽機器人」的頁面有標題、封面、作者（沒有角色）和前幾話
// 沒有最新話數、也不能用標題搜尋（只能貼網址）；作者放在 unassigned，讓使用者自己分到 글／그림／원작
const PREVIEW_BOT_UA = 'facebookexternalhit/1.1';
async function kakaoInfo(id) {
    const r = await fetch(`https://page.kakao.com/content/${id}`, { headers: { 'user-agent': PREVIEW_BOT_UA } });
    if (!r.ok) throw new Error('找不到作品');
    const html = await r.text();
    const meta = name => decodeEntities((html.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`)) || [])[1] || '');
    const title = meta('title');
    if (!title || title === '카카오페이지') throw new Error('找不到作品');
    let names = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
            const ld = JSON.parse(m[1]);
            if (ld['@type'] === 'CreativeWorkSeries') names = String(ld.author?.name || '').split(',').map(n => n.trim()).filter(Boolean);
        } catch { /* 格式不對就略過 */ }
    }
    const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' '));
    const dayMatch = text.match(/매주\s*([월화수목금토일])요일/);
    // 同名作品也在 Kakao Webtoon 的話，用那邊有角色的作者、完結狀態、更新星期
    let kw = null;
    try {
        const hits = (await kakaoWebtoonSearch(title)).filter(h => serverTitleKey(h.title) === serverTitleKey(title));
        if (hits.length === 1) kw = await kakaoWebtoonInfo(hits[0].seriesId);
    } catch { /* 查不到就用 KakaoPage 自己的資料 */ }
    if (kw) {
        return {
            title,
            url: `https://page.kakao.com/content/${id}`,
            cover: meta('image') || kw.cover,
            latest: null,
            latestParts: { main: null, side: null, special: null, after: null },
            day: (dayMatch ? DAY_FROM_KR[dayMatch[1]] : '') || kw.day,
            finished: kw.finished,
            people: kw.people,
            unassigned: kw.unassigned,
            peopleFrom: 'Kakao Webtoon',
        };
    }
    return {
        title,
        url: `https://page.kakao.com/content/${id}`,
        cover: meta('image'),
        latest: null,
        latestParts: { main: null, side: null, special: null, after: null },
        day: dayMatch ? DAY_FROM_KR[dayMatch[1]] : '',
        finished: false,
        people: { author: [], adapter: [], artist: [], studio: [] },
        unassigned: names,
    };
}

const SERIES_INFO = { naver: naverInfo, ridi: ridiInfo, series: seriesInfo, bomtoon: bomtoonInfo, kakao: kakaoInfo, kakaowebtoon: kakaoWebtoonInfo };
app.get('/series-info', async (req, res) => {
    const { platform, id } = req.query;
    const need = ['side', 'special', 'after'].includes(req.query.need) ? req.query.need : ''; // 正在看的段落（本篇不用帶）
    if (!SERIES_INFO[platform]) return res.status(400).send('platform 必須是 naver、ridi、series、bomtoon、kakao 或 kakaowebtoon');
    const idPattern = platform === 'bomtoon' ? /^[A-Za-z0-9_-]+$/ : /^\d+$/;
    if (!idPattern.test(id || '')) return res.status(400).send('id 格式錯誤');
    try {
        res.json({ platform, seriesId: id, ...(await SERIES_INFO[platform](id, need)) });
    } catch (error) {
        res.status(500).send(error.message === '找不到作品' ? '找不到作品' : '查詢失敗');
    }
});

// 封面圖轉發：瀏覽器要拿到圖片檔才能存進 IndexedDB，只允許平台的圖片網域
const COVER_HOSTS = /(^|\.)(pstatic\.net|ridicdn\.net|balcony\.studio)$|^dn-img-page\.kakao\.com$|^kr-a\.kakaopagecdn\.com$/;
app.get('/cover-image', async (req, res) => {
    let target;
    try { target = new URL(String(req.query.url || '')); } catch { return res.status(400).send('網址錯誤'); }
    if (target.protocol !== 'https:' || !COVER_HOSTS.test(target.hostname)) return res.status(400).send('不支援的圖片網址');
    try {
        const r = await fetch(target, { headers: { 'user-agent': DESKTOP_UA, referer: 'https://comic.naver.com/' } });
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.startsWith('image/')) throw new Error();
        res.set('content-type', type).set('cache-control', 'public, max-age=86400');
        res.send(Buffer.from(await r.arrayBuffer()));
    } catch (error) {
        res.status(502).send('抓取封面失敗');
    }
});

// 平台留言頁用：作品每一話「網址編號 → 標題」，讓外傳顯示成「外傳 1 話」而不是第 229 話
// 回傳 { titles: { 編號: 標題 } }；同一部作品快取 6 小時
const episodeTitleCache = new Map();
async function naverTitles(id) {
    const headers = { 'user-agent': MOBILE_UA };
    const titles = {};
    for (let page = 1; page <= 60; page++) {
        const list = await (await fetch(`https://comic.naver.com/api/article/list?titleId=${id}&page=${page}&sort=DESC`, { headers })).json();
        [...(page === 1 ? list.chargeFolderArticleList || [] : []), ...(list.articleList || [])].forEach(a => { titles[a.no] = a.subtitle; });
        if (page >= (list.pageInfo?.totalPages || 1)) break;
    }
    return titles;
}
async function ridiTitles(bookId) {
    const page = await fetch(`https://ridibooks.com/books/${bookId}`, { headers: { 'user-agent': MOBILE_UA } });
    if (!page.ok) throw new Error(`Ridi ${page.status}`);
    const html = await page.text();
    const titles = {};
    const re = /"id":"\d{6,}","title":"((?:[^"\\]|\\.)*)","series_title":(?:null|"(?:[^"\\]|\\.)*"),"author":(?:null|"(?:[^"\\]|\\.)*"),"genre":"[a-z]+","pub_id":"\d+","volume":"(\d+)"/g;
    let m;
    while ((m = re.exec(html))) if (!titles[m[2]]) titles[m[2]] = JSON.parse(`"${m[1]}"`);
    return titles;
}
async function webtoonTitles(titleNo) {
    const titles = {};
    let cursor = '';
    for (let k = 0; k < 100; k++) {
        const r = await fetch(`https://m.webtoons.com/api/v1/webtoon/${titleNo}/episodes?pageSize=100${cursor ? `&cursor=${cursor}` : ''}`, { headers: { 'user-agent': MOBILE_UA } });
        const d = (await r.json()).result || {};
        (d.episodeList || []).forEach(e => { titles[e.episodeNo] = e.episodeTitle; });
        if (!d.nextCursor || !(d.episodeList || []).length || String(d.nextCursor) === String(cursor)) break;
        cursor = d.nextCursor;
    }
    return titles;
}
const EPISODE_TITLES = { naver: naverTitles, ridi: ridiTitles, webtoon: webtoonTitles };
app.get('/episode-titles', async (req, res) => {
    const { platform, seriesId } = req.query;
    if (!EPISODE_TITLES[platform]) return res.status(400).send('platform 必須是 naver、ridi 或 webtoon');
    if (!/^\d+$/.test(seriesId || '')) return res.status(400).send('seriesId 格式錯誤');
    const key = `${platform}:${seriesId}`;
    const cached = episodeTitleCache.get(key);
    if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return res.json({ titles: cached.titles });
    try {
        const titles = await EPISODE_TITLES[platform](seriesId);
        episodeTitleCache.set(key, { at: Date.now(), titles });
        res.json({ titles });
    } catch (error) {
        res.status(500).send('抓取話次標題失敗');
    }
});

// 讓 Render 或本機環境動態決定連接埠
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));