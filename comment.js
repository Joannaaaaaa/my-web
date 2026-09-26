import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();

// 💡 允許你的前端網頁 (不論是本機打開還是部署在 GitHub Pages) 跨網域存取

app.use(cors()); // 允許你的前端網頁存取這個後端
app.get('/get-comments', async (req, res) => {
    try {
        // 新增接收 offsetPostId 參數
        const { bookId, platform, limit, offsetPostId = "" } = req.query;
        let response;

        if (platform === 'webtoon') {
            // 將 offsetPostId 動態帶入 URL
            const targetUrl = `https://www.webtoons.com/p/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=none&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&withCursor=false&offsetPostId=${offsetPostId}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'epicom',
                    'user-agent': 'Mozilla/5.0...'
                }
            });
        } else if (platform === 'naver') {
            const targetUrl = `https://comic.naver.com/comment/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=none&pinType=&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&offsetPostId=${offsetPostId}`;
            
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
        res.status(500).send("抓取失敗");
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
        res.status(500).send("抓取回覆失敗");
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

// 用標題查作品：Naver、Ridi、Naver Series 用韓文標題，台版 Webtoon 用中文標題
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
        } else {
            return res.status(400).send('platform 必須是 naver、ridi、webtoon 或 series');
        }
        res.json(results);
    } catch (error) {
        res.status(500).send('搜尋失敗');
    }
});

// 自動填入用：用作品編號查資料
// 回傳 { platform, seriesId, url, title, cover, latest, day, finished, people: { author, adapter, artist, studio } }
// latest 是平台上最新一話的話數（Naver 含付費預覽），day 是 Mon～Sun 或空字串
const DAY_FROM_EN = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
const DAY_FROM_KR = { 월: 'Mon', 화: 'Tue', 수: 'Wed', 목: 'Thu', 금: 'Fri', 토: 'Sat', 일: 'Sun' };
const episodeNo = subtitle => {
    const m = String(subtitle || '').match(/(\d+)\s*화/);
    return m ? Number(m[1]) : null;
};
const STUDIO_RE = /코믹스|스튜디오|studio|comics|웹툰|엔터|미디어|media|ent\b/i;

async function naverInfo(id) {
    const headers = { 'user-agent': MOBILE_UA };
    const info = await (await fetch(`https://comic.naver.com/api/article/list/info?titleId=${id}`, { headers })).json();
    if (!info.titleName) throw new Error('找不到作品');
    const list = await (await fetch(`https://comic.naver.com/api/article/list?titleId=${id}&page=1&sort=DESC`, { headers })).json();
    // 付費預覽（chargeFolderArticleList）比免費的新，一起算
    const articles = [...(list.chargeFolderArticleList || []), ...(list.articleList || [])];
    const latest = articles.map(a => episodeNo(a.subtitle)).find(n => n != null) ?? null;
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
        latest,
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
    let latest = null;
    if (prop.opened_last_volume_id) {
        const last = prop.opened_last_volume_id === id ? book : await get(prop.opened_last_volume_id);
        latest = episodeNo(last.title?.main) ?? last.series?.volume ?? null;
    }
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
        latest,
        day: '',
        finished: !!(prop.is_serial_complete || prop.is_completed),
        people,
    };
}

async function seriesInfo(id) {
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
    return {
        title,
        url: `https://series.naver.com/comic/detail.series?productNo=${id}`,
        cover: meta('image').replace(/\?type=.*$/, '?type=m260'),
        latest: (desc.match(/^(\d+)\s*화/) || [])[1] ? Number(desc.match(/^(\d+)\s*화/)[1]) : null,
        day: dayMatch ? DAY_FROM_KR[dayMatch[1]] : '',
        finished: /^\d+\s*화\s*완결/.test(desc),
        people,
    };
}

const SERIES_INFO = { naver: naverInfo, ridi: ridiInfo, series: seriesInfo };
app.get('/series-info', async (req, res) => {
    const { platform, id } = req.query;
    if (!SERIES_INFO[platform]) return res.status(400).send('platform 必須是 naver、ridi 或 series');
    if (!/^\d+$/.test(id || '')) return res.status(400).send('id 格式錯誤');
    try {
        res.json({ platform, seriesId: id, ...(await SERIES_INFO[platform](id)) });
    } catch (error) {
        res.status(500).send(error.message === '找不到作品' ? '找不到作品' : '查詢失敗');
    }
});

// 封面圖轉發：瀏覽器要拿到圖片檔才能存進 IndexedDB，只允許平台的圖片網域
const COVER_HOSTS = /(^|\.)(pstatic\.net|ridicdn\.net)$/;
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

// 讓 Render 或本機環境動態決定連接埠
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));