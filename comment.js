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

// 用標題查作品：Naver、Ridi 用韓文標題，台版 Webtoon 用中文標題
// 回傳 [{ seriesId, title, author, edition }]；Ridi 只留漫畫（웹툰分類 1600），排除小說
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
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
        } else {
            return res.status(400).send('platform 必須是 naver、ridi 或 webtoon');
        }
        res.json(results);
    } catch (error) {
        res.status(500).send('搜尋失敗');
    }
});

// 讓 Render 或本機環境動態決定連接埠
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));