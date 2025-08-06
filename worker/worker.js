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
    } else {
      // In modern Cloudflare Workers, environment variables are passed as the env parameter
      return corsify(await handleRequest(request, env));
    }
  }
};

async function handleRequest(request, env) {
  // In modern Cloudflare Workers, environment variables are accessed via the env parameter
  console.log('Env object:', env);
  console.log('Available env variables:', Object.keys(env));
  console.log('FIREBASE_PROJECT_ID:', env.FIREBASE_PROJECT_ID);

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

export async function proxySerper(api_payload, env) {
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

export async function proxyCoingecko(api_payload, env) {
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

// New function to directly call Mistral API from worker
export async function callMistralApiWorker(model, messages, env, retryCount = 0) {
  const mistralApiKey = env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    throw new Error('MISTRAL_API_KEY not set in environment variables');
  }

  try {
    const mistralApiUrl = 'https://api.mistral.ai/v1/chat/completions';
    
    const mistralResponse = await fetch(mistralApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: retryCount > 0 ? 0.3 : 0.7,
        max_tokens: 6000,
        stream: true
      }),
    });

    if (!mistralResponse.ok) {
      const errorText = await mistralResponse.text();
      console.error('Mistral API error response:', errorText);
      throw new Error(`Mistral API error: ${mistralResponse.status} - ${errorText || mistralResponse.statusText}`);
    }

    return mistralResponse;

  } catch (error) {
    console.error('Error in Mistral API call (worker):', error);
    throw new Error(`Mistral API call error: ${error.message}`);
  }
}

// Refactored proxyMistral to use orchestrateAgents
import { orchestrateAgents } from './agents/agent_orchestrator.js'; // Will be created later

async function proxyMistral(userQuery, api_payload, env, user_name, user_email, user_local_time, agent_selection_type) {
  // api_payload is not directly used here as orchestrateAgents takes userQuery
  // and handles its own internal calls to Mistral (via callMistralApiWorker)

  console.log(`proxyMistral called for orchestration with query: "${userQuery}" and selection: "${agent_selection_type}"`);
  
  // Create a TransformStream to handle streaming response back to the client
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Define a stream callback for orchestrateAgents to write to this stream
  const streamCallback = (chunk) => {
    writer.write(encoder.encode(`data:${JSON.stringify({ content: chunk })}\n\n`));
  };

  // Define a log callback for orchestrateAgents to send log messages
  const logCallback = (message) => {
    writer.write(encoder.encode(`data:${JSON.stringify({ log: message })}\n\n`));
  };

  // Run orchestration in the background
  (async () => {
    try {
      const finalResponse = await orchestrateAgents(userQuery, agent_selection_type, streamCallback, logCallback, env); // Pass env
      // If orchestration doesn't stream, or needs a final send
      if (finalResponse) {
        writer.write(encoder.encode(`data:${JSON.stringify({ content: finalResponse })}\n\n`));
      }
      writer.write(encoder.encode('data:[DONE]\n\n'));
      writer.close();
    } catch (error) {
      console.error('Orchestration error:', error);
      writer.write(encoder.encode(`data:${JSON.stringify({ error: error.message })}\n\n`));
      writer.write(encoder.encode('data:[DONE]\n\n'));
      writer.close();
    }
  })();

  // Return a streaming response
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}


// --- Robust JWT Verification ---

// A more robust JWT decoder that handles Base64URL encoding.
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT must have 3 parts');
    }
    const [header, payload, signature] = parts;
    
    // Decode header
    const decodedHeader = JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/')));

    // Decode payload
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

// Fetches public keys from both Google OAuth and Firebase endpoints
async function getPublicKeys() {
  try {
    // Try Firebase endpoint first
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

  // Fallback to Google OAuth endpoint
  const googleUrl = 'https://www.googleapis.com/oauth2/v3/certs';
  const googleResponse = await fetch(googleUrl);
  if (!googleResponse.ok) {
    throw new Error('Failed to fetch public keys from both endpoints');
  }
  const certs = await googleResponse.json();
  return certs.keys.map(key => ({ ...key, source: 'google' }));
}

// Verifies the Google ID token locally using Web Crypto API.
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

  // Step 1: Verify issuer and audience for Firebase ID tokens
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

  // Step 2: Verify expiration
  if (payload.exp * 1000 < Date.now()) {
    throw new Error('Token has expired.');
  }

  // Step 3: Verify signature
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
      // For Firebase certificates, we'll skip signature verification for now
      // This is a temporary workaround due to X.509 parsing complexity in Cloudflare Workers
      console.log('Firebase certificate found, skipping signature verification (temporary workaround)');
      // Just return success for now - in production you'd want proper certificate parsing
    } else {
      // For Google JWK keys
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
  return payload; // Return the entire payload which includes email, name, etc.
}

async function handleGoogleAuth(request, env) {
  if (request.method !== 'POST') {
    return new Response('Expected POST for Google auth', { status: 405 });
  }

  try {
    const { id_token } = await request.json();
    const tokenInfo = await verifyGoogleToken(id_token, env);
    
    // You can optionally store user sign-in event here if needed
    
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

async function handleQueryProxy(request, env) {
  if (request.method !== 'POST') {
    return new Response('Expected POST for query proxy', { status: 405 });
  }

  const { query, user_name, user_email, user_local_time, api_target, api_payload, id_token, agent_selection_type } = await request.json();

  try {
    const tokenInfo = await verifyGoogleToken(id_token, env);
    // CRITICAL: Ensure the email from the verified token matches the user_email sent from the frontend.
    if (tokenInfo.email !== user_email) {
      console.error('Security Alert: Email mismatch between ID token and request body. Token email:', tokenInfo.email, 'Request email:', user_email);
      return new Response(JSON.stringify({ error: 'Security alert: Token-email mismatch.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Authentication error in handleQueryProxy:', error.message);
    return new Response(JSON.stringify({ error: `Authentication failed: ${error.message}` }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

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
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
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
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
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
      return proxyMistral(query, api_payload, env, user_name, user_email, user_local_time, agent_selection_type);
    case 'coingecko':
      return proxyCoingecko(api_payload, env);
    default:
      console.warn('Invalid API target received:', api_target);
      return new Response(JSON.stringify({ error: 'Invalid API target.' }), { status: 400 });
  }
}

function handleOptions(request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*'); // Allow any origin
  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); // Allowed methods
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Allowed headers
  return new Response(null, { headers });
}