import { wikipediaSearch } from './wikipedia_tool.js';
import agent2SystemPrompt from '../agents/agent2_prompt.js';
import { callAgent } from '../agents/agent_orchestrator.js'; // Assuming callAgent is exported

/**
 * Checks an array of search results for Wikipedia links.
 * If found, it triggers a Wikipedia search and passes the result to Agent 2.
 * @param {Array<Object>} searchResults - An array of search result objects, each potentially containing a URL.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of processed results (e.g., from Agent 2).
 */
export async function wikiEye(searchResults, userQuery) {
    const wikipediaLinks = [];
    for (const result of searchResults) {
        if (result.link && result.link.includes('wikipedia.org/wiki/')) {
            wikipediaLinks.push(result.link);
        }
    }

    const processedWikiData = [];
    if (wikipediaLinks.length > 0) {
        console.log(`WikiEye detected Wikipedia links: ${wikipediaLinks.join(', ')}. Triggering Wikipedia tool and Agent 2.`);
        // Process all detected Wikipedia links
        for (const wikiLink of wikipediaLinks) {
            // Extract the article title from the URL
            const articleTitle = wikiLink.substring(wikiLink.lastIndexOf('/') + 1);

            try {
                const wikiResult = await wikipediaSearch([decodeURIComponent(articleTitle)]);
                if (wikiResult && !wikiResult.error) {
                    const agent2Input = {
                        query: userQuery,
                        rawQuery: userQuery, // Pass original user query as rawQuery to Agent 2
                        articleHtml: wikiResult.articleContentHtml,
                        imageResults: wikiResult.imageResults,
                        sourceArticleUrl: wikiResult.sourceArticleUrl
                    };
                    const parsedWikiDataRaw = await callAgent('mistral-3b-latest', agent2SystemPrompt, agent2Input);
                    try {
                        const parsedWikiData = JSON.parse(parsedWikiDataRaw);
                        processedWikiData.push({
                            ...parsedWikiData, // Include the parsed data from Agent 2
                            articleHtml: wikiResult.articleContentHtml, // Add the raw article HTML
                            imageResults: wikiResult.imageResults, // Add the image results
                            sourceArticleUrl: wikiResult.sourceArticleUrl // Add the source URL
                        });
                    } catch (jsonError) {
                        console.error("Error parsing Agent 2 response in wikiEye:", jsonError.message);
                    }
                } else {
                    console.log(`Wikipedia search failed for ${articleTitle}:`, wikiResult?.error);
                }
            } catch (error) {
                console.error(`Error in wikiEye during Wikipedia search or Agent 2 call for ${articleTitle}:`, error);
            }
        }
    }
    return processedWikiData;
}