const SERPER_API_KEY = '12d941da076200e8cefcdb6ac7de8b21a6729494'; // Serper API Key

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  const ip = request.headers.get('CF-Connecting-IP');
  const currentTime = Date.now();
  const twelveHoursMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

  // Get the current count and timestamp from KV storage
  const kvKey = `rate_limit_${ip}`;
  let rateLimitData = await RATE_LIMIT_KV.get(kvKey, 'json');

  // Initialize if first request
  if (!rateLimitData) {
    rateLimitData = {
      count: 1,
      windowStart: currentTime
    };
  } else {
    // Check if we're in a new 12-hour window
    if (currentTime - rateLimitData.windowStart > twelveHoursMs) {
      rateLimitData = {
        count: 1,
        windowStart: currentTime
      };
    } else {
      // Increment count if within same window
      rateLimitData.count += 1;
    }
  }

  // Store updated data
  await RATE_LIMIT_KV.put(kvKey, JSON.stringify(rateLimitData));

  // Check rate limit
  if (rateLimitData.count > 10) {
    // Calculate time remaining
    const timeRemaining = twelveHoursMs - (currentTime - rateLimitData.windowStart);
    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

    return new Response(`Rate limit exceeded. Try again in ${hours}h ${minutes}m`, {
      status: 429
    });
  }

  const url = new URL(request.url);

  // Proxy requests to Serper API
  if (url.pathname === '/api/serper-search' || url.pathname === '/api/serper-news') {
    const serperApiUrl = url.pathname === '/api/serper-search' ? 'https://serper.dev/search' : 'https://serper.dev/news';

    if (request.method !== 'POST') {
      return new Response('Expected POST for Serper API', { status: 405 });
    }

    const requestBody = await request.json();

    const serperResponse = await fetch(serperApiUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Clone the response to modify headers
    const response = new Response(serperResponse.body, serperResponse);
    response.headers.set('Access-Control-Allow-Origin', '*'); // Allow CORS
    return response;
  }

  // Existing Mistral API proxy logic
  if (request.method !== 'POST') {
    return new Response('Expected POST', { status: 405 });
  }

  const { query, searchResults, selectedModel } = await request.json();
  const apiKey = "dj35Gf2Q5TvKZk9Dr7pzpXPIW67iOWMn"; // Replace with your actual API key from secrets

  if (!apiKey) {
    return new Response('MISTRAL_API_KEY not set', { status: 500 });
  }

  const apiUrl = 'https://api.mistral.ai/v1/chat/completions';

  let context = 'Search Results:\n\n';

  if (searchResults.web && searchResults.web.length > 0) {
    context += '=== WEB RESULTS ===\n';
    searchResults.web.forEach((result, index) => {
      context += `[${index + 1}] ${result.title}\n${result.snippet}\nURL: ${result.url}\n\n`;
    });
  } else {
    context += 'No search results found. Please answer based on general knowledge.';
  }

  const prompt = `You are an advanced AI search assistant. Based on the search results below, provide a detailed, visually rich answer to the user\'s query: "${query}"\n\n${context}\n\nInstructions:\n- Use clear headings, subheadings, bold/italic text, tables, and lists.\n- Include relevant emojis.\n- Cite sources using [Source Name](URL).\n- Make the response informative and engaging.\n\nResponse:`;

  // Route models correctly: Amaya -> mistral-small-latest, Amaya Lite -> mistral-tiny-latest
  let modelName;
  if (selectedModel === 'Amaya') {
    modelName = 'mistral-small-latest';
  } else if (selectedModel === 'Amaya Lite') {
    modelName = 'mistral-tiny-latest';
  } else {
    // Default fallback
    modelName = 'mistral-small-latest';
  }

  const mistralResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.5
    })
  });

  return mistralResponse;
}

function handleOptions(request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-control-allow-headers', 'Content-Type');
  return new Response(null, { headers });
}