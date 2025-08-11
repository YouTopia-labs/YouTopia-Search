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

// --- Constants ---
const WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';

// --- Helper Functions ---
async function fetchWithProxy(api_target, api_payload, query, userName, userLocalTime) {
    const isAuthBypassEnabled = true; // Hardcoded for preview branch
    const idToken = localStorage.getItem('id_token') || 'dummy-token-for-bypass';

    if (!idToken && !isAuthBypassEnabled) {
        throw new Error('Authentication token not found. Please sign in.');
    }

    const requestBody = {
        query: query,
        user_name: userName,
        user_local_time: userLocalTime,
        id_token: idToken,
        api_target: api_target,
        api_payload: api_payload
    };

    const response = await fetch(`${WORKER_BASE_URL}api/query-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error from proxy for ${api_target}:`, errorText);
        throw new Error(`Proxy error for ${api_target}: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
}

async function fetchAgentPrompt(agentName) {
    const response = await fetch(`../agents/${agentName}_prompt.js`);
    if (!response.ok) {
        throw new Error(`Failed to fetch prompt for agent: ${agentName}`);
    }
    const promptText = await response.text();
    // Use regex to extract the content inside the template literal
    const match = promptText.match(/`([\s\S]*)`/);
    if (!match) {
        throw new Error(`Could not find template literal in prompt file for ${agentName}`);
    }
    return match[1];
}

// --- Tool Definitions ---
const createTools = (query, userName, userLocalTime, streamCallback, logCallback) => {
    // Custom tool wrappers that use the proxy
    const serperAPI = new SerperAPI(
        undefined, // API key is handled by the worker
        (payload) => fetchWithProxy('serper', payload, query, userName, userLocalTime)
    );
    const coingeckoAPI = new CoingeckoAPI(
        (payload) => fetchWithProxy('coingecko', payload, query, userName, userLocalTime)
    );
    const scraperAPI = new ScraperAPI(
        (payload) => fetchWithProxy('scraper', payload, query, userName, userLocalTime)
    );
    const wikiImageAPI = new WikiImageAPI(
        (payload) => fetchWithProxy('wiki_image_search', payload, query, userName, userLocalTime)
    );

    // Initialize tools with the custom API wrappers
    const tools = [
        new SerperTool(serperAPI, logCallback),
        new CoingeckoTool(coingeckoAPI, logCallback),
        new ScraperTool(scraperAPI, logCallback),
        new WikiImageTool(wikiImageAPI, logCallback)
    ];

    return tools;
};

// --- Agent Orchestration ---
export async function orchestrateAgents(query, userName, userLocalTime, selectedModel, streamCallback, logCallback, isShortResponseEnabled) {
    logCallback('<i class="fas fa-cogs" style="color: #60A5FA;"></i> Initializing AI agents and tools...');

    const tools = createTools(query, userName, userLocalTime, streamCallback, logCallback);

    const llm = new ChatOpenAI({
        modelName: "gpt-4-turbo-2024-04-09",
        temperature: 0.1,
        streaming: true,
        openAIApiKey: "dummy-key", // The key is managed by the Cloudflare worker
        configuration: {
            baseURL: `${WORKER_BASE_URL}api/openai-proxy`,
            dangerouslyAllowBrowser: true,
        },
    });

    let finalResponse = '';
    let sources = [];
    let agentExecutor;
    let mainPrompt;

    try {
        if (selectedModel === 'Amaya') {
            logCallback('<i class="fas fa-user-ninja" style="color: #8B5CF6;"></i> Using Amaya Agent for orchestration.');
            mainPrompt = await fetchAgentPrompt('agent1');
        } else if (selectedModel === 'Youtopia') {
            logCallback('<i class="fas fa-rocket" style="color: #EC4899;"></i> Using Youtopia Agent for advanced tasks.');
            mainPrompt = await fetchAgentPrompt('agent2');
        } else {
             logCallback('<i class="fas fa-question-circle" style="color: #FBBF24;"></i> Defaulting to Amaya Agent.');
            mainPrompt = await fetchAgentPrompt('agent1');
        }
        
        if (isShortResponseEnabled) {
            mainPrompt += "\n\nIMPORTANT: The user has requested a short, concise response. Please provide a direct answer without unnecessary elaboration.";
            logCallback('<i class="fas fa-compress-arrows-alt" style="color: #3B82F6;"></i> Short response mode enabled.');
        }


        agentExecutor = await initializeAgentExecutorWithOptions(tools, llm, {
            agentType: "openai-functions",
            verbose: true,
            agentArgs: {
                prefix: mainPrompt,
            },
        });

    } catch (error) {
        logCallback(`<i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i> Error initializing agent: ${error.message}`);
        throw new Error(`Agent Initialization Failed: ${error.message}`);
    }

    logCallback('<i class="fas fa-play-circle" style="color: #10B981;"></i> Agent executor created. Starting execution...');

    try {
        const result = await agentExecutor.invoke({
            input: query
        }, {
            callbacks: [{
                handleLLMNewToken(token) {
                    streamCallback(token);
                },
            }, ],
        });

        finalResponse = result.output;
        logCallback('<i class="fas fa-flag-checkered" style="color: #10B981;"></i> Agent execution finished.');

        // Extract sources if they exist in the response
        try {
            const sourcesMatch = finalResponse.match(/\[SOURCES\]\s*(\{[\s\S]*?\})\s*\[\/SOURCES\]/);
            if (sourcesMatch && sourcesMatch[1]) {
                const sourcesJson = sourcesMatch[1];
                sources = JSON.parse(sourcesJson).sources;
                
                // Clean the sources from the final response
                finalResponse = finalResponse.replace(sourcesMatch[0], '').trim();
                logCallback(`<i class="fas fa-link" style="color: #3B82F6;"></i> Extracted ${sources.length} sources.`);
            }
        } catch (e) {
            logCallback(`<i class="fas fa-exclamation-triangle" style="color: #FBBF24;"></i> Could not parse sources from the response: ${e.message}`);
            // Don't throw, just log the error and continue
        }

    } catch (error) {
        logCallback(`<i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i> Error during agent execution: ${error.message}`);
        throw new Error(`Agent Execution Failed: ${error.message}`);
    }

    return {
        finalResponse,
        sources
    };
}