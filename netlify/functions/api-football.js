// netlify/functions/api-football.js

const BASE_URL = 'https://v3.football.api-sports.io';

export async function handler(event) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;

    console.log('--- [NF api-football] Incoming request ---');
    console.log('[NF] method:', event.httpMethod);
    console.log('[NF] path:', event.path);
    console.log('[NF] query:', event.queryStringParameters);
    console.log('[NF] has API_FOOTBALL_KEY:', !!apiKey);

    if (!apiKey) {
      console.error('[NF] Missing API_FOOTBALL_KEY');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing server API key' }),
      };
    }

    const functionPrefix = '/.netlify/functions/api-football';
    const fullPath = event.path || '';
    const subPath = fullPath.startsWith(functionPrefix)
      ? fullPath.slice(functionPrefix.length)
      : fullPath;

    console.log('[NF] functionPrefix:', functionPrefix);
    console.log('[NF] subPath:', subPath);

    let targetPath = '';

    if (subPath.startsWith('/countries')) {
      targetPath = '/countries';
    } else if (subPath.startsWith('/fixtures')) {
      targetPath = '/fixtures';
    } else if (subPath === '' || subPath === '/') {
      console.warn('[NF] Root call without subPath');
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing subPath. Use /countries or /fixtures',
        }),
      };
    } else {
      console.warn('[NF] Unknown subPath:', subPath);
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Unknown api-football route',
          subPath,
        }),
      };
    }

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const url =
      `${BASE_URL}${targetPath}` + (qs.toString() ? `?${qs.toString()}` : '');

    console.log('[NF] Target URL:', url);

    const response = await fetch(url, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    const text = await response.text();

    console.log('[NF] Upstream status:', response.status);
    console.log('[NF] Upstream body (first 500 chars):', text.slice(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('[NF] Failed to parse JSON from upstream');
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Invalid JSON from upstream',
          raw: text.slice(0, 200),
        }),
      };
    }

    const results = Array.isArray(data.response)
      ? data.response.length
      : data.results;

    console.log('[NF] Parsed results count:', results);

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (err) {
    console.error('[NF] Fatal error in api-football function:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
