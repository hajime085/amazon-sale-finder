const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let params;
  try {
    params = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { url } = params;
  if (!url) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'URLが必要です' })
    };
  }

  try {
    // URLからASINを抽出
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '有効なAmazon商品URLではありません' })
      };
    }
    const asin = asinMatch[1];

    // User-Agentを設定してHTMLを取得
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Amazon から取得できません (${response.status})` })
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 商品情報を抽出
    const title = $('h1 span#productTitle').text().trim() ||
                  $('span#productTitle').text().trim() ||
                  '';

    // 価格情報を取得（複数のセレクタを試す）
    let currentPrice = null;
    let originalPrice = null;

    // 現在価格
    const priceText = $('span.a-price-whole').first().text().trim();
    if (priceText) {
      currentPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    }

    // 元の価格（割引がある場合）
    const originalPriceText = $('span.a-price.a-text-price.a-size-base.a-color-secondary').first().text().trim();
    if (originalPriceText) {
      originalPrice = parseFloat(originalPriceText.replace(/[^0-9.]/g, ''));
    }

    // 画像URL
    const imageUrl = $('img#landingImage').attr('src') || '';

    // 割引率を計算
    let discount = 0;
    if (currentPrice && originalPrice && originalPrice > currentPrice) {
      discount = Math.round((1 - currentPrice / originalPrice) * 100);
    }

    // 商品説明・特徴
    const features = [];
    $('ul.a-unordered-list.a-vertical.a-spacing-mini li span').each((i, el) => {
      const text = $(el).text().trim();
      if (text && features.length < 5) {
        features.push(text);
      }
    });

    // アソシエイトタグを含むURLを生成
    const associateTag = process.env.PAAPI_ASSOCIATE_TAG || 'hajime085-22';
    const affiliateUrl = `https://www.amazon.co.jp/dp/${asin}?tag=${associateTag}`;

    const product = {
      asin,
      title,
      image: imageUrl,
      price: currentPrice,
      originalPrice: originalPrice,
      discount,
      features,
      url: affiliateUrl,
      sourceUrl: url,
      extractedAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ product })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
