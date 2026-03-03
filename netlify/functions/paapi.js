const crypto = require('crypto');

const ACCESS_KEY = process.env.PAAPI_ACCESS_KEY;
const SECRET_KEY = process.env.PAAPI_SECRET_KEY;
const ASSOCIATE_TAG = process.env.PAAPI_ASSOCIATE_TAG;
const REGION = 'us-west-2';
const HOST = 'webservices.amazon.co.jp';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate    = sign('AWS4' + key, dateStamp);
  const kRegion  = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!ACCESS_KEY || !SECRET_KEY || !ASSOCIATE_TAG) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'PA-APIキーが設定されていません。Netlifyの環境変数を確認してください。' })
    };
  }

  let params;
  try { params = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { keywords, category = 'All', minDiscount = 0, sortBy = 'Relevance' } = params;
  if (!keywords) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'keywordsが必要です' }) };
  }

  // Build PA-API request body
  const requestBody = {
    Keywords: keywords,
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'ItemInfo.Features',
      'Offers.Listings.Price',
      'Offers.Listings.SavingBasis',
      'Offers.Listings.Promotions',
      'Offers.Summaries.HighestPrice',
      'Offers.Summaries.LowestPrice',
    ],
    PartnerTag: ASSOCIATE_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.co.jp',
    ItemCount: 10,
    SortBy: sortBy,
  };
  if (category !== 'All') requestBody.SearchIndex = category;

  const bodyStr = JSON.stringify(requestBody);

  // AWS4 Signature
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const service = 'ProductAdvertisingAPI';
  const canonicalUri = '/paapi5/searchitems';
  const canonicalQuerystring = '';
  const payloadHash = crypto.createHash('sha256').update(bodyStr, 'utf8').digest('hex');

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`;

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST', canonicalUri, canonicalQuerystring,
    canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-encoding': 'amz-1.0',
        'content-type': 'application/json; charset=utf-8',
        'host': HOST,
        'x-amz-date': amzDate,
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
        'Authorization': authHeader,
      },
      body: bodyStr,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status, headers,
        body: JSON.stringify({ error: data.__type || 'PA-APIエラー', detail: data })
      };
    }

    // Parse and normalize results
    const items = (data.SearchResult?.Items || []).map(item => {
      const listing = item.Offers?.Listings?.[0];
      const price = listing?.Price?.Amount;
      const savingBasis = listing?.SavingBasis?.Amount;
      const discount = (price && savingBasis && savingBasis > price)
        ? Math.round((1 - price / savingBasis) * 100) : 0;

      return {
        asin: item.ASIN,
        title: item.ItemInfo?.Title?.DisplayValue || '不明',
        image: item.Images?.Primary?.Large?.URL || '',
        price: price || null,
        originalPrice: savingBasis || null,
        discount,
        features: item.ItemInfo?.Features?.DisplayValues || [],
        url: `https://www.amazon.co.jp/dp/${item.ASIN}?tag=${ASSOCIATE_TAG}`,
      };
    });

    // Filter by min discount
    const filtered = minDiscount > 0
      ? items.filter(i => i.discount >= minDiscount)
      : items;

    // Sort by discount desc
    filtered.sort((a, b) => b.discount - a.discount);

    return { statusCode: 200, headers, body: JSON.stringify({ items: filtered }) };

  } catch(e) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
