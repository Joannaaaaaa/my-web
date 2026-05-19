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
// 讓 Render 或本機環境動態決定連接埠
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));