// netlify/functions/features.js

const BASE_URL = 'https://v3.football.api-sports.io';

export async function handler(event) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!apiKey) {
      console.error('[features] Missing API_FOOTBALL_KEY');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing server API key' }),
      };
    }

    const functionPrefix = '/.netlify/functions/features';
    const fullPath = event.path || '';
    const subPath = fullPath.startsWith(functionPrefix)
      ? fullPath.slice(functionPrefix.length)
      : '';

    let targetPath = '';

    if (subPath.startsWith('/countries')) {
      // GET /features/countries -> /countries
      targetPath = '/countries';
    } else if (subPath.startsWith('/fixtures')) {
      // GET /features/fixtures -> /fixtures
      targetPath = '/fixtures';
    } else {
      console.warn('[features] Unknown subPath:', subPath);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Unknown features route' }),
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
    console.error('[features] Error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
