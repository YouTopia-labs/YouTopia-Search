import { selectAgents } from './agent_selector.js';
import agent1SystemPrompt from './agent1_prompt.js';
import agent2SystemPrompt from './agent2_prompt.js'; // New import for Agent 2 prompt
import agent3SystemPrompt from './agent3_prompt.js';
import { fetchWheatData } from '../tools/wheat_tool.js'; // Import the new Wheat tool
import { wikiEye } from '../tools/wiki_eye.js'; // Import the new wiki_eye tool

const MISTRAL_API_KEY = 'dj35Gf2Q5TvKZk9Dr7pzpXPIW67iOWMn';
const SERPER_API_KEY = '12d941da076200e8cefcdb6ac7de8b21a6729494';

async function executeTool(toolName, query, params = {}) {
  console.log(`Executing tool: ${toolName} with query: ${query} and params:`, params);
  
  switch (toolName) {
    case 'serper_web_search':
      const webResponse = await fetch('/api/serper-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query }),
      });
      const webData = await webResponse.json();
      return { results: webData.organic };

    case 'serper_news_search':
      const newsResponse = await fetch('/api/serper-news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query }),
      });
      const newsData = await newsResponse.json();
      return { results: newsData.news };

    case 'coingecko':
      const apiKey = 'CG-SnTT6CAXthRTp8sfvkmG7Ffe';
      const coingeckoParams = new URLSearchParams({
        ids: query,
        vs_currencies: 'usd',
        x_cg_demo_api_key: apiKey
      }).toString();
      const coingeckoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?${coingeckoParams}`);
      const coingeckoData = await coingeckoResponse.json();
      return { data: coingeckoData, sourceUrl: 'https://www.coingecko.com/' };


    case 'wheat':
      console.log(`Calling fetchWheatData for location: ${query}`);
      return { data: await fetchWheatData(query), sourceUrl: 'https://open-meteo.com' };

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export async function callAgent(model, prompt, input, retryCount = 0, streamCallback = null) {
  console.log(`Calling agent with model: ${model}, prompt: ${prompt}, input:`, input);
  const apiUrl = 'https://api.mistral.ai/v1/chat/completions';
  const maxRetries = 2;

  // For Agent 3, if a streamCallback is provided, ensure JSON validation is skipped
  // as partial responses will not be valid JSON until complete.
  if (streamCallback && prompt.includes('Agent 3:')) {
    console.log("Agent 3 streaming enabled. Skipping JSON validation for partials.");
  }
  
  // Construct messages array based on agent and input
  let messages = [
    { role: 'system', content: prompt }
  ];

  // Add retry-specific instructions for JSON compliance
  if (retryCount > 0) {
    messages.push({ 
      role: 'system', 
      content: `CRITICAL: Your previous response was not valid JSON. You MUST respond with ONLY a JSON object starting with { and ending with }. NO explanatory text before or after the JSON. NO markdown. NO conversational language.` 
    });
  }

  if (input) {
    // For Agent 1, input is a direct query string or an object. For Agent 3, it's an object.
    const userInputContent = typeof input === 'string' ? input : JSON.stringify(input);
    messages.push({ role: 'user', content: userInputContent });
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: retryCount > 0 ? 0.3 : 0.7, // Lower temperature for retries
        max_tokens: 6000, // Adjust as needed
        stream: true // Enable streaming
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Mistral API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    let content = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // Each chunk might contain multiple JSON objects or partial objects
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonStr = line.substring(5).trim();
          if (jsonStr === '[DONE]') {
            break; // End of stream
          }
          try {
            const data = JSON.parse(jsonStr);
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
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
            // Continue processing other chunks even if one fails
          }
        }
      }
    }

    // For Agent 1, validate JSON format before returning
    // If Agent 3 and streaming, skip JSON validation here as partials won't be valid
    if (prompt.includes('Agent 1:') && retryCount < maxRetries && !(streamCallback && prompt.includes('Agent 3:'))) {
      try {
        // Quick JSON validation
        const trimmed = content.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
          throw new Error('Response does not start with { or end with }');
        }
        JSON.parse(trimmed);
      } catch (jsonError) {
        console.warn(`[Warning] Agent 1 returned invalid JSON on attempt ${retryCount + 1}. Retrying...`);
        console.warn("Invalid response:", content);
        return callAgent(model, prompt, input, retryCount + 1, streamCallback); // Pass streamCallback on retry
      }
    }
    
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

export async function orchestrateAgents(userQuery, agentSelectionType, streamCallback = null, logCallback = null) {
  console.log(`Starting orchestration for query: "${userQuery}" with selection: "${agentSelectionType}"`);

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
    const agent1ResponseRaw = await callAgent(agent1Model, agent1SystemPrompt, agent1Input);
    let parsedAgent1Response;

    // Enhanced JSON parsing with multiple fallback strategies
    const parseJsonResponse = (rawResponse) => {
      // Strategy 1: Direct parse (for properly formatted responses)
      try {
        return JSON.parse(rawResponse.trim());
      } catch (e) {
        console.warn("[Warning] Direct JSON parse failed. Trying cleanup strategies...");
      }

      // Strategy 2: Remove common prefixes and markdown
      let cleaned = rawResponse
        .replace(/^.*?(?=\{)/s, '') // Remove everything before first {
        .replace(/```json\s*|```/g, '') // Remove markdown fences
        .replace(/`/g, '') // Remove backticks
        .trim();

      // Strategy 2.5: If the cleaned string is entirely wrapped in quotes, unwrap it.
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        // Ensure it's not a JSON string literal inside (e.g., "{\"key\":\"value\"}")
        // but rather a string that contains the entire JSON object as its content.
        try {
          const tempParsed = JSON.parse(cleaned);
          if (typeof tempParsed === 'object' && tempParsed !== null) {
            return tempParsed; // If it's already valid JSON, return it.
          }
        } catch (e) {
          // If parsing fails, it means the quotes are part of the malformed output, so unwrap.
          cleaned = cleaned.substring(1, cleaned.length - 1).trim();
        }
      }

      try {
        return JSON.parse(cleaned);
      } catch (e) {
        console.warn("[Warning] Cleaned JSON parse failed. Attempting brace extraction...");
      }

      // Strategy 3: Extract JSON object by finding matching braces
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const extracted = cleaned.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(extracted);
        } catch (e) {
          console.error("[Error] All JSON parsing strategies failed.");
          console.error("Raw response:", rawResponse);
          console.error("Cleaned response:", cleaned);
          console.error("Extracted JSON:", extracted);
          console.error("Parse error:", e.message);
          throw new Error(`JSON parsing failed: ${e.message}`);
        }
      }
      
      throw new Error("No valid JSON structure found in response");
    };

    try {
      parsedAgent1Response = parseJsonResponse(agent1ResponseRaw);
      console.log("✓ Agent 1 JSON parsed successfully");
      
      // Validate the parsed response structure
      const validationErrors = validateAgent1Response(parsedAgent1Response);
      if (validationErrors.length > 0) {
        console.error("[Error] Agent 1 response validation failed:");
        validationErrors.forEach(error => console.error(`  - ${error}`));
        console.error("Response:", JSON.stringify(parsedAgent1Response, null, 2));
        return `Error: Agent 1 response validation failed: ${validationErrors.join('; ')}`;
      }
      
      console.log("✓ Agent 1 response validation passed");
      
    } catch (error) {
      console.error("[Error] Agent 1 response parsing failed:", error.message);
      console.error("Raw response:", agent1ResponseRaw);
      return `Error: Agent 1 returned an invalid JSON response. The response must start with { and end with }. Error: ${error.message}`;
    }

    console.log("Agent 1 Parsed Response:", parsedAgent1Response);

    const { classification, action, search_plan, response: agent1DirectResponse, direct_component } = parsedAgent1Response;

    // Handle direct classifications (conversational, math, code, unclear, direct)
    if (classification && (classification === 'conversational' || classification === 'math' || classification === 'code' || classification === 'unclear' || classification === 'direct')) {
      console.log(`${classification} query detected. Passing direct response to Agent 3.`);
      // For 'direct' classification, pass the original userQuery as the query to Agent 3
      // For other direct classifications, Agent 1's response field already contains the relevant part.
      const queryForAgent3 = (classification === 'direct' || classification === 'conversational') ? userQuery : agent1DirectResponse;
      const finalResponse = await callAgent(agent3Model, agent3SystemPrompt, { rawQuery: userQuery, query: queryForAgent3, classification: classification }, 0, streamCallback);
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
            const result = await executeTool(step.tool, step.query, step.params);
            return { type: 'web_search', data: result.results || [result] };
          } else if (step.tool === 'coingecko' || step.tool === 'wheat') {
            const result = await executeTool(step.tool, step.query, step.params);
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
      const finalResponse = await callAgent(agent3Model, agent3SystemPrompt, dataForAgent3, 0, streamCallback);

      return finalResponse; // Return the final response from Agent 3
    }

    // If Agent 1 returned a classification that doesn't trigger a 'search' action
    // and it's not a direct classification handled above, then it's an unhandled action.
    console.log(`Agent 1 returned an unhandled action or classification: ${action || classification}.`);
    return "An unexpected error occurred during orchestration.";
  }
}