export async function handler(event, context) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY; 
    const apiHost = "v3.football.api-sports.io"; 

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing API key on server" }),
      };
    }


    const params = new URLSearchParams(event.queryStringParameters || {});

    const url = `https://${apiHost}/fixtures?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey, 
        "x-rapidapi-key": apiKey, 
        "x-rapidapi-host": apiHost,
      },
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}
