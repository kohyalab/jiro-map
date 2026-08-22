const { chromium } = require('playwright');
const { TwitterApi } = require('twitter-api-v2');

function getTodayText() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayStr = dayNames[now.getDay()];
    return `${month}/${date}(${dayStr})`;
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    // 店舗カード4列が綺麗に収まるビューポート
    const page = await browser.newPage({
        viewport: { width: 500, height: 1000 },
        deviceScaleFactor: 2
    });

    await page.goto('https://app.jirolianmap.com/', { waitUntil: 'networkidle' });

    // 1. 画面初期設定（日別モード・開店日順ソート・レイアウトの最適化）
    await page.evaluate(() => {
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

        // 不要な要素を非表示にし、4列表示用のスタイルを適用
        const style = document.createElement('style');
        style.id = 'bot-custom-style';
        style.innerHTML = `
      header, #controls-wrapper, #map-wrapper, #drag-resizer, .list-header-controls, .app-footer, .header-toggle-btn {
        display: none !important;
      }
      body, .main-layout, .content-area, .sidebar-container {
        width: 440px !important;
        height: auto !important;
        overflow: visible !important;
        background-color: #121212 !important;
      }
      .sidebar-container {
        min-width: 440px !important;
      }
      .container {
        overflow: visible !important;
        height: auto !important;
        padding: 6px 8px !important;
      }
      .shop-grid.view-mode-today {
        grid-template-columns: repeat(4, 98px) !important;
        gap: 6px !important;
        width: 100% !important;
      }
      #date-selector-area {
        display: flex !important;
        border-bottom: 1px solid #333 !important;
        padding: 8px 12px !important;
      }
    `;
        document.head.appendChild(style);
    });

    // レンダリング待機
    await page.waitForTimeout(1000);

    // 2. 1枚目のキャプチャ (1〜6行目: 店舗インデックス 0〜23 を表示)
    await page.evaluate(() => {
        const items = document.querySelectorAll('#shop-grid .shop-item');
        items.forEach((item, index) => {
            item.style.display = (index < 24) ? 'flex' : 'none';
        });
    });
    await page.waitForTimeout(300);

    const sidebar = await page.$('#sidebar-container');
    await sidebar.screenshot({ path: 'sheet_1.png' });

    // 3. 2枚目のキャプチャ (7〜12行目: 店舗インデックス 24〜47 を表示)
    await page.evaluate(() => {
        const items = document.querySelectorAll('#shop-grid .shop-item');
        items.forEach((item, index) => {
            item.style.display = (index >= 24 && index < 48) ? 'flex' : 'none';
        });
    });
    await page.waitForTimeout(300);

    await sidebar.screenshot({ path: 'sheet_2.png' });

    await browser.close();

    // 4. X（Twitter）への画像アップロード＆自動投稿
    const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    const mediaId1 = await client.v1.uploadMedia('sheet_1.png');
    const mediaId2 = await client.v1.uploadMedia('sheet_2.png');

    const tweetText = `【本日${getTodayText()}のラーメン二郎営業情報】\n\n詳しい情報はジロリアンマップで↓\nhttp://app.jirolianmap.com\n \n※営業時間の白文字は通常、オレンジ色文字は臨時営業・休業\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;

    await client.v2.tweet({
        text: tweetText,
        media: {
            media_ids: [mediaId1, mediaId2]
        }
    });

    console.log('Xへの自動投稿が正常に完了しました。');
}

run().catch(err => {
    console.error('実行エラー:', err);
    process.exit(1);
});