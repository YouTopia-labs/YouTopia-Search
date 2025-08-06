import { selectAgents } from './agent_selector.js';
import agent1SystemPrompt from './agent1_prompt.js';
import agent2SystemPrompt from './agent2_prompt.js'; // New import for Agent 2 prompt
import agent3SystemPrompt from './agent3_prompt.js';
import { fetchWheatData } from '../tools/wheat_tool.js'; // Import the new Wheat tool
import { wikiEye } from '../tools/wiki_eye.js'; // Import the new wiki_eye tool

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
  return response;
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
    const errorData = await response.json();
    throw new Error(errorData.error || `API proxy error: ${response.status}`);
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

  if (streamCallback && prompt.includes('Agent 3:')) {
    console.log("Agent 3 streaming enabled.");
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
            return response; // Pass the 429 response back to the caller
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
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (!value) {
          console.warn('Received empty chunk from stream');
          continue;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        
        if (!chunk.trim()) {
          continue; // Skip empty chunks
        }
        
        // Each chunk might contain multiple JSON objects or partial objects
        const lines = chunk.split('\n');
        let buffer = ''; // Buffer to accumulate partial JSON
        for (const line of lines) {
            if (line.startsWith('data:')) {
                const jsonStr = line.substring(5).trim();
                if (jsonStr === '[DONE]') {
                    break; // End of stream
                }
                if (!jsonStr.trim()) { // Check for empty or whitespace-only string
                    console.warn('Skipping empty or whitespace-only data: line in stream.');
                    continue; // Skip to the next line
                }

                buffer += jsonStr; // Add to buffer

                try {
                    const data = JSON.parse(buffer); // Try parsing the accumulated buffer
                    if (data.choices && data.choices.length > 0) {
                        const delta = data.choices[0].delta;
                        if (delta && delta.content) {
                            content += delta.content;
                            // If Agent 3 and streamCallback is provided, send the content immediately
                            if (streamCallback && prompt.includes('Agent 3:')) {
                                streamCallback(delta.content);
                            }
                        }
                    }
                    buffer = ''; // Clear buffer on successful parse
                } catch (e) {
                    // JSON parse error: could be incomplete JSON, continue buffering
                    // console.warn("Incomplete JSON chunk, buffering:", buffer, "Error:", e);
                }
            }
        }
      }
    } catch (streamError) {
      console.error('Error reading stream:', streamError);
      throw new Error(`Stream reading error: ${streamError.message}`);
    }

    // Check if we got any content
    if (!content.trim()) {
      throw new Error('No content received from Mistral API');
    }

    // For Agent 1, validate JSON format before returning
    // If Agent 3 and streaming, skip JSON validation here as partials won't be valid
    // Validation and retry logic has been moved to orchestrateAgents
    
    // If Agent 3 and streaming, the final response is sent via callback, so return null here.
    if (streamCallback && prompt.includes('Agent 3:')) {
        console.log("Agent 3 streaming: callAgent returning null as content is streamed via callback.");
        return null;
    }

    console.log("callAgent returning content:", content.substring(0, 100) + (content.length > 100 ? '...' : '')); // Log first 100 chars
    return content;

  } catch (error) {
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

// Validate Agent 1 JSON response structure
function validateAgent1Response(response) {
  const errors = [];
  
  // Required fields
  if (!response.classification) errors.push("Missing 'classification' field");
  // Reasoning field is no longer mandatory for Agent 1.
  // if (!response.reasoning) errors.push("Missing 'reasoning' field");
  
// Valid classification values
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
  } else if (response.action !== 'direct') {
    errors.push(`Invalid action: ${response.action}. Must be 'direct' for 'direct' classification.`);
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

// For direct response classifications, 'response' field is required.
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
  const agent2Model = 'mistral-3b-latest'; // Define Agent 2 model
  const agent3Model = agentConfig.agent3.model;

  let allSearchResults = [];
  let totalSearchesPerformed = 0;
  let totalScrapedSites = 0;

  const MAX_TOTAL_SEARCHES = 12; // Total individual search steps (web_search, coingecko, wheat)
  const MAX_TOTAL_SCRAPES = 12; // Total individual sites scraped
  const MAX_PARALLEL_SCRAPES_PER_TURN = 4; // Max sites scraped in one 'scrape' action

  // Loop for orchestration turns
  while (true) {
    console.log(`--- Orchestration Loop: Turn (Searches: ${totalSearchesPerformed}/${MAX_TOTAL_SEARCHES}) ---`);

    // Prepare input for Agent 1
    const agent1Input = {
      query: userQuery,
    };

    console.log("Agent 1: Deciding next action...");

    const agent1ResponseRaw = await callAgent(agent1Model, agent1SystemPrompt, agent1Input, 0, null, userQuery, userName, userLocalTime);

    if (agent1ResponseRaw instanceof Response && !agent1ResponseRaw.ok) {
        if (agent1ResponseRaw.status === 429) {
            const errorData = await agent1ResponseRaw.json();
            console.error("Query limit exceeded:", errorData.error);
            return `Error: ${errorData.error} ${errorData.message_from_developer || ''}`;
        }
        const errorText = await agent1ResponseRaw.text();
        return `Error: Agent 1 failed with status ${agent1ResponseRaw.status}. ${errorText}`;
    }

    let parsedAgent1Response;
    try {
        // Clean the response to remove markdown fences before parsing
        const cleanedResponse = agent1ResponseRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedAgent1Response = JSON.parse(cleanedResponse);
    } catch (error) {
        console.error("[Error] Agent 1 response parsing failed:", error.message);
        console.error("Raw response:", agent1ResponseRaw);
        return `Error: Agent 1 returned an invalid JSON response. Error: ${error.message}`;
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
      // For 'direct' classification, pass the original userQuery as the query to Agent 3
      // For other direct classifications, Agent 1's response field already contains the relevant part.
      const queryForAgent3 = (classification === 'direct' || classification === 'conversational') ? userQuery : agent1DirectResponse;
      const finalResponse = await callAgent(agent3Model, agent3SystemPrompt, { rawQuery: userQuery, query: queryForAgent3, classification: classification, isShortResponseEnabled: isShortResponseEnabled }, 0, streamCallback, userQuery, userName, userLocalTime);
      console.log("Final Response Generated by Agent 3. Value from callAgent:", finalResponse);
      // If streaming, callAgent returns null, so we return early
      if (streamCallback) {
        console.log("Stream callback was active, returning early from orchestrateAgents.");
        // No return here, allow the function to complete normally.
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
      let processedWikiData = [];

      if (search_plan && search_plan.length > 0) {
        console.log(`Executing search plan (${search_plan.length} steps) in parallel...`);

        const toolNamesMap = {
          'serper_web_search': 'Web Search',
          'serper_news_search': 'News Search',
          'coingecko': 'Crypto',
          'wheat': 'Open-Meteo',
          'wiki_eye': 'Wikipedia Scraper'
        };

        // Initialize allSourceUrls array before it's used in the forEach loop
        const allSourceUrls = [];

        const searchPromises = search_plan.map(async (step) => {
          if (logCallback) {
            const toolDisplayName = toolNamesMap[step.tool] || step.tool;
            logCallback(`<i class="fas fa-tools"></i> Looking up ${toolDisplayName} for: "<b>${step.query}</b>"`);
          }
          if (step.tool === 'serper_web_search') {
            const result = await executeTool(step.tool, step.query, step.params, userQuery, userName, userLocalTime);
            return { type: 'web_search', data: result.results || [result] };
          } else if (step.tool === 'coingecko' || step.tool === 'wheat') {
            const result = await executeTool(step.tool, step.query, step.params, userQuery, userName, userLocalTime);
            // Ensure result.data is an array for consistency
            const otherToolData = Array.isArray(result.data) ? result.data : [result.data];
            return { type: 'other_tool', data: otherToolData, sourceUrl: result.sourceUrl };
          } else {
            throw new Error(`Unhandled tool in search_plan: ${step.tool}`);
          }
        });

        const results = await Promise.all(searchPromises);

        results.forEach(res => {
          if (res.type === 'web_search') {
            webSearchResults.push(...res.data);
          } else if (res.type === 'other_tool') {
            otherToolResults.push(...res.data);
            if (res.sourceUrl) {
                allSourceUrls.push(res.sourceUrl); // Add specific tool source URL
            }
          }
        });

        console.log("Raw web search results:", webSearchResults);
        console.log("Raw other tool results:", otherToolResults);

        // Filter web search results for Wikipedia links and pass to wikiEye
        const wikipediaLinksInWebResults = webSearchResults.filter(result =>
          result.link && result.link.includes('wikipedia.org/wiki/')
        );

        if (wikipediaLinksInWebResults.length > 0) {
          console.log("Passing Wikipedia links to wikiEye for processing by Agent 2.");
          processedWikiData = await wikiEye(wikipediaLinksInWebResults, userQuery, logCallback);
          console.log("Processed Wikipedia data from Agent 2:", processedWikiData);
        }

        totalSearchesPerformed += numSearchesInPlan;
      } else {
        console.log("Agent 1 requested search but provided an empty search_plan.");
        // If it's a hybrid query with only a direct component, this is fine.
        if (classification !== 'hybrid' || !direct_component) {
          return "Agent 1 provided an empty search plan without a direct component. Could not proceed.";
        }
      }

      // Combine all results for Agent 3
      const allSourceUrls = [
        ...webSearchResults.map(result => result.link),
        ...processedWikiData.map(data => data.url)
      ].filter(Boolean); // Filter out any undefined or null links

      const dataForAgent3 = {
        webSearchResults: webSearchResults,
        otherToolResults: otherToolResults,
        processedWikiData: processedWikiData,
        rawQuery: userQuery, // Pass the raw query to Agent 3
        classification: classification, // Pass classification to Agent 3
        directComponent: direct_component, // Pass the direct component for hybrid queries
        sourceUrls: [...new Set(allSourceUrls)] // Pass unique source URLs to Agent 3
      };

      console.log("Sending combined data to Agent 3:", dataForAgent3);
      const finalResponse = await callAgent(agent3Model, agent3SystemPrompt, { ...dataForAgent3, isShortResponseEnabled: isShortResponseEnabled }, 0, streamCallback, userQuery, userName, userLocalTime);

      return finalResponse; // Return the final response from Agent 3
    }

    // If Agent 1 returned a classification that doesn't trigger a 'search' action
    // and it's not a direct classification handled above, then it's an unhandled action.
    console.log(`Agent 1 returned an unhandled action or classification: ${action || classification}.`);
    return "An unexpected error occurred during orchestration.";
  }
}