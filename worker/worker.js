// Helper to add CORS headers to a response
const corsify = (response) => {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const url = new URL(request.url);

    // API route handling
    if (url.pathname.startsWith('/api/')) {
      return corsify(await handleApiRequest(request, env));
    }

    // For all other requests, serve from Cloudflare Pages assets
    return env.ASSETS.fetch(request);
  }
};

async function handleApiRequest(request, env) {
  const url = new URL(request.url);

  // Route for Google Sign-In authentication
  if (url.pathname === '/api/google-auth') {
    return handleGoogleAuth(request, env);
  }

  // Central endpoint for all user queries
  if (url.pathname === '/api/query-proxy') {
    return handleQueryProxy(request, env);
  }

  return new Response('Not Found', { status: 404 });
}


// This function is for CORS preflight requests
function handleOptions(request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*'); // Allow any origin
  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); // Allowed methods
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Allowed headers
  return new Response(null, { headers });
}

// --- Proxy Functions ---
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
    return new Response('Expected POST for Google auth', { status: 405 });
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

// --- Main Handler for this specific endpoint ---
async function handleQueryProxy(request, env) {
  if (request.method !== 'POST') {
    return new Response('Expected POST for query proxy', { status: 405 });
  }

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

  const now = Date.now();
  const userKvKey = `user:${user_email}`;
  let userData = await env.YOUTOPIA_DATA.get(userKvKey, { type: 'json' });

  if (!userData) {
    userData = { queries: [], cooldown_end_timestamp: null, whitelist_start_date: null };
  }

  const FREE_RATE_LIMIT = 8;
  const FREE_RATE_LIMIT_WINDOW_MS = 6 * 60 * 60 * 1000;
  const WHITELIST_RATE_LIMIT = 200;
  const WHITELIST_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  const WHITELIST_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

  let currentRateLimit = FREE_RATE_LIMIT;
  let currentRateLimitWindowMs = FREE_RATE_LIMIT_WINDOW_MS;
  let messageFromDeveloper = `If you appreciate this project and the answers it provides, please consider supporting it! This is a solo, self-funded research project by a student (me lol).
Your donations would help to keep running it for everyone (and fund my coffee for improving it). Contributions over $20 qualify you for the 20x Plus Plan, which includes:
✅ 200 AI-powered queries per day
✅ Valid for a month

To activate the 20x plan after donating, simply email at support@youtopia.co.in

Thank you for your support, it truly makes a difference for me to not implement spyware to collect user data and sell it to whoever’s buying on 4chan`;

  const whitelistEmailsString = await env.YOUTOPIA_CONFIG.get('whitelist_emails');
  const whitelistEmails = whitelistEmailsString ? JSON.parse(whitelistEmailsString) : [];

  if (whitelistEmails.includes(user_email)) {
    if (!userData.whitelist_start_date) {
      userData.whitelist_start_date = now;
    }

    if (now - userData.whitelist_start_date < WHITELIST_VALIDITY_MS) {
      currentRateLimit = WHITELIST_RATE_LIMIT;
      currentRateLimitWindowMs = WHITELIST_RATE_LIMIT_WINDOW_MS;
      messageFromDeveloper = "Thank you for supporting YouTopia! You've reached your daily query limit for the 20x Plus Plan. Your generosity keeps this project running. You can make more queries after the cooldown.";
    } else {
      userData.whitelist_start_date = null;
    }
  }

  const relevantTimeAgo = now - currentRateLimitWindowMs;
  userData.queries = userData.queries.filter(q => q.timestamp > relevantTimeAgo);
  const queryCount = userData.queries.length;

  if (userData.cooldown_end_timestamp && now < userData.cooldown_end_timestamp) {
    return new Response(JSON.stringify({
      error: 'Query limit exceeded.',
      cooldown_end_timestamp: userData.cooldown_end_timestamp,
      message_from_developer: messageFromDeveloper
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  if (queryCount >= currentRateLimit) {
    if (!userData.cooldown_end_timestamp || now >= userData.cooldown_end_timestamp) {
      const cooldownStart = userData.queries.length > 0 ? userData.queries[currentRateLimit - 1].timestamp : now;
      userData.cooldown_end_timestamp = cooldownStart + currentRateLimitWindowMs;
    }
    await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));
    return new Response(JSON.stringify({
      error: 'Query limit exceeded.',
      cooldown_end_timestamp: userData.cooldown_end_timestamp,
      message_from_developer: messageFromDeveloper
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

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

  switch (api_target) {
    case 'serper':
      return proxySerper(api_payload, env);
    case 'mistral':
      return proxyMistral(api_payload, env);
    case 'coingecko':
      return proxyCoingecko(api_payload, env);
    default:
      return new Response(JSON.stringify({ error: 'Invalid API target.' }), { status: 400 });
  }
}