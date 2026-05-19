import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();

// 💡 允許你的前端網頁 (不論是本機打開還是部署在 GitHub Pages) 跨網域存取
app.use(cors()); 

// 共同的標準 User-Agent，防止被平台阻擋
const COMMON_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

app.get('/get-comments', async (req, res) => {
    try {
        const { bookId, platform, limit, offsetPostId = "" } = req.query;
        let response;

        if (platform === 'webtoon') {
            const targetUrl = `https://www.webtoons.com/p/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=none&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&withCursor=false&offsetPostId=${offsetPostId}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'epicom',
                    'user-agent': COMMON_UA // 🎯 修正：補上完整 UA 防止 403 阻擋
                }
            });
        } else if (platform === 'naver') {
            const targetUrl = `https://comic.naver.com/comment/api/community/v2/posts?pageId=${bookId}&categoryId=&pinRepresentation=none&pinType=&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&offsetPostId=${offsetPostId}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'comic_webtoon',
                    'user-agent': COMMON_UA,
                }
            });
        } else {
            // Ridibooks 邏輯
            const offset = req.query.offset || 0;
            const targetUrl = `https://reading-data-api.ridibooks.com/serial-comment/${bookId}?offset=${offset}&limit=${limit}&sort=MOST_LIKED`;
            response = await axios.get(targetUrl, {
                headers: { 'user-agent': COMMON_UA }
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error("❌ 抓取主留言失敗:", error.message);
        res.status(500).send("抓取失敗");
    }
});

app.get('/get-replies', async (req, res) => {
    try {
        const { postId, limit, bookId, platform } = req.query;
        console.log(`🚀 正在發送請求至 ${platform} 的回覆 API，postId: ${postId}, bookId: ${bookId}, limit: ${limit}`);
        let response, targetUrl;

        if (platform === 'webtoon') {
            targetUrl = `https://www.webtoons.com/p/api/community/v2/post/${postId}/child-posts?sort=oldest&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}&withCursor=false&offsetPostId=`;

            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'epicom',
                    'user-agent': COMMON_UA // 🎯 修正：補上完整 UA
                }
            });
        } else if (platform === 'naver') {
            targetUrl = `https://comic.naver.com/comment/api/community/v2/post/${postId}/child-posts?sort=oldest&displayBlindCommentAsService=false&prevSize=0&nextSize=${limit}`;
            
            response = await axios.get(targetUrl, {
                headers: {
                    'service-ticket-id': 'comic_webtoon',
                    'user-agent': COMMON_UA,
                }
            });
        } else if (platform === 'ridi') {
            targetUrl = `https://reading-data-api.ridibooks.com/serial-comment/${bookId}/comments/${postId}/replies?offset=0&limit=2147483647`;
            response = await axios.get(targetUrl, {
                headers: { 'user-agent': COMMON_UA }
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error("❌ 抓取回覆失敗:", error.message);
        res.status(500).send("抓取回覆失敗");
    }
});

// 讓 Render 或本機環境動態決定連接埠
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));