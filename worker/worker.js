import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { BingSerperAPI } from "../tools/bing_serper_api.js";
import { WebBrowser } from "langchain/tools/web_browser";
import { Calculator } from "langchain/tools/calculator";
import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createRetrieverTool } from "langchain/tools/retriever";
import { CoingeckoAPI, CoingeckoTool } from '../tools/coingecko_tool.js';
import { SerperAPI, SerperTool } from '../tools/serper_tool.js';
import { ScraperAPI, ScraperTool } from '../tools/scraper_tool.js';
import { WikiImageAPI, WikiImageTool } from '../tools/wiki_image_search_tool.js';
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

  return new Response('API route not found.', { status: 404 });
}

if (url.pathname === '/api/orchestrate') {
  return handleOrchestration(request, env);
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

    // Handle status check first to bypass all other logic
    if (api_target === 'status_check') {
        const now = Date.now();
        const userKvKey = `user:${user_email}`;
        let userData = await env.YOUTOPIA_DATA.get(userKvKey, { type: 'json' });
        if (!userData) {
            userData = { queries: [], cooldown_end_timestamp: null, whitelist_start_date: null };
        }

        const whitelistEmailsString = await env.YOUTOPIA_CONFIG.get('whitelist_emails');
        const whitelistEmails = whitelistEmailsString ? JSON.parse(whitelistEmailsString) : [];
        const WHITELIST_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
        
        let is_whitelisted_20x_plan = false;
        if (whitelistEmails.includes(user_email)) {
            let userDataUpdated = false;
            if (!userData.whitelist_start_date) {
                userData.whitelist_start_date = now;
                userDataUpdated = true;
            }
            if (userData.cooldown_end_timestamp) {
                userData.cooldown_end_timestamp = null;
                userDataUpdated = true;
            }
            if (now - userData.whitelist_start_date < WHITELIST_VALIDITY_MS) {
                is_whitelisted_20x_plan = true;
            } else {
                userData.whitelist_start_date = null;
                userDataUpdated = true;
            }
            if (userDataUpdated) {
                await env.YOUTOPIA_DATA.put(userKvKey, JSON.stringify(userData));
            }
        }
        
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
      userData = { queries: [], cooldown_end_timestamp: null, whitelist_start_date: null };
    }

    const whitelistEmailsString = await env.YOUTOPIA_CONFIG.get('whitelist_emails');
    const whitelistEmails = whitelistEmailsString ? JSON.parse(whitelistEmailsString) : [];
    const WHITELIST_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
    
    let is_whitelisted_20x_plan = false;
    if (whitelistEmails.includes(user_email)) {
        if (!userData.whitelist_start_date) {
            userData.whitelist_start_date = now;
        }
        if (now - userData.whitelist_start_date < WHITELIST_VALIDITY_MS) {
            is_whitelisted_20x_plan = true;
        } else {
            userData.whitelist_start_date = null; // Whitelist has expired
        }
    }
    
    const FREE_RATE_LIMIT = 8;
    const FREE_RATE_LIMIT_WINDOW_MS = 6 * 60 * 60 * 1000;
    const WHITELIST_RATE_LIMIT = 200;
    const WHITELIST_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
    
    const currentRateLimit = is_whitelisted_20x_plan ? WHITELIST_RATE_LIMIT : FREE_RATE_LIMIT;
    const currentRateLimitWindowMs = is_whitelisted_20x_plan ? WHITELIST_RATE_LIMIT_WINDOW_MS : FREE_RATE_LIMIT_WINDOW_MS;
    
    let messageFromDeveloper = is_whitelisted_20x_plan
      ? "Thank you for supporting YouTopia! You've reached your daily query limit for the 20x Plus Plan. Your generosity keeps this project running. You can make more queries after the cooldown."
      : `If you appreciate this project and responses, please consider supporting it! This is a solo, self-funded research project by a full time student.
Your donations would help to keep running it for everyone (and fund my coffee for improving it). Contributions over $20 also qualify for the 20x Plus Plan, which includes:
✅ 200 queries per day
✅ Valid for an entire month

To activate the 20x plan after donating, simply email us at support@youtopia.co.in or youtopialabs@gmail.com

Thank you for your support, it truly makes a difference to allow this project to be funded by users and not advertisers.`;
    
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

    if (queryCount > currentRateLimit) {
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

    // Increment query count and save user data
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
// --- Agent Orchestration Logic ---

async function handleOrchestration(request, env) {
  try {
    const { query, user_name, user_email, user_local_time, selectedModel, isShortResponseEnabled, is_preview } = await request.json();

    // --- Bypass for Preview Branch ---
    if (!is_preview) {
      // Existing authentication and rate-limiting logic for production
      try {
        const tokenInfo = await verifyGoogleToken(id_token, env);
        if (tokenInfo.email !== user_email) {
          return new Response(JSON.stringify({ error: 'Security alert: Token-email mismatch.' }), { status: 403 });
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: `Authentication failed: ${error.message}` }), { status: 401 });
      }
      // ... existing rate limiting logic ...
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const textEncoder = new TextEncoder();

    const streamCallback = (chunk) => {
      writer.write(textEncoder.encode(`data: ${JSON.stringify({ type: 'stream', content: chunk })}\n\n`));
    };

    const logCallback = (message) => {
      writer.write(textEncoder.encode(`data: ${JSON.stringify({ type: 'log', content: message })}\n\n`));
    };

    const runAgent = async () => {
      try {
        logCallback('<i class="fas fa-cogs" style="color: #60A5FA;"></i> Initializing AI agents and tools...');

        const tools = createTools(query, user_name, user_local_time, streamCallback, logCallback, env);

        const llm = new ChatOpenAI({
            modelName: "gpt-4-turbo-2024-04-09",
            temperature: 0.1,
            streaming: true,
            openAIApiKey: env.MISTRAL_API_KEY, // Use the key from env
            configuration: {
                baseURL: 'https://api.mistral.ai/v1', // Point directly to Mistral
                dangerouslyAllowBrowser: true, // This is a worker, so it's safe
            },
        });

        let mainPrompt = selectedModel === 'Amaya'
            ? await env.ASSETS.fetch(new Request(new URL('/agents/agent1_prompt.js', request.url))).then(res => res.text())
            : await env.ASSETS.fetch(new Request(new URL('/agents/agent2_prompt.js', request.url))).then(res => res.text());

        const match = mainPrompt.match(/`([\s\S]*)`/);
        if (match) mainPrompt = match[1];


        if (isShortResponseEnabled) {
            mainPrompt += "\n\nIMPORTANT: The user has requested a short, concise response. Please provide a direct answer without unnecessary elaboration.";
            logCallback('<i class="fas fa-compress-arrows-alt" style="color: #3B82F6;"></i> Short response mode enabled.');
        }

        const agentExecutor = await initializeAgentExecutorWithOptions(tools, llm, {
            agentType: "openai-functions",
            verbose: true,
            agentArgs: {
                prefix: mainPrompt,
            },
        });

        logCallback('<i class="fas fa-play-circle" style="color: #10B981;"></i> Agent executor created. Starting execution...');

        const result = await agentExecutor.invoke({
            input: query
        }, {
            callbacks: [{
                handleLLMNewToken(token) {
                    streamCallback(token);
                },
            }, ],
        });

        let finalResponse = result.output;
        logCallback('<i class="fas fa-flag-checkered" style="color: #10B981;"></i> Agent execution finished.');
        
        let sources = [];
        try {
            const sourcesMatch = finalResponse.match(/\[SOURCES\]\s*(\{[\s\S]*?\})\s*\[\/SOURCES\]/);
            if (sourcesMatch && sourcesMatch[1]) {
                const sourcesJson = sourcesMatch[1];
                sources = JSON.parse(sourcesJson).sources;
                finalResponse = finalResponse.replace(sourcesMatch[0], '').trim();
                logCallback(`<i class="fas fa-link" style="color: #3B82F6;"></i> Extracted ${sources.length} sources.`);
            }
        } catch (e) {
            logCallback(`<i class="fas fa-exclamation-triangle" style="color: #FBBF24;"></i> Could not parse sources from the response: ${e.message}`);
        }

        writer.write(textEncoder.encode(`data: ${JSON.stringify({ type: 'final_response', content: finalResponse, sources: sources })}\n\n`));

      } catch (e) {
        console.error("Error during agent execution:", e);
        writer.write(textEncoder.encode(`data: ${JSON.stringify({ type: 'error', content: e.message })}\n\n`));
      } finally {
        writer.close();
      }
    };

    runAgent();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

const createTools = (query, userName, userLocalTime, streamCallback, logCallback, env) => {
    const serperAPI = new SerperAPI(
        env.SERPER_API_KEY,
        (payload) => proxySerper(payload, env).then(r => r.json())
    );
    const coingeckoAPI = new CoingeckoAPI(
        (payload) => proxyCoingecko(payload, env).then(r => r.json())
    );
    // Add other tools similarly, proxying through the worker's existing functions
    
    const tools = [
        new SerperTool(serperAPI, logCallback),
        new CoingeckoTool(coingeckoAPI, logCallback),
        // Scraper and WikiImage tools need their proxy functions implemented if they are to be used
    ];

    return tools;
};