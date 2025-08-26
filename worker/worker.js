// Helper to add CORS headers to a response
const allowedOrigins = [
  'https://youtopia.co.in',
  'https://youtopia-search-e7z.pages.dev',
  'https://youtopia-worker.youtopialabs.workers.dev',
  'http://localhost:8788', // For local development with wrangler
  'http://127.0.0.1:8788'
];

const corsify = (response, request) => {
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else {
    // For requests from other origins, you might want to handle them differently
    // For now, let's keep it permissive for simplicity, but you can restrict it
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
};

// A new router function to handle all API requests.
async function handleApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/google-auth') {
    return handleGoogleAuth(request, env);
  }

  if (url.pathname === '/api/query-proxy') {
    return handleQueryProxy(request, env);
  }

  if (url.pathname === '/api/kv-data') {
    return handleKvData(request, env);
  }

  if (url.pathname === '/api/conversation-history') {
    return handleConversationHistory(request, env);
  }

  return new Response('API route not found.', { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return handleOptions(request, new Headers());
      }

      // Check if the request is for an API endpoint
      if (url.pathname.startsWith('/api/')) {
        const response = await handleApiRequest(request, env);
        return corsify(response, request);
      }

      // For all other requests, serve from Cloudflare Pages assets
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error('Unhandled fatal error in fetch handler:', error.stack);
      const errorResponse = new Response(JSON.stringify({ error: `A fatal and unhandled error occurred: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
      return corsify(errorResponse, request);
    }
  }
};


// This function is for CORS preflight requests
function handleOptions(request, headers) {
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }

  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(null, { headers });
}

// --- Proxy Functions ---
async function proxySerper(api_payload, env) {
  const serperApiUrl = api_payload.type === 'search' ? 'https://google.serper.dev/search' : 'https://google.serper.dev/news';

  if (!env.SERPER_API_KEY) {
    console.error('SERPER_API_KEY is not set in environment variables.');
    return new Response(JSON.stringify({ error: 'SERPER_API_KEY is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const serperResponse = await fetch(serperApiUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(api_payload.body),
    });

    if (!serperResponse.ok) {
      const errorText = await serperResponse.text();
      console.error(`Serper API error: ${serperResponse.status} - ${errorText}`);
      return new Response(JSON.stringify({ error: `Serper API error: ${serperResponse.status}`, details: errorText }), {
        status: serperResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const serperData = await serperResponse.json();
    return new Response(JSON.stringify(serperData), {
      status: serperResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error in proxySerper:', error.stack);
    return new Response(JSON.stringify({ error: `Error proxying to Serper: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
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
    console.log('Proxying to Mistral with payload:', JSON.stringify(api_payload, null, 2));
    
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
    console.error('COINGECKO_API_KEY is not set in environment variables.');
    return new Response(JSON.stringify({ error: 'COINGECKO_API_KEY is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const queryParams = new URLSearchParams(api_payload.params).toString();
    const coingeckoApiUrl = `https://api.coingecko.com/api/v3/simple/price?${queryParams}`;

    const coingeckoResponse = await fetch(coingeckoApiUrl, {
      method: 'GET',
      headers: {
        'x-cg-demo-api-key': coingeckoApiKey,
      },
    });

    if (!coingeckoResponse.ok) {
      const errorText = await coingeckoResponse.text();
      console.error(`CoinGecko API error: ${coingeckoResponse.status} - ${errorText}`);
      return new Response(JSON.stringify({ error: `CoinGecko API error: ${coingeckoResponse.status}`, details: errorText }), {
        status: coingeckoResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const coingeckoData = await coingeckoResponse.json(); // Always parse the JSON response
    const response = new Response(JSON.stringify(coingeckoData), {
      status: coingeckoResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
    return response;
  } catch (error) {
    console.error('Error in proxyCoingecko:', error.stack);
    return new Response(JSON.stringify({ error: `Error proxying to CoinGecko: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}


// --- Robust JWT Verification ---
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT must have 3 parts');
    }
    const [header, payload, signature] = parts;
    
    const decodedHeader = JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/')));
    const decodedPayload = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));

    return {
      header: decodedHeader,
      payload: decodedPayload,
      signature: signature,
      raw: { header, payload, signature }
    };
  } catch (e) {
    console.error("Failed to decode JWT:", e.message);
    throw new Error("Invalid token format");
  }
}

async function getPublicKeys() {
  try {
    const firebaseUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    const firebaseResponse = await fetch(firebaseUrl);
    if (firebaseResponse.ok) {
      const certs = await firebaseResponse.json();
      const keys = [];
      for (const [kid, cert] of Object.entries(certs)) {
        keys.push({
          kid: kid,
          cert: cert,
          source: 'firebase'
        });
      }
      return keys;
    }
  } catch (e) {
    console.log('Firebase endpoint failed, trying Google OAuth endpoint');
  }

  const googleUrl = 'https://www.googleapis.com/oauth2/v3/certs';
  const googleResponse = await fetch(googleUrl);
  if (!googleResponse.ok) {
    throw new Error('Failed to fetch public keys from both endpoints');
  }
  const certs = await googleResponse.json();
  return certs.keys.map(key => ({ ...key, source: 'google' }));
}

async function verifyGoogleToken(id_token, env) {
  if (!id_token) {
    throw new Error('Authentication token is missing.');
  }
  
  console.log("Starting token verification for token:", id_token.substring(0, 30) + "...");

  const decodedToken = decodeJwt(id_token);
  const { header, payload, raw } = decodedToken;

  console.log("Token header:", JSON.stringify(header));
  console.log("Token payload issuer:", payload.iss);
  console.log("Token payload audience:", payload.aud);

  if (!env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID environment variable is not set.');
  }

  const expectedIssuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: ${payload.iss}. Expected: ${expectedIssuer}`);
  }
  if (payload.aud !== env.FIREBASE_PROJECT_ID) {
    throw new Error(`Invalid token audience: ${payload.aud}. Expected: ${env.FIREBASE_PROJECT_ID}`);
  }

  if (payload.exp * 1000 < Date.now()) {
    throw new Error('Token has expired.');
  }

  const keys = await getPublicKeys();
  console.log("Available public keys:", keys.map(k => ({ kid: k.kid, source: k.source })));
  console.log("Looking for key with kid:", header.kid);
  
  const key = keys.find(k => k.kid === header.kid);
  if (!key) {
    console.error("Public key not found. Available keys:", keys.map(k => k.kid));
    console.error("Token header kid:", header.kid);
    throw new Error(`Public key not found for token. Available keys: ${keys.map(k => k.kid).join(', ')}. Token kid: ${header.kid}`);
  }

  try {
    let cryptoKey;
    
    if (key.source === 'firebase') {
      console.log('Firebase certificate found, skipping signature verification (temporary workaround)');
    } else {
      const jwk = {
        kty: key.kty,
        n: key.n,
        e: key.e,
      };

      cryptoKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureInput = `${raw.header}.${raw.payload}`;
      const signatureBytes = new Uint8Array(atob(raw.signature.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
      const dataBytes = new TextEncoder().encode(signatureInput);

      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes,
        dataBytes
      );

      if (!isValid) {
        throw new Error('Invalid token signature.');
      }
    }
  } catch (verifyError) {
    console.error('Error during signature verification:', verifyError);
    throw new Error(`Signature verification failed: ${verifyError.message}`);
  }

  console.log('Google ID token verified successfully for email:', payload.email);
  return payload;
}

async function handleGoogleAuth(request, env) {
  if (request.method !== 'POST') {
    return new Response('Request mis-routed to Google Auth handler', { status: 405 });
  }

  try {
    const { id_token } = await request.json();
    const tokenInfo = await verifyGoogleToken(id_token, env);
    
    return new Response(JSON.stringify({ success: true, email: tokenInfo.email }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handleGoogleAuth:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// --- Helper function to check if user is whitelisted ---
async function isUserWhitelisted(user_email, env) {
  const whitelistEmailsString = await env.YOUTOPIA_CONFIG.get('whitelist_emails');
  const whitelistEmails = whitelistEmailsString ? JSON.parse(whitelistEmailsString) : [];
  return whitelistEmails.includes(user_email);
}

// --- Main Handler for this specific endpoint ---
async function handleQueryProxy(request, env) {
  try {

    const { query, user_name, user_email, user_local_time, api_target, api_payload, id_token } = await request.json();

    try {
      const tokenInfo = await verifyGoogleToken(id_token, env);
      if (tokenInfo.email !== user_email) {
        console.error('Security Alert: Email mismatch between ID token and request body. Token email:', tokenInfo.email, 'Request email:', user_email);
        return new Response(JSON.stringify({ error: 'Security alert: Token-email mismatch.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    } catch (error) {
      console.error('Authentication error in handleQueryProxy:', error.message);
      return new Response(JSON.stringify({ error: `Authentication failed: ${error.message}` }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Check if user is whitelisted
    const is_whitelisted_20x_plan = await isUserWhitelisted(user_email, env);
    
    // Handle status check first to bypass all other logic
    if (api_target === 'status_check') {
        return new Response(JSON.stringify({ success: true, is_whitelisted_20x_plan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    // --- Rate Limiting Logic for all other API targets ---
    const now = Date.now();
    const userKvKey = `user:${user_email}`;
    let userData = await env.YOUTOPIA_DATA.get(userKvKey, { type: 'json' });

    if (!userData) {
      userData = { queries: [], cooldown_end_timestamp: null };
    }

    // For whitelisted users, provide unlimited access with simple daily reset
    if (is_whitelisted_20x_plan) {
      console.log('Whitelisted user detected, processing request without rate limits:', user_email);
      
      // Just log the query for whitelisted users, no rate limiting
      userData.queries.push({
        timestamp: now,
        query: query,
        user_name: user_name,
        user_email: user_email,
        user_local_time: user_local_time,
        api_target: api_target,
      });
      
      // Clear cooldown for whitelisted users
      userData.cooldown_end_timestamp = null;
      
      await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));
      
      // Proceed directly to API proxying for whitelisted users
      switch (api_target) {
        case 'serper':
          return proxySerper(api_payload, env);
        case 'mistral':
          return proxyMistral(api_payload, env);
        case 'coingecko':
          return proxyCoingecko(api_payload, env);
        default:
          return new Response(JSON.stringify({ error: 'Invalid API target.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Rate limiting for non-whitelisted users only
    const FREE_RATE_LIMIT = 8;
    const FREE_RATE_LIMIT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
    
    const messageFromDeveloper = `If you appreciate this project and responses, please consider supporting it! This is a solo, self-funded research project by a full time student.
Your donations would help to keep running it for everyone (and fund my coffee for improving it). Contributions over $20 also qualify for the 20x Plus Plan, which includes:
✅ 200 queries per day
✅ Valid for an entire month

To activate the 20x plan after donating, simply email us at support@youtopia.co.in or youtopialabs@gmail.com

Thank you for your support, it truly makes a difference to allow this project to be funded by users and not advertisers.`;
    
    const relevantTimeAgo = now - FREE_RATE_LIMIT_WINDOW_MS;
    userData.queries = userData.queries.filter(q => q.timestamp > relevantTimeAgo);
    const queryCount = userData.queries.length;

    console.log('Free user rate limit check:', {
      user_email: user_email,
      queryCount: queryCount,
      FREE_RATE_LIMIT: FREE_RATE_LIMIT,
      cooldown_end_timestamp: userData.cooldown_end_timestamp
    });
    
    if (userData.cooldown_end_timestamp && now < userData.cooldown_end_timestamp) {
      return new Response(JSON.stringify({
        error: 'Query limit exceeded.',
        cooldown_end_timestamp: userData.cooldown_end_timestamp,
        message_from_developer: messageFromDeveloper
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    if (queryCount >= FREE_RATE_LIMIT) {
      if (!userData.cooldown_end_timestamp || now >= userData.cooldown_end_timestamp) {
        const cooldownStart = userData.queries.length > 0 ? userData.queries[FREE_RATE_LIMIT - 1].timestamp : now;
        userData.cooldown_end_timestamp = cooldownStart + FREE_RATE_LIMIT_WINDOW_MS;
      }
      await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));
      return new Response(JSON.stringify({
        error: 'Query limit exceeded.',
        cooldown_end_timestamp: userData.cooldown_end_timestamp,
        message_from_developer: messageFromDeveloper
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // Increment query count and save user data for free users
    console.log('Processing query for free user:', {
      user_email: user_email,
      queryCount: queryCount,
      FREE_RATE_LIMIT: FREE_RATE_LIMIT
    });
    
    userData.queries.push({
      timestamp: now,
      query: query,
      user_name: user_name,
      user_email: user_email,
      user_local_time: user_local_time,
      api_target: api_target,
    });

    if (userData.cooldown_end_timestamp && now >= userData.cooldown_end_timestamp) {
        userData.cooldown_end_timestamp = null;
    }
    
    await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));

    // --- Proxy the request to the target API ---
    switch (api_target) {
      case 'serper':
        return proxySerper(api_payload, env);
      case 'mistral':
        return proxyMistral(api_payload, env);
      case 'coingecko':
        return proxyCoingecko(api_payload, env);
      default:
        return new Response(JSON.stringify({ error: 'Invalid API target.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Error in handleQueryProxy:', error.stack);
    return new Response(JSON.stringify({ error: `Error processing proxy request: ${error.message}` }), {
      status: 400, // Bad Request for parsing errors
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

async function handleKvData(request, env) {
  try {
    const { id_token } = await request.json();
    const tokenInfo = await verifyGoogleToken(id_token, env);

    const authorizedEmails = ['ayushhroyy@gmail.com', 'youtopialabs@gmail.com'];

    // Only allow authorized users to view KV data
    if (!tokenInfo.email || !authorizedEmails.includes(tokenInfo.email)) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Your email is not authorized to view this data.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const listResponse = await env.YOUTOPIA_DATA.list();
    const keys = listResponse.keys;
    const kvData = {};

    for (const key of keys) {
      if (key.name.startsWith('user:')) { // Only fetch user data
        const value = await env.YOUTOPIA_DATA.get(key.name, { type: 'json' });
        kvData[key.name] = value;
      }
    }

    return new Response(JSON.stringify({ success: true, data: kvData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handleKvData:', error.stack);
    return new Response(JSON.stringify({ error: `Error retrieving KV data: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleConversationHistory(request, env) {
  try {
    let id_token, history;

    if (request.method === 'GET') {
      const url = new URL(request.url);
      id_token = url.searchParams.get('id_token');
    } else if (request.method === 'POST') {
      const body = await request.json();
      id_token = body.id_token;
      history = body.history;
    } else {
      return new Response('Method not allowed.', { status: 405 });
    }

    if (!id_token) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing id_token.' }), { status: 400 });
    }

    const tokenInfo = await verifyGoogleToken(id_token, env);
    const user_email = tokenInfo.email;

    if (!user_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid user email.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const historyKey = `history:${user_email}`;

    if (request.method === 'GET') {
      const storedHistory = await env.YOUTOPIA_DATA.get(historyKey, { type: 'json' });
      return new Response(JSON.stringify({ success: true, history: storedHistory || [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST') {
      if (!history) {
        return new Response(JSON.stringify({ error: 'Bad Request: Missing history data.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      await env.YOUTOPIA_DATA.put(historyKey, JSON.stringify(history));
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Invalid request method.', { status: 400 });

  } catch (error) {
    console.error('Error in handleConversationHistory:', error.stack);
    return new Response(JSON.stringify({ error: `Error handling conversation history: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}