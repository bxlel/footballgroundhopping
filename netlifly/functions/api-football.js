// netlify/functions/api-football.js

const BASE_URL = 'https://v3.football.api-sports.io';

export async function handler(event) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!apiKey) {
      console.error('[api-football] Missing API_FOOTBALL_KEY');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing server API key' }),
      };
    }

    // Ex: /.netlify/functions/api-football/countries
    //     /.netlify/functions/api-football/fixtures
    const functionPrefix = '/.netlify/functions/api-football';
    const fullPath = event.path || '';
    const subPath = fullPath.startsWith(functionPrefix)
      ? fullPath.slice(functionPrefix.length)
      : '';

    let targetPath = '';

    if (subPath.startsWith('/countries')) {
      targetPath = '/countries';
    } else if (subPath.startsWith('/fixtures')) {
      targetPath = '/fixtures';
    } else {
      console.warn('[api-football] Unknown subPath:', subPath);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Unknown api-football route' }),
      };
    }

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const url = `${BASE_URL}${targetPath}${
      qs.toString() ? `?${qs.toString()}` : ''
    }`;

    const response = await fetch(url, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (err) {
    console.error('[api-football] Error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
