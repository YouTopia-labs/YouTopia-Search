import { selectAgents } from './agent_selector.js';
import agent1SystemPrompt from './agent1_prompt.js';
import agent2SystemPrompt from './agent2_prompt.js'; // New import for Agent 2 prompt
import agent3SystemPrompt from './agent3_prompt.js';
import { fetchWheatData } from '../tools/wheat_tool.js'; // Import the new Wheat tool
import { scrapeWebsite } from '../tools/scraper_tool.js'; // Import the new scraper tool
import { safeParse } from '../js/json_utils.js';

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
  const maxRetries = 2;

  if (streamCallback) {
    console.log("Streaming enabled.");
  }

  let messages = [
    { role: 'system', content: prompt }
  ];


  if (input) {
    const userInputContent = typeof input === 'string' ? input : JSON.stringify(input);
    messages.push({ role: 'user', content: userInputContent });
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Request timeout: Mistral API took too long to respond (30 seconds)'));
    }, 30000);
  });

  try {
    const api_payload = {
      body: {
        model: model,
        messages: messages,
        temperature: 0.5,
        max_tokens: 6000,
        stream: true
      }
    };

    const fetchPromise = fetchWithProxy('mistral', api_payload, query, userName, userLocalTime);
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
        if (response.status === 429) {
            throw response; // Throw the 429 Response object so main.js can catch it
        }
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: await response.text() };
      }
      throw new Error(`Mistral API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    // Check if response body exists
    if (!response.body) {
      throw new Error('Empty response body from Mistral API');
    }

    let content = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last partial line in the buffer

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') {
                    break;
                }
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                        const chunk = parsed.choices[0].delta.content;
                        content += chunk;
                        if (streamCallback) {
                            streamCallback(chunk);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing stream chunk:', e);
                }
            }
        }
    }

    // Check if we got any content
    if (!content.trim()) {
      throw new Error('No content received from Mistral API');
    }

    // For Agent 1, validate JSON format before returning
    // If Agent 3 and streaming, skip JSON validation here as partials won't be valid
    // Validation and retry logic has been moved to orchestrateAgents
    
    // If Agent 3 and streaming, the final response is sent via callback, so return null here.
    if (streamCallback) {
        console.log("Streaming: callAgent returning null as content is streamed via callback.");
        return null;
    }

    console.log("callAgent returning content:", content.substring(0, 100) + (content.length > 100 ? '...' : '')); // Log first 100 chars
    return content;

  } catch (error) {
    // Check if the thrown error is the 429 Response object. If so, re-throw it for main.js to handle.
    if (error instanceof Response && error.status === 429) {
        throw error;
    }

    let errorMessage = `Error calling Mistral API: ${error.message}`;
    if (error instanceof TypeError && error.message === 'Load failed') {
        errorMessage = `Network Error: Could not connect to Mistral API or the request was aborted. Details: ${error.message}`;
    } else if (error.response && error.response.status) {
        errorMessage = `Mistral API returned status ${error.response.status}. Details: ${error.message}`;
    }
    console.error(errorMessage);
    throw new Error(errorMessage); // Re-throw with more specific message
  }
}

// Sanitize and parse JSON, attempting to fix common errors.
function sanitizeAndParseJson(jsonString) {
    console.log("Attempting to parse JSON...");
    
    // Find the first '{' and the last '}' to extract the JSON object
    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("Could not find a valid JSON object in the response.");
    }
    
    let potentialJson = jsonString.substring(startIndex, endIndex + 1);
    
    // First attempt: try parsing as-is
    try {
        return JSON.parse(potentialJson);
    } catch (initialError) {
        console.log("Initial JSON parse failed, attempting to fix common issues...");
        
        // Apply multiple sanitization strategies
        let fixedJson = potentialJson;
        
        // Strategy 1: Fix common property name issues
        // Fix incomplete property names like "ification", -> "classification":
        fixedJson = fixedJson.replace(/"\s*ification\s*",?\s*/g, '"classification":');
        
        // Fix missing colons after property names
        fixedJson = fixedJson.replace(/"\s*([^"]+)\s*"\s*,?\s*([^:])/g, '"$1": $2');
        
        // Strategy 2: Fix missing quotes around property names
        // This regex finds unquoted property names and adds quotes
        fixedJson = fixedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        // Strategy 3: Fix trailing commas in objects and arrays
        fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
        
        // Strategy 4: Fix missing commas between properties
        fixedJson = fixedJson.replace(/"\s*\n\s*"/g, '",\n"');
        fixedJson = fixedJson.replace(/}\s*\n\s*{/g, '},\n{');
        
        // Strategy 5: Fix incomplete strings and missing quotes
        // Fix cases where quotes are missing around string values
        fixedJson = fixedJson.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_\s]*)\s*([,}])/g, ': "$1"$2');
        
        // Strategy 6: Fix malformed arrays
        fixedJson = fixedJson.replace(/\[\s*([^[\]]*)\s*\]/g, (match, content) => {
            if (!content.trim()) return '[]';
            // Ensure array elements are properly quoted if they're strings
            const elements = content.split(',').map(el => {
                el = el.trim();
                if (el && !el.startsWith('"') && !el.startsWith('{') && !el.match(/^\d+$/)) {
                    return `"${el}"`;
                }
                return el;
            });
            return `[${elements.join(', ')}]`;
        });
        
        // Strategy 7: Ensure proper JSON structure
        // Remove any text before the first { or after the last }
        const cleanStart = fixedJson.indexOf('{');
        const cleanEnd = fixedJson.lastIndexOf('}');
        if (cleanStart !== -1 && cleanEnd !== -1) {
            fixedJson = fixedJson.substring(cleanStart, cleanEnd + 1);
        }
        
        // Try parsing the fixed JSON
        try {
            console.log("Attempting to parse sanitized JSON...");
            return JSON.parse(fixedJson);
        } catch (secondError) {
            console.error("JSON parsing failed even after sanitization.", secondError);
            console.error("Original JSON:", potentialJson);
            console.error("Fixed JSON:", fixedJson);
            
            // Last resort: try to construct a minimal valid response
            try {
                // Extract key information manually for critical fields
                const classificationMatch = potentialJson.match(/"?classification"?\s*:\s*"?([^",}]+)"?/i);
                const actionMatch = potentialJson.match(/"?action"?\s*:\s*"?([^",}]+)"?/i);
                
                if (classificationMatch) {
                    const classification = classificationMatch[1].trim();
                    const fallbackResponse = {
                        classification: classification,
                        action: actionMatch ? actionMatch[1].trim() : 'search',
                        search_plan: []
                    };
                    
                    console.log("Created fallback response:", fallbackResponse);
                    return fallbackResponse;
                }
            } catch (fallbackError) {
                console.error("Fallback parsing also failed:", fallbackError);
            }
            
            // Throw a new error with a clear message, including the problematic string
            throw new Error(`Failed to parse JSON: ${secondError.message}. Original content: ${potentialJson}`);
        }
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
  console.log(`Starting orchestration for query: "${userQuery}" with selection: "${agentSelectionType}", short responses: ${isShortResponseEnabled}`);

  // Validate API configuration before proceeding

  const agentConfig = selectAgents(agentSelectionType);
  const agent1Model = agentConfig.agent1.model;
  const agent2Model = 'mistral-small-latest'; // Define Agent 2 model
  const agent3Model = agentConfig.agent3.model;

  let allSearchResults = [];
  let totalSearchesPerformed = 0;
  let totalScrapedSites = 0;

  const MAX_TOTAL_SEARCHES = 12; // Total individual search steps (web_search, coingecko, wheat)
  const MAX_TOTAL_SCRAPES = 16; // Total individual sites scraped
  const MAX_PARALLEL_SCRAPES_PER_TURN = 8; // Max sites scraped in one 'scrape' action

  // Loop for orchestration turns
  while (true) {
    console.log(`--- Orchestration Loop: Turn (Searches: ${totalSearchesPerformed}/${MAX_TOTAL_SEARCHES}) ---`);

    // Prepare input for Agent 1
    const agent1Input = {
      query: userQuery,
    };

    console.log("Agent 1: Deciding next action...");

    let agent1ResponseRaw;
    let parsedAgent1Response;
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`Agent 1: Attempt ${attempt} to get a valid JSON response.`);
      
      let currentPrompt = agent1SystemPrompt;
      let currentInput = agent1Input;

      if (attempt > 1 && agent1ResponseRaw) {
        // If this is a retry, modify the prompt to ask for a fix
        console.log("Retrying with a request to fix the malformed JSON.");
        currentPrompt = `${agent1SystemPrompt}\n\nYour previous response was not valid JSON and could not be parsed. Please review the following error and the malformed response, then provide a corrected and valid JSON object. Do not include any text or markdown formatting outside of the JSON object.\n\nMalformed Response:\n${agent1ResponseRaw}`;
      }

      agent1ResponseRaw = await callAgent(agent1Model, currentPrompt, currentInput, 0, null, userQuery, userName, userLocalTime);

    if (agent1ResponseRaw instanceof Response && !agent1ResponseRaw.ok) {
        if (agent1ResponseRaw.status === 429) {
            // Re-throw the 429 Response object so main.js can handle the popup
            throw agent1ResponseRaw;
        }
        const errorText = await agent1ResponseRaw.text();
        return `Error: Agent 1 failed with status ${agent1ResponseRaw.status}. ${errorText}`;
    }

      try {
        parsedAgent1Response = safeParse(agent1ResponseRaw, true);
        // If parsing is successful, break the loop
        break;
      } catch (error) {
        console.error(`[Error] Agent 1 response parsing failed on attempt ${attempt}:`, error.message);
        console.error("Raw response:", agent1ResponseRaw);
        if (attempt >= maxAttempts) {
          return `Error: Agent 1 failed to return a valid JSON response after ${maxAttempts} attempts. Last error: ${error.message}`;
        }
      }
    }

    try {
      const validationErrors = validateAgent1Response(parsedAgent1Response);
      if (validationErrors.length > 0) {
        console.error("[Error] Agent 1 response validation failed:");
        validationErrors.forEach(error => console.error(`  - ${error}`));
        console.error("Response:", JSON.stringify(parsedAgent1Response, null, 2));
        return `Error: Agent 1 response validation failed: ${validationErrors.join('; ')}`;
      }
      console.log("✓ Agent 1 response validation passed");
    } catch (error) {
        console.error("[Error] Agent 1 response validation failed unexpectedly:", error.message);
        return `Error: Agent 1 response validation failed: ${error.message}`;
    }

    console.log("Agent 1 Parsed Response:", parsedAgent1Response);

    const { classification, action, search_plan, response: agent1DirectResponse, direct_component } = parsedAgent1Response;

    // Handle direct classifications (conversational, math, code, unclear, direct)
    if (classification && (classification === 'conversational' || classification === 'math' || classification === 'code' || classification === 'unclear' || classification === 'direct')) {
      console.log(`${classification} query detected. Passing direct response to Agent 3.`);
      const queryForAgent3 = (classification === 'direct') ? userQuery : agent1DirectResponse;
      
      // For direct classifications, we do not want the end-of-answer delimiter.
      // We can achieve this by modifying the system prompt for this specific call.
      const directAgent3SystemPrompt = agent3SystemPrompt(isShortResponseEnabled).replace('---END_OF_ANSWER---', '');

      const finalResponse = await callAgent(agent3Model, directAgent3SystemPrompt, { rawQuery: userQuery, query: queryForAgent3, classification: classification, isShortResponseEnabled: isShortResponseEnabled }, 0, streamCallback, userQuery, userName, userLocalTime);
      
      console.log("Final Response Generated by Agent 3. Value from callAgent:", finalResponse);
      if (streamCallback) {
        console.log("Stream callback was active, returning from orchestrateAgents.");
        return;
      } else {
        return finalResponse;
      }
    }

    // Handle 'search' action for tool_web_search and hybrid classifications
    if (action === 'search') {
      const numSearchesInPlan = search_plan ? search_plan.length : 0;
      if (numSearchesInPlan > 0 && totalSearchesPerformed + numSearchesInPlan > MAX_TOTAL_SEARCHES) {
        console.log(`Exceeded max search steps (${MAX_TOTAL_SEARCHES}). Cannot perform these searches.`);
        return "Could not find sufficient information to answer your query after maximum searches.";
      }

      let webSearchResults = [];
      let otherToolResults = [];
      let scrapedData = [];

      if (search_plan && search_plan.length > 0) {
        console.log(`Executing search plan (${search_plan.length} steps) in parallel...`);

        const toolNamesMap = {
          'serper_web_search': 'Web Search',
          'serper_news_search': 'News Search',
          'coingecko': 'Crypto',
          'wheat': 'Open-Meteo'
        };

        const searchPromises = search_plan.map(async (step) => {
          if (logCallback) {
            const toolDisplayName = toolNamesMap[step.tool] || step.tool;
            logCallback(`<i class="fas fa-tools"></i> Looking up ${toolDisplayName} for: "<b>${step.query}</b>"`);
          }
          if (step.tool === 'serper_web_search') {
            const result = await executeTool(step.tool, step.query, step.params, userQuery, userName, userLocalTime);
            return { type: 'web_search', data: result.results };
          } else if (step.tool === 'coingecko' || step.tool === 'wheat') {
            const result = await executeTool(step.tool, step.query, step.params, userQuery, userName, userLocalTime);
            return { type: 'other_tool', data: result.data, sourceUrl: result.sourceUrl };
          } else {
            throw new Error(`Unhandled tool in search_plan: ${step.tool}`);
          }
        });

        const results = await Promise.all(searchPromises);

        results.forEach(res => {
          if (res.type === 'web_search') {
            webSearchResults.push(...res.data);
          } else if (res.type === 'other_tool') {
            otherToolResults.push(res.data);
            if (res.sourceUrl) {
                allSourceUrls.push(res.sourceUrl); // Add specific tool source URL
            }
          }
        });

        console.log("Raw web search results:", webSearchResults);
        console.log("Raw other tool results:", otherToolResults);

        // --- New Agent 2 Workflow ---
        if (webSearchResults.length > 0) {
          console.log("Agent 2: Analyzing search results to decide on scraping...");
          if (logCallback) logCallback(`<i class="fas fa-filter"></i> Agent 2: Analyzing search results...`);

          const agent2Input = {
            query: userQuery,
            serper_results: webSearchResults.map(r => ({ title: r.title, link: r.link, snippet: r.snippet }))
          };

          const agent2ResponseRaw = await callAgent(agent2Model, agent2SystemPrompt, agent2Input, 0, null, userQuery, userName, userLocalTime);
          const agent2Response = safeParse(agent2ResponseRaw, true);

          console.log("Agent 2 Response:", agent2Response);

          if (agent2Response.action === 'scrape' && agent2Response.scrape_plan && agent2Response.scrape_plan.length >= 2) {
            const planToExecute = agent2Response.scrape_plan.slice(0, MAX_PARALLEL_SCRAPES_PER_TURN);
            if (logCallback) logCallback(`<i class="fas fa-spider"></i> Agent 2: Decided to scrape ${planToExecute.length} sites...`);
            
            const scrapePromises = planToExecute.map(plan =>
              scrapeWebsite(plan.url, plan.keywords, logCallback)
            );
            scrapedData = (await Promise.all(scrapePromises)).filter(d => d.success);
            console.log("Scraped Data:", scrapedData);
          } else {
            if (logCallback) logCallback(`<i class="fas fa-check-circle"></i> Agent 2: Decided to continue without scraping.`);
          }
        }

        totalSearchesPerformed += numSearchesInPlan;
      } else {
        console.log("Agent 1 requested search but provided an empty search_plan.");
        if (classification !== 'hybrid' || !direct_component) {
          return "Agent 1 provided an empty search plan without a direct component. Could not proceed.";
        }
      }

      // Combine all results for Agent 3
      const allSourceUrlsFromSearches = [
        ...webSearchResults.map(result => result.link),
        ...scrapedData.map(data => data.url)
      ].filter(Boolean);
      
      const finalSourceUrls = [...new Set([...allSourceUrls, ...allSourceUrlsFromSearches])];

      const dataForAgent3 = {
        webSearchResults: webSearchResults,
        otherToolResults: otherToolResults,
        scrapedData: scrapedData,
        rawQuery: userQuery,
        classification: classification,
        directComponent: direct_component,
        sourceUrls: finalSourceUrls
      };

      console.log("Sending combined data to Agent 3:", dataForAgent3);
      const finalResponse = await callAgent(agent3Model, agent3SystemPrompt(isShortResponseEnabled), { ...dataForAgent3, isShortResponseEnabled: isShortResponseEnabled }, 0, streamCallback, userQuery, userName, userLocalTime);

      return finalResponse; // Return the final response from Agent 3
    }

    // If Agent 1 returned a classification that doesn't trigger a 'search' action
    // and it's not a direct classification handled above, then it's an unhandled action.
    console.log(`Agent 1 returned an unhandled action or classification: ${action || classification}.`);
    return "An unexpected error occurred during orchestration.";
  }
}