import { selectAgents } from './agent_selector.js';
import agent1SystemPrompt from './agent1_prompt.js';
import agent2SystemPrompt from './agent2_prompt.js'; // New import for Agent 2 prompt
import agent3SystemPrompt from './agent3_prompt.js';
import { fetchWheatData } from '../tools/wheat_tool.js'; // Import the new Wheat tool
import { safeParse } from '/js/json_utils.js';
import { scrapeWebsite } from '../tools/scraper_tool.js';

// Validate API configuration
async function executeTool(toolName, query, params = {}, userQuery, userName, userLocalTime) {
  console.log(`Executing tool: ${toolName} with query: ${query} and params:`, params);

  let api_target;
  let api_payload;

  switch (toolName) {
    case 'serper_web_search':
      api_target = 'serper';
      api_payload = { type: 'search', body: { q: query } };
      break;
    case 'serper_news_search':
      api_target = 'serper';
      api_payload = { type: 'news', body: { q: query } };
      break;
    case 'coingecko':
      api_target = 'coingecko';
      api_payload = { params: { ids: query, vs_currencies: 'usd' } };
      break;
    case 'wheat':
      // This tool appears to be a local function, not a worker API call.
      // It needs to be handled differently or proxied if it requires external access.
      // For now, assuming it's a local function.
      console.log(`Calling fetchWheatData for location: ${query}`);
      return { data: await fetchWheatData(query), sourceUrl: 'https://open-meteo.com/en/docs' };
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }

  // All API calls now go through the worker proxy
  const response = await fetchWithProxy(api_target, api_payload, userQuery, userName, userLocalTime);
  
  // Process the response based on the tool that was called
  switch (toolName) {
    case 'serper_web_search':
    case 'serper_news_search':
      // Serper's results are in the `results` property of the response
      return { results: response.results || [response] };
    case 'coingecko':
      // CoinGecko's response is the data itself
      return { data: [response] };
    default:
      // For any other tools, return the response as is
      return response;
  }
}

// Helper function to proxy requests through the Cloudflare Worker
async function fetchWithProxy(api_target, api_payload, query, userName, userLocalTime) {
  const idToken = localStorage.getItem('id_token');
  if (!idToken) {
    throw new Error('Authentication token not found. Please sign in.');
  }

  const WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';
  const response = await fetch(`${WORKER_BASE_URL}api/query-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      user_name: userName,
      user_local_time: userLocalTime,
      api_target,
      api_payload,
      id_token: idToken,
      user_email: localStorage.getItem('user_email'), // Include for verification
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return response; // Pass the 429 response back to the caller
    }
    let errorData;
    let errorMessage = `API proxy error: ${response.status}`;
    try {
        errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
    } catch (e) {
        // If response is not JSON, try to get it as text
        const responseText = await response.text();
        errorMessage = `API proxy error: ${response.status} - ${responseText}`;
    }
    throw new Error(errorMessage);
  }

  // For streaming responses (like Mistral), return the response object directly
  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
    return response;
  }

  // For non-streaming responses, parse and return the JSON
  return response.json();
}

export async function callAgent(model, prompt, input, retryCount = 0, streamCallback = null, query, userName, userLocalTime) {
    console.log(`Calling agent with model: ${model}, input:`, input);

    let messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }
    ];

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Request timeout: API took too long to respond (30 seconds)'));
        }, 30000);
    });

    try {
        const api_payload = {
            body: { model, messages, temperature: 0.5, max_tokens: 6000, stream: true }
        };

        const fetchPromise = fetchWithProxy('mistral', api_payload, query, userName, userLocalTime);
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            if (response.status === 429) throw response;
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`API error: ${response.status} - ${errorData.message}`);
        }

        if (!response.body) throw new Error('Empty response body from API');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let contentBuffer = '';
        let done = false;

        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            const chunk = decoder.decode(value, { stream: !done });
            
            // Split chunk by newline in case multiple data events are in one chunk
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        done = true;
                        break;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.choices && data.choices[0] && data.choices[0].delta) {
                            const deltaContent = data.choices[0].delta.content;
                            if (deltaContent) {
                                if (streamCallback) {
                                    streamCallback(deltaContent); // Stream content for Agent 3
                                } else {
                                    contentBuffer += deltaContent; // Buffer content for Agents 1 and 2
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Skipping non-JSON data in stream:", jsonStr);
                    }
                }
            }
        }
        
        if (streamCallback) return null; // For streaming agents, content is handled by callback

        if (!contentBuffer.trim()) throw new Error('No content received from API');
        
        console.log("callAgent returning buffered content:", contentBuffer.substring(0, 150) + '...');
        return contentBuffer;

    } catch (error) {
        if (error instanceof Response && error.status === 429) throw error;
        console.error(`Error calling agent: ${error.message}`);
        throw new Error(`Error calling agent: ${error.message}`);
    }
}

// Extracts and parses a JSON object from a string, without attempting to fix it.
function sanitizeAndParseJson(jsonString) {
    console.log("Attempting to extract and parse JSON from string...");

    // Find the first '{' and the last '}' to extract the JSON object
    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("Could not find a valid JSON object in the response.");
    }

    const potentialJson = jsonString.substring(startIndex, endIndex + 1);

    try {
        // We trust the agent to provide valid JSON. If it fails, the retry logic will handle it.
        return JSON.parse(potentialJson);
    } catch (error) {
        console.error("JSON parsing failed after extraction.", error);
        console.error("Extracted JSON string:", potentialJson);
        // Re-throw the error to be caught by the orchestration logic
        throw new Error(`Failed to parse extracted JSON: ${error.message}`);
    }
}

// Validate Agent 1 JSON response structure
function validateAgent1Response(response) {
  const errors = [];
  
  // Required fields
  if (!response.classification) errors.push("Missing 'classification' field");
  
  const validClassifications = ['tool_web_search', 'math', 'code', 'conversational', 'direct', 'hybrid', 'unclear'];
  if (response.classification && !validClassifications.includes(response.classification)) {
    errors.push(`Invalid classification: ${response.classification}. Must be one of: ${validClassifications.join(', ')}`);
  }

  // Action field validation based on classification
  if (['tool_web_search', 'hybrid'].includes(response.classification)) {
    if (!response.action) {
      errors.push("Missing 'action' field for tool_web_search/hybrid classification");
    } else if (response.action !== 'search') {
      errors.push(`Invalid action: ${response.action}. Must be 'search' for tool_web_search/hybrid classification.`);
    }
  } else if (response.classification === 'direct') {
    if (!response.action) {
      errors.push("Missing 'action' field for 'direct' classification");
    } else if (response.action !== 'process_direct') {
      errors.push(`Invalid action: ${response.action}. Must be 'process_direct' for 'direct' classification.`);
    }
  }

  // Field-specific validation
  if (response.classification === 'tool_web_search' && !response.search_plan) {
    errors.push("Missing 'search_plan' field when classification is 'tool_web_search'");
  }

  if (response.classification === 'hybrid') {
    if (!response.search_plan && !response.direct_component) {
      errors.push("For 'hybrid' classification, either 'search_plan' or 'direct_component' must be present.");
    }
  }

  if (['conversational', 'math', 'code', 'direct', 'unclear'].includes(response.classification) && !response.response) {
    errors.push("Missing 'response' field for direct response classifications");
  }
  
  return errors;
}

export async function orchestrateAgents(userQuery, userName, userLocalTime, agentSelectionType, streamCallback = null, logCallback = null, isShortResponseEnabled = false) {
    console.log(`Starting orchestration for query: "${userQuery}"`);
    const agentConfig = selectAgents(agentSelectionType);
    const { agent1: agent1Config, agent3: agent3Config } = agentConfig;

    // --- Agent 1: Search Planner ---
    let parsedAgent1Response;
    try {
        logCallback("Thinking...");
        const agent1Input = { query: userQuery };
        const agent1ResponseRaw = await callAgent(agent1Config.model, agent1SystemPrompt, agent1Input, 0, null, userQuery, userName, userLocalTime);
        parsedAgent1Response = sanitizeAndParseJson(agent1ResponseRaw);
        const validationErrors = validateAgent1Response(parsedAgent1Response);
        if (validationErrors.length > 0) throw new Error(`Agent 1 validation failed: ${validationErrors.join(', ')}`);
        console.log("✓ Agent 1: Plan validated", parsedAgent1Response);
    } catch (error) {
        console.error("Error in Agent 1 phase:", error);
        return `Error during planning phase: ${error.message}`;
    }

    const { classification, search_plan, response: directResponse, direct_component } = parsedAgent1Response;

    // --- Direct Answer Path ---
    if (['direct', 'conversational', 'math', 'code', 'unclear'].includes(classification)) {
        logCallback("Generating answer...");
        const agent3Input = { rawQuery: userQuery, query: directResponse || userQuery, classification, isShortResponseEnabled };
        return await callAgent(agent3Config.model, agent3SystemPrompt(isShortResponseEnabled), agent3Input, 0, streamCallback, userQuery, userName, userLocalTime);
    }

    // --- Search & Scrape Path ---
    let webSearchResults = [];
    let otherToolResults = [];
    if (classification === 'tool_web_search' || classification === 'hybrid') {
        if (!search_plan || search_plan.length === 0) {
            if (classification === 'hybrid' && direct_component) {
                // This is acceptable, proceed to Agent 3 with only direct component
            } else {
                 return "Search was required, but no search plan was provided.";
            }
        }
        
        // --- Tool Execution ---
        try {
            const searchPromises = (search_plan || []).map(step => {
                logCallback(`<i class="fas fa-search"></i> Searching for: "<b>${step.query}</b>"`);
                return executeTool(step.tool, step.query, step.params, userQuery, userName, userLocalTime);
            });
            const toolPromiseResults = await Promise.all(searchPromises);
            toolPromiseResults.forEach(result => {
                if (result.results) webSearchResults.push(...result.results);
                if (result.data) otherToolResults.push(...result.data);
            });
            console.log("✓ Tools executed:", { webSearchResults, otherToolResults });
        } catch (error) {
            console.error("Error in Tool Execution phase:", error);
            return `Error during tool execution: ${error.message}`;
        }

        // --- Agent 2: Scraper ---
        let scrapedData = [];
        if (webSearchResults.length > 0) {
            try {
                logCallback("Analyzing results...");
                const agent2Model = 'mistral-small-latest'; // Explicitly define Agent 2 model
                const agent2Input = { query: userQuery, serper_results: webSearchResults };
                const agent2ResponseRaw = await callAgent(agent2Model, agent2SystemPrompt, agent2Input, 0, null, userQuery, userName, userLocalTime);
                const parsedAgent2Response = sanitizeAndParseJson(agent2ResponseRaw);
                console.log("✓ Agent 2: Decision made", parsedAgent2Response);

                if (parsedAgent2Response.action === 'scrape' && parsedAgent2Response.scrape_plan) {
                    const scrapePromises = parsedAgent2Response.scrape_plan.map(scrapeStep => {
                        logCallback(`<i class="fas fa-spider"></i> Scraping ${scrapeStep.url}`);
                        return scrapeWebsite(scrapeStep.url, scrapeStep.keywords, logCallback);
                    });
                    scrapedData = await Promise.all(scrapePromises);
                    console.log("✓ Scraping complete:", scrapedData);
                }
            } catch (error) {
                console.error("Error in Agent 2 phase:", error);
                // Non-fatal, we can proceed without scraped data
            }
        }
        
        // --- Agent 3: Final Response ---
        logCallback("Generating answer...");
        const sourceUrls = [...new Set(webSearchResults.map(r => r.link))];
        const agent3Input = {
            rawQuery: userQuery,
            webSearchResults,
            otherToolResults,
            scrapedData,
            directComponent: direct_component,
            sourceUrls,
            isShortResponseEnabled
        };
        return await callAgent(agent3Config.model, agent3SystemPrompt(isShortResponseEnabled), agent3Input, 0, streamCallback, userQuery, userName, userLocalTime);
    }

    return "Could not determine an appropriate action based on the query.";
}