const { chromium } = require('playwright');
const { TwitterApi } = require('twitter-api-v2');

// 日本時間（JST）の本日日付文字列を生成 (例: 8/22(土))
function getTodayText() {
    const now = new Date();
    const jstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const month = jstDate.getMonth() + 1;
    const date = jstDate.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayStr = dayNames[jstDate.getDay()];
    return `${month}/${date}(${dayStr})`;
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    // PCビューで判定させるため幅1280px以上を確保
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1200 },
        deviceScaleFactor: 2 // 高解像度・鮮明化
    });

    await page.goto('https://app.jirolianmap.com/', { waitUntil: 'networkidle' });

    // 1. 条件設定（日別レイアウト・開店日順ソート・リスト全体表示）
    await page.evaluate(() => {
        // リストのみ表示に切り替え
        if (typeof isShowMap !== 'undefined') isShowMap = false;
        if (typeof isShowList !== 'undefined') isShowList = true;
        if (typeof updateLayout === 'function') updateLayout();

        // 日別モードに切り替え
        if (typeof setListSubMode === 'function') {
            setListSubMode('today');
        }

        // 開店日順ソート
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.value = 'opened';
            if (typeof onSortChange === 'function') {
                onSortChange();
            }
        }

        // スクロールを解除し、リスト全域をきれいに収めるスタイル調整
        const style = document.createElement('style');
        style.id = 'bot-capture-style';
        style.innerHTML = `
      header, #controls-wrapper, #map-wrapper, #drag-resizer, .list-header-controls, .app-footer, .header-toggle-btn {
        display: none !important;
      }
      body, .main-layout, .content-area, .sidebar-container {
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        background-color: #121212 !important;
      }
      #sidebar-container {
        width: 100% !important;
        min-width: 100% !important;
      }
      .container {
        overflow: visible !important;
        height: auto !important;
        max-height: none !important;
        padding: 10px !important;
      }
      #date-selector-area {
        display: flex !important;
        align-items: center !important;
        border-bottom: 1px solid #333 !important;
        padding: 10px 14px !important;
        background-color: #121212 !important;
      }
    `;
        document.head.appendChild(style);
    });

    // レンダリング待機
    await page.waitForTimeout(1000);

    // 2. リスト画面全体のキャプチャを取得
    const sidebar = await page.$('#sidebar-container');
    await sidebar.screenshot({ path: 'sheet.png' });

    await browser.close();

    // 3. X (Twitter) への画像アップロード & ツイート
    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    const mediaId = await client.v1.uploadMedia('sheet.png');

    const tweetText = `【本日${getTodayText()}のラーメン二郎営業情報】\n\n詳しい情報はジロリアンマップで↓\n🔗https://app.jirolianmap.com\n \n※営業時間の白文字は通常、オレンジ色文字は臨時営業・休業#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;

    await client.v2.tweet({
        text: tweetText,
        media: {
            media_ids: [mediaId]
        }
    });

    console.log('Xへの自動投稿が正常に完了しました。');
}

run().catch(err => {
    console.error('実行エラー:', err);
    process.exit(1);
});