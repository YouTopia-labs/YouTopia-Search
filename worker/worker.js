addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event.env));
});

async function handleRequest(request, env) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  const url = new URL(request.url);

  // New central endpoint for all frontend queries
  if (url.pathname === '/api/query-proxy') {
    return handleQueryProxy(request, env);
  }

  // Google OAuth2 callback handler - kept separate as it's not a 'query'

  return new Response('Not Found', { status: 404 });
}

// Internal proxy functions, no longer exposed directly
async function proxySerper(api_payload, env) {
  const serperApiUrl = api_payload.type === 'search' ? 'https://serper.dev/search' : 'https://serper.dev/news';

  const serperResponse = await fetch(serperApiUrl, {
    method: 'POST',
    headers: {
      'X-API-KEY': env.SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(api_payload.body),
  });

  const serperData = await serperResponse.json();
  return new Response(JSON.stringify(serperData), {
    status: serperResponse.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function proxyMistral(api_payload, env) {
  const mistralApiKey = env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    return new Response(JSON.stringify({ error: 'MISTRAL_API_KEY not set in environment variables' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const mistralApiUrl = 'https://api.mistral.ai/v1/chat/completions';
    
    const mistralResponse = await fetch(mistralApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify(api_payload.body),
    });

    if (!mistralResponse.ok) {
      const errorText = await mistralResponse.text();
      console.error('Mistral API error response:', errorText);
      
      return new Response(errorText || JSON.stringify({ error: `Mistral API error: ${mistralResponse.status}` }), {
        status: mistralResponse.status,
        headers: {
          'Content-Type': mistralResponse.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response(mistralResponse.body, {
      status: mistralResponse.status,
      statusText: mistralResponse.statusText,
      headers: {
        'Content-Type': mistralResponse.headers.get('Content-Type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Error in Mistral API proxy:', error);
    return new Response(JSON.stringify({ error: `Proxy error: ${error.message}` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function proxyCoingecko(api_payload, env) {
  const coingeckoApiKey = env.COINGECKO_API_KEY;
  if (!coingeckoApiKey) {
    return new Response('COINGECKO_API_KEY not set in environment variables', { status: 500 });
  }

  const queryParams = new URLSearchParams(api_payload.params).toString(); // Assuming params is an object
  const coingeckoApiUrl = `https://api.coingecko.com/api/v3/simple/price?${queryParams}`;

  const coingeckoResponse = await fetch(coingeckoApiUrl, {
    method: 'GET',
    headers: {
      'x-cg-demo-api-key': coingeckoApiKey,
    },
  });

  const response = new Response(coingeckoResponse.body, coingeckoResponse);
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}

async function handleQueryProxy(request, env) {
  if (request.method !== 'POST') {
    return new Response('Expected POST for query proxy', { status: 405 });
  }

  const { query, user_name, user_email, user_local_time, api_target, api_payload, id_token } = await request.json();

  console.log('Received query-proxy request:');
  console.log('  user_email:', user_email);
  console.log('  query:', query);
  console.log('  api_target:', api_target);

  // --- Strict Token Verification ---
  if (!id_token) {
    console.error('Authentication error: Missing id_token in request.');
    return new Response(JSON.stringify({ error: 'Authentication token is missing. Please sign in again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    console.log('Verifying Firebase ID token...');
    const firebaseVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`;
    const verifyResponse = await fetch(firebaseVerifyUrl);
    const tokenInfo = await verifyResponse.json();

    if (tokenInfo.error || !verifyResponse.ok) {
      console.error('Firebase ID token verification failed:', tokenInfo.error_description || 'Invalid token');
      return new Response(JSON.stringify({ error: `Your session has expired or is invalid. Please sign in again. Reason: ${tokenInfo.error_description || 'Invalid Token'}` }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // CRITICAL: Ensure the email from the token matches the user_email sent from the frontend.
    // This prevents a user from sending a valid token but claiming to be someone else.
    if (tokenInfo.email !== user_email) {
      console.error('Security Alert: Email mismatch between ID token and request body. Token email:', tokenInfo.email, 'Request email:', user_email);
      return new Response(JSON.stringify({ error: 'Security alert: Token-email mismatch.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // Temporarily relaxed audience check for debugging.
    // TODO: Re-enable with Firebase Project ID.
    console.log('Token audience (aud) from Google:', tokenInfo.aud);
    console.log('GOOGLE_CLIENT_ID from env:', env.GOOGLE_CLIENT_ID);
    // if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
    //     console.error('Security Alert: Token audience (aud) does not match GOOGLE_CLIENT_ID.');
    //     return new Response(JSON.stringify({ error: 'Security alert: Invalid token audience.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    // }

    console.log('Firebase ID token verified successfully for email:', tokenInfo.email);

  } catch (error) {
    console.error('Internal error during Firebase ID token verification:', error);
    return new Response(JSON.stringify({ error: `Server error during token verification: ${error.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  // --- End of Strict Token Verification ---

  const now = Date.now(); // Current timestamp in milliseconds

  const userKvKey = `user:${user_email}`;
  console.log('Attempting to retrieve user data from KV for key:', userKvKey);
  let userData = await env.YOUTOPIA_DATA.get(userKvKey, { type: 'json' });

  if (!userData) {
    console.log('User data not found in KV for', userKvKey, '. Initializing new user data.');
    userData = { queries: [], cooldown_end_timestamp: null, whitelist_start_date: null };
  } else {
    console.log('User data found in KV for', userKvKey, ':', JSON.stringify(userData));
  }

  // --- Define Rate Limits ---
  const FREE_RATE_LIMIT = 8;
  const FREE_RATE_LIMIT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

  const WHITELIST_RATE_LIMIT = 200;
  const WHITELIST_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  const WHITELIST_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  let currentRateLimit = FREE_RATE_LIMIT;
  let currentRateLimitWindowMs = FREE_RATE_LIMIT_WINDOW_MS;
  let isWhitelistedUser = false;
  let messageFromDeveloper = `If you appreciate this project and the answers it provides, please consider supporting it! This is a solo, self-funded research project by a student (me lol).
Your donations would help to keep running it for everyone (and fund my coffee for improving it). Contributions over $20 qualify you for the 20x Plus Plan, which includes:
✅ 200 AI-powered queries per day
✅ Valid for a month

To activate the 20x plan after donating, simply email at support@youtopia.co.in

Thank you for your support, it truly makes a difference for me to not implement spyware to collect user data and sell it to whoever’s buying on 4chan`;

  // --- Fetch Whitelist from YOUTOPIA_CONFIG ---
  const whitelistEmailsString = await env.YOUTOPIA_CONFIG.get('whitelist_emails');
  const whitelistEmails = whitelistEmailsString ? JSON.parse(whitelistEmailsString) : [];

  if (whitelistEmails.includes(user_email)) {
    // User is in the whitelist
    if (!userData.whitelist_start_date) {
      // First time this whitelisted user is querying, set their start date
      userData.whitelist_start_date = now;
    }

    // Check if whitelist period has expired
    if (now - userData.whitelist_start_date < WHITELIST_VALIDITY_MS) {
      isWhitelistedUser = true;
      currentRateLimit = WHITELIST_RATE_LIMIT;
      currentRateLimitWindowMs = WHITELIST_RATE_LIMIT_WINDOW_MS;
      messageFromDeveloper = "Thank you for supporting YouTopia! You've reached your daily query limit for the 20x Plus Plan. Your generosity keeps this project running. You can make more queries after the cooldown.";
    } else {
      // Whitelist expired, revert to free plan and reset whitelist_start_date
      userData.whitelist_start_date = null;
      // messageFromDeveloper remains the free plan message
    }
  }

  // Filter out queries older than the current rate limit window
  const relevantTimeAgo = now - currentRateLimitWindowMs;
  userData.queries = userData.queries.filter(q => q.timestamp > relevantTimeAgo);

  const queryCount = userData.queries.length;

  // Check if user is on cooldown
  if (userData.cooldown_end_timestamp && now < userData.cooldown_end_timestamp) {
    return new Response(JSON.stringify({
      error: 'Query limit exceeded.',
      cooldown_end_timestamp: userData.cooldown_end_timestamp,
      message_from_developer: messageFromDeveloper
    }), { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // Check if query limit is exceeded
  if (queryCount >= currentRateLimit) {
    if (!userData.cooldown_end_timestamp || now >= userData.cooldown_end_timestamp) {
      // The cooldown starts from the timestamp of the query that caused the exceed
      const cooldownStart = userData.queries.length > 0 ? userData.queries[currentRateLimit - 1].timestamp : now;
      userData.cooldown_end_timestamp = cooldownStart + currentRateLimitWindowMs;
    }

    await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));

    return new Response(JSON.stringify({
      error: 'Query limit exceeded.',
      cooldown_end_timestamp: userData.cooldown_end_timestamp,
      message_from_developer: messageFromDeveloper
    }), { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // If not rate-limited, record the query and proceed
  userData.queries.push({
    timestamp: now,
    query: query,
    user_name: user_name,
    user_email: user_email, // Store email with query for easier debugging/analysis
    user_local_time: user_local_time,
    api_target: api_target,
  });

  // Reset cooldown if it was active and now queries are below limit or period passed
  if (userData.cooldown_end_timestamp && now >= userData.cooldown_end_timestamp) {
      userData.cooldown_end_timestamp = null;
  }
  
  console.log('Attempting to write user data to KV for key:', userKvKey, 'Data:', JSON.stringify(userData));
  try {
    await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));
    console.log('Successfully wrote user data to KV for key:', userKvKey);
  } catch (kvError) {
    console.error('Error writing user data to KV for key:', userKvKey, 'Error:', kvError);
    return new Response(JSON.stringify({ error: `Failed to save user data: ${kvError.message}` }), { status: 500 });
  }

  // Proxy to the target API
  switch (api_target) {
    case 'serper':
      return proxySerper(api_payload, env);
    case 'mistral':
      return proxyMistral(api_payload, env);
    case 'coingecko':
      return proxyCoingecko(api_payload, env);
    default:
      console.warn('Invalid API target received:', api_target);
      return new Response(JSON.stringify({ error: 'Invalid API target.' }), { status: 400 });
  }
}

function handleOptions(request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-control-allow-headers', 'Content-Type');
  return new Response(null, { headers });
}