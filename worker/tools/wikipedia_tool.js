// This is a placeholder for the JavaScript wrapper for wikipedia_content_explorer.html.
// In a real scenario, this would involve using a headless browser (like Puppeteer)
// to load the HTML, interact with its elements, and extract the results.
// For the purpose of this simulation, we'll assume a direct API call mechanism
// that mimics the HTML's underlying logic.

async function wikipediaSearch(input, lang = 'en') {
    // Mimic the functionality of the HTML file's script
    // This is a simplified direct call to Wikipedia API, similar to the HTML's internal logic.

    let queries = [];
    let directUrl = null;

    if (Array.isArray(input)) {
        queries = input;
    } else if (typeof input === 'string') {
        if (input.startsWith('http')) { // Assume it's a URL
            directUrl = input;
            const urlParts = input.split('/');
            const title = urlParts[urlParts.length - 1];
            queries.push(decodeURIComponent(title)); // Add the title extracted from URL as a query
        } else {
            queries.push(input); // Assume it's a direct article title or search term
        }
    } else {
        return { error: "Invalid input provided for Wikipedia search. Must be a string (URL/query) or an array of queries." };
    }

    if (queries.length === 0) {
        return { error: "No valid queries or URL provided for Wikipedia search." };
    }

    try {
        const fetchPromises = queries.map(async (query) => {
            try {
                // Step 1: Resolve input to a canonical article title.
                const canonicalTitle = await resolveSearchTermToTitle(lang, query);
                if (!canonicalTitle) {
                    return { status: 'rejected', reason: `No Wikipedia article found for "${query}".` };
                }

                // Step 2: Fetch all content concurrently.
                const [articleHtml, images] = await Promise.all([
                    fetchArticleContent(lang, canonicalTitle),
                    fetchAllImages(lang, canonicalTitle)
                ]);

                if (!articleHtml && (!images || images.length === 0)) {
                    return { status: 'rejected', reason: `Could not find any content for "${canonicalTitle}".` };
                }

                // Process images for output
                const imageResults = images.map(img => ({
                    title: img.title,
                    url: img.url
                }));

                return {
                    status: 'fulfilled',
                    value: {
                        articleTitle: canonicalTitle,
                        articleContentHtml: articleHtml,
                        imageResults: imageResults,
                        sourceArticleUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle)}`
                    }
                };
            } catch (innerError) {
                console.warn(`Attempt for query "${query}" failed:`, innerError);
                return { status: 'rejected', reason: innerError.message };
            }
        });

        const results = await Promise.allSettled(fetchPromises);

        // If no successful result found
        return { error: `No Wikipedia article found for any of the provided queries: ${queries.join(', ')}.` };

    } catch (error) {
        console.error("Error in wikipediaSearch:", error);
        return { error: `An error occurred during Wikipedia search: ${error.message}` };
    }
}

/**
 * Extracts the article title from a Wikipedia URL.
 * @param {string} url - The Wikipedia URL.
 * @returns {string|null} The article title or null if not found.
 */
function getTitleFromWikipediaUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/');
        const wikiIndex = pathSegments.indexOf('wiki');
        if (wikiIndex !== -1 && wikiIndex + 1 < pathSegments.length) {
            return decodeURIComponent(pathSegments[wikiIndex + 1]);
        }
    } catch (e) {
        console.error("Error parsing Wikipedia URL:", e);
    }
    return null;
}

/**
 * Finds the most relevant Wikipedia article title for a given search term.
 * @param {string} lang - The language code (e.g., 'en').
 * @param {string} searchTerm - The term to search for.
 * @returns {Promise<string|null>} The canonical article title.
 */
async function resolveSearchTermToTitle(lang, searchTerm) {
    const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: 2, origin: '*',
        generator: 'search', gsrsearch: searchTerm, gsrlimit: 1, gsrwhat: 'text'
    });
    const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network error during title resolution: ${response.status}`);
    const data = await response.json();
    return (data.query && data.query.pages) ? data.query.pages[0].title : null;
}

/**
 * Fetches the parsed HTML content of a Wikipedia article.
 * @param {string} lang - The language code.
 * @param {string} title - The article title.
 * @returns {Promise<string|null>} The article's HTML content.
 */
async function fetchArticleContent(lang, title) {
    const params = new URLSearchParams({
        action: 'parse', page: title, prop: 'text', format: 'json',
        formatversion: 2, origin: '*', redirects: 1,
    });
    const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network error fetching article content: ${response.status}`);
    const data = await response.json();
    return data.parse ? data.parse.text : null;
}

/**
 * Fetches all image URLs from a Wikipedia article.
 * @param {string} lang - The language code.
 * @param {string} title - The article title.
 * @returns {Promise<Array<{title: string, url: string}>>} A list of image objects.
 */
async function fetchAllImages(lang, title) {
    const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: 2, origin: '*',
        prop: 'imageinfo', iiprop: 'url',
        generator: 'images', gimlimit: '50',
        titles: title, redirects: 1
    });
    const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network error fetching images: ${response.status}`);
    const data = await response.json();
    return processImageApiResponse(data);
}

/**
 * Processes the API response to filter and extract relevant images.
 * @param {object} data - The JSON data from the Wikipedia API.
 * @returns {Array<{title: string, url: string}>}
 */
function processImageApiResponse(data) {
    if (!data.query || !data.query.pages) return [];
    
    const images = [];
    for (const page of data.query.pages) {
        if (page.imageinfo) {
            const filename = page.title.toLowerCase();
            // Filter out common non-content images like icons, logos, etc.
            const isGoodCandidate = /\.(jpe?g|png|gif|webp|tiff)$/i.test(filename) && !/logo|icon|badge|flag|map|button|svg|disambig|infobox|wikidata|commons|speaker|sound|rhymes/i.test(filename);
            if (isGoodCandidate) {
                images.push({
                    title: page.title,
                    url: page.imageinfo[0].url
                });
            }
        }
    }
    return images;
}

export { wikipediaSearch };