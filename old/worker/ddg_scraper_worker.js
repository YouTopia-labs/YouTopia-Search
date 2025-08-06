/**
 * Enhanced Cloudflare Worker to scrape DuckDuckGo HTML search results.
 *
 * @version 3.1.0
 * @author Gemini & User
 *
 * This version incorporates significant improvements for performance, stealth, and data quality.
 *
 * API Endpoint:
 * /?q=<query>&since=<time>&limit=<num>&page=<num>&region=<region>
 *
 * Parameters:
 * - q (required): The search query.
 * - since (optional): Filter results by time. Values: 'day', 'week', 'month', 'year'.
 * - limit (optional): The maximum number of results to return. Defaults to 25.
 * - page (optional): The results page number to fetch. Defaults to 1.
 * - region (optional): A region code (e.g., 'us-en', 'uk-en', 'de-de') for localized results.
 *
 * Features:
 * - Parallel Requests: Fires multiple requests simultaneously to increase success rate and speed.
 * - Enhanced Stealth: Rotates a wide range of User-Agents (including mobile), realistic browser headers (Sec-CH-UA), referrers, and language headers.
 * - Rich Data Extraction: Parses titles, direct URLs, snippets, domains, and related searches.
 * - Performance Logging: Logs fetch time and duration to the console and includes it in the response.
 * - Pagination Support: Fetches subsequent pages of search results.
 * - Custom Result Limits: Control the number of results returned.
 * - Region-Specific Search: Get results for specific countries/languages.
 * - Faster Retries: More aggressive exponential backoff timing.
 * - Reduced Cache TTL: Caches results for 10 minutes for fresher data.
 * - Snippet Cleaning: Normalizes whitespace and cleans HTML entities.
 * - Robust Error Handling: Clearer error messages and categories.
 */

// --- CONFIGURATION ---

// A larger, more diverse list of user agents, including mobile devices.
const USER_AGENTS = [
  // Desktop - Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Desktop - Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  // Desktop - Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  // Mobile - Chrome (Android)
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  // Mobile - Safari (iOS)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

// More comprehensive header sets with realistic browser fingerprints and language variations.
const HEADER_SETS = [
    {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-CH-UA': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    },
    {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.8,de;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Upgrade-Insecure-Requests': '1'
    },
    {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9,fr-CA;q=0.8',
        'Sec-CH-UA': '"Safari";v="17", "Not A Brand";v="8"',
        'Sec-CH-UA-Mobile': '?1',
        'Sec-CH-UA-Platform': '"iOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
    }
];

// Referrer rotation, including DDG's own pages.
const REFERRERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://t.co/', // Twitter
    'https://www.reddit.com/',
    '' // Direct access
];

// --- UTILITY FUNCTIONS ---

/**
 * A utility function to introduce a delay with jitter.
 * @param {number} ms The base number of milliseconds to wait.
 */
const delay = ms => {
    const jitter = (Math.random() * ms * 0.5) - (ms * 0.25); // Add/subtract up to 25%
    return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

/**
 * Selects a random item from an array.
 * @param {Array} arr The array to choose from.
 * @returns A random item from the array.
 */
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Cleans and decodes a DuckDuckGo redirect URL to get the direct link.
 * @param {string} ddgUrl The URL from the 'href' attribute.
 * @returns {string} The cleaned, direct URL.
 */
function cleanUrl(ddgUrl) {
    if (!ddgUrl) return '';
    try {
        const url = new URL(ddgUrl, 'https://duckduckgo.com');
        const uddg = url.searchParams.get('uddg');
        if (uddg) {
            return decodeURIComponent(uddg);
        }
        // Fallback for cases where uddg is not present
        return ddgUrl;
    } catch (e) {
        return ddgUrl; // Return original if parsing fails
    }
}

/**
 * Cleans snippet text by trimming, normalizing whitespace, and decoding HTML entities.
 * @param {string} text The raw snippet text.
 * @returns {string} The cleaned snippet text.
 */
function cleanSnippet(text) {
    // A simple entity decoder
    const decodeEntities = (encodedString) => {
        const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
        const translate = {
            "nbsp":" ", "amp" : "&", "quot": "\"", "lt"  : "<", "gt"  : ">"
        };
        return encodedString.replace(translate_re, (match, entity) => translate[entity] || match);
    };
    if (!text) return '';
    const decoded = decodeEntities(text);
    return decoded.replace(/(\r\n|\n|\r)/gm, " ").trim();
}


// --- CORE FETCH LOGIC ---

/**
 * Creates a fetch promise with randomized headers for a single request attempt.
 * @param {string} url The URL to fetch.
 * @returns {Promise<Response>} A fetch promise.
 */
function createFetchAttempt(url) {
    const headers = {
        'User-Agent': getRandomItem(USER_AGENTS),
        ...getRandomItem(HEADER_SETS),
    };
    const referrer = getRandomItem(REFERRERS);
    if (referrer) {
        headers['Referer'] = referrer;
    }
    return fetch(url, { headers });
}


/**
 * Handles CORS preflight (OPTIONS) requests.
 */
function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now(); // Start timer
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Ensure CORS is always enabled
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache', // We manage caching manually
    };

    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    try {
      const requestUrl = new URL(request.url);
      const params = requestUrl.searchParams;
      const query = params.get('q');
      const since = params.get('since');
      const limit = parseInt(params.get('limit') || '25', 10);
      const page = parseInt(params.get('page') || '1', 10);
      const region = params.get('kl');

      if (!query) {
        throw new Error('The `q` (query) search parameter is required.');
      }

      // --- Build Target URL ---
      const targetUrl = new URL('https://html.duckduckgo.com/html/');
      targetUrl.searchParams.set('q', query);

      // Time filter
      if (since) {
        const timeLimitMap = { day: 'd', week: 'w', month: 'm', year: 'y' };
        const dfValue = timeLimitMap[since.toLowerCase()];
        if (dfValue) {
            targetUrl.searchParams.set('df', dfValue);
        }
      }
      
      // Region filter
      if (region) {
          targetUrl.searchParams.set('kl', region);
      }

      // Pagination logic
      // DDG uses 's' for start index. page 1 = 0, page 2 = 25, etc.
      if (page > 1) {
          targetUrl.searchParams.set('s', (page - 1) * 25);
          targetUrl.searchParams.set('v', 'l'); // Necessary for pagination
          targetUrl.searchParams.set('o', 'json');
      }

      const urlToFetch = targetUrl.toString();
      const cache = caches.default;
      let cachedResponse = await cache.match(urlToFetch);

      if (cachedResponse) {
        const duration = Date.now() - startTime;
        console.log(`CACHE HIT for: ${urlToFetch} (took ${duration}ms)`);
        const body = await cachedResponse.json();
        body.status.cache = 'HIT';
        body.status.duration = `${duration}ms`;
        return new Response(JSON.stringify(body, null, 2), {
            headers: { ...corsHeaders, 'X-Cache-Status': 'HIT' }
        });
      }

      console.log(`CACHE MISS. Starting parallel fetch for: ${urlToFetch}`);
      
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Attempt ${attempt}/${maxRetries}... Firing parallel requests.`);

          // --- Parallel Request Strategy ---
          // Fire 2 requests simultaneously. The first one to succeed wins.
          // This dramatically increases the chance of getting a valid response quickly.
          const promises = [createFetchAttempt(urlToFetch), createFetchAttempt(urlToFetch)];
          const originResponse = await Promise.any(promises);

          if (!originResponse.ok) {
            // This error will be caught and trigger a retry
            throw new Error(`Origin server responded with status: ${originResponse.status}`);
          }
          
          // --- HTML Parsing ---
          const results = [];
          const related_searches = [];
          let currentResult = null;

          const rewriter = new HTMLRewriter()
            .on('div.result', {
                element(element) {
                    // Reset on each new result block
                    if (currentResult) {
                        if (currentResult.title && currentResult.url && results.length < limit) {
                           results.push(currentResult);
                        }
                    }
                    currentResult = { title: '', url: '', snippet: '', domain: '' };
                },
            })
            .on('h2.result__title > a.result__a', {
              element(element) {
                if (currentResult) {
                    currentResult.url = cleanUrl(element.getAttribute('href'));
                }
              },
              text(textChunk) {
                 if (currentResult) { currentResult.title += textChunk.text; }
              },
            })
            .on('a.result__snippet', {
              text(textChunk) {
                 if (currentResult) { currentResult.snippet += textChunk.text; }
              },
            })
            .on('span.result__url', {
                text(textChunk) {
                    if (currentResult) { currentResult.domain += textChunk.text.trim(); }
                }
            })
            .on('div.results--sidebar a.related-search__link', {
                text(textChunk) {
                    related_searches.push(textChunk.text.trim());
                }
            });

          const transformedResponse = rewriter.transform(originResponse);
          await transformedResponse.text(); // Consume the stream to ensure parsing completes

          // Clean up and add the very last result if it exists
          if (currentResult && currentResult.title && currentResult.url && results.length < limit) {
            results.push(currentResult);
          }
          
          // Final cleaning pass on all collected results
          results.forEach(res => {
              res.title = res.title.trim();
              res.snippet = cleanSnippet(res.snippet);
          });

          if (results.length === 0) {
            throw new Error('No organic results found. The page may be blocked, a CAPTCHA, or have a different structure.');
          }
          
          // --- Timing and Logging ---
          const endTime = Date.now();
          const duration = endTime - startTime;
          const fetchTime = new Date(endTime).toUTCString();
          
          console.log(`Success on attempt ${attempt}. Found ${results.length} results.`);
          console.log(`Results fetched at: ${fetchTime}`);
          console.log(`Total fetch duration: ${duration}ms`);

          const statusInfo = {
            url: urlToFetch,
            status: originResponse.status,
            contentType: originResponse.headers.get('Content-Type'),
            cache: 'MISS',
            duration: `${duration}ms`,
            fetchTime: fetchTime
          };

          const jsonPayload = {
              results,
              related_searches: [...new Set(related_searches)], // Remove duplicates
              status: statusInfo
          };
          const jsonString = JSON.stringify(jsonPayload, null, 2);

          const clientResponse = new Response(jsonString, {
              headers: {
                  ...corsHeaders,
                  'X-Cache-Status': 'MISS',
                  // Reduced cache time for fresher results
                  'Cache-Control': 'public, max-age=600'
              }
          });
          
          ctx.waitUntil(cache.put(urlToFetch, clientResponse.clone()));
          return clientResponse;

        } catch (error) {
          lastError = error;
          console.error(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt < maxRetries) {
            // Faster, more aggressive backoff
            const backoffTime = Math.pow(2, attempt) * 250; // 500ms, 1s
            console.log(`Waiting around ${backoffTime}ms before next retry...`);
            await delay(backoffTime);
          } else {
            // If all retries fail, throw the last captured error
            throw new Error(`All ${maxRetries} attempts failed. Last error: ${lastError.message}`);
          }
        }
      }
    } catch (error) {
      console.error("Worker failed after all retries:", error.stack);
      const errorPayload = { error: error.message, success: false };
      return new Response(JSON.stringify(errorPayload, null, 2), {
        status: 500,
        headers: corsHeaders, // Apply CORS headers even for error responses
      });
    }
  },
};