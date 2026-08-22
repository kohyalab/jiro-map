const { chromium } = require('playwright');
const { TwitterApi } = require('twitter-api-v2');

// 実行当日のフォーマット作成 (例: 8/22(土))
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
  // 店舗カード4列が綺麗に収まるビューポート幅（440px前後）
  const page = await browser.newPage({
    viewport: { width: 440, height: 1200 },
    deviceScaleFactor: 2
  });

  await page.goto('https://app.jirolianmap.com/', { waitUntil: 'networkidle' });

  // 1. 画面初期設定（リストのみ表示・日別モード・開店日順ソート）
  await page.evaluate(() => {
    // リストのみ表示
    if (typeof isShowMap !== 'undefined') isShowMap = false;
    if (typeof isShowList !== 'undefined') isShowList = true;
    if (typeof updateLayout === 'function') updateLayout();

    // 日別モード
    if (typeof setListSubMode === 'function') setListSubMode('today');

    // 開店日順ソート
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.value = 'opened';
      if (typeof onSortChange === 'function') onSortChange();
    }

    // キャプチャ用スタイル調整（スクロールバー非表示 & 背景色・余白の最適化）
    const style = document.createElement('style');
    style.innerHTML = `
      body, .sidebar-container, .container { overflow: visible !important; height: auto !important; }
      .container { padding: 8px 10px !important; }
      #capture-target { background-color: #121212; width: fit-content; padding-bottom: 8px; }
      .shop-grid.view-mode-today { grid-template-columns: repeat(4, 90px) !important; gap: 8px !important; }
      #date-selector-area { border-bottom: none !important; }
    `;
    document.head.appendChild(style);

    // キャプチャ用ラッパー要素を作成
    const wrapper = document.createElement('div');
    wrapper.id = 'capture-target';
    const dateArea = document.getElementById('date-selector-area');
    const container = document.querySelector('.container');
    
    dateArea.parentNode.insertBefore(wrapper, dateArea);
    wrapper.appendChild(dateArea);
    wrapper.appendChild(container);
  });

  await page.waitForTimeout(500);

  const captureArea = await page.$('#capture-target');

  // 2. 1枚目のキャプチャ (1行目〜6行目: 1〜24店舗を表示)
  await page.evaluate(() => {
    const items = document.querySelectorAll('#shop-grid .shop-item');
    items.forEach((item, index) => {
      item.style.display = (index < 24) ? 'flex' : 'none';
    });
  });
  await captureArea.screenshot({ path: 'sheet_1.png' });

  // 3. 2枚目のキャプチャ (7行目〜12行目: 25店舗目以降を表示)
  await page.evaluate(() => {
    const items = document.querySelectorAll('#shop-grid .shop-item');
    items.forEach((item, index) => {
      item.style.display = (index >= 24 && index < 48) ? 'flex' : 'none';
    });
  });
  await captureArea.screenshot({ path: 'sheet_2.png' });

  await browser.close();

  // 4. X（Twitter）への自動投稿
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

  console.log('投稿が完了しました。');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
