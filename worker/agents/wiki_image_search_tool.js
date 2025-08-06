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

async function fetchAllImages(lang, title) {
    const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: 2, origin: '*',
        prop: 'imageinfo', iiprop: 'url',
        generator: 'images', gimlimit: '50', // Get up to 50 images
        titles: title, redirects: 1
    });
    const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Network error fetching images: ${response.status}`);
    const data = await response.json();
    return processImageApiResponse(data);
}

function processImageApiResponse(data) {
    if (!data.query || !data.query.pages) return [];
    
    const images = [];
    for (const page of data.query.pages) {
        if (page.imageinfo) {
            // Relax filtering to allow more images, including SVGs.
            // Main image of an article might be an SVG or contain keywords like 'logo' in its filename.
            // We should prioritize showing *any* image associated with the article.
            // The `imageinfo` array should contain the primary image if available.
            images.push({
                title: page.title, // Use the page title as the image title
                url: page.imageinfo[0].url // Use the first image URL found
            });
        }
    }
    return images;
}

function generateSearchVariations(searchTerm) {
    const variations = new Set([searchTerm]);

    // Simple pluralization/singularization (English specific)
    if (searchTerm.endsWith('s')) {
        variations.add(searchTerm.slice(0, -1)); // Remove 's' for singular
    } else {
        variations.add(searchTerm + 's'); // Add 's' for plural
    }

    // Add common alternatives
    if (searchTerm.toLowerCase() === 'airplane') {
        variations.add('aeroplane');
    } else if (searchTerm.toLowerCase() === 'aeroplane') {
        variations.add('airplane');
    }
    // Add more specific variations as needed for other common terms

    return Array.from(variations);
}

export async function wikiImageSearch(query, lang = 'en') {
    try {
        const searchTerms = generateSearchVariations(query);
        let canonicalTitle = null;
        let images = [];

        for (const term of searchTerms) {
            canonicalTitle = await resolveSearchTermToTitle(lang, term);
            if (canonicalTitle) {
                images = await fetchAllImages(lang, canonicalTitle);
                if (images.length > 0) {
                    break; // Found images, no need to try other variations
                }
            }
        }
        
        // Return an object with a results array, similar to other tools
        return { results: images };

    } catch (error) {
        console.error("Error in wikiImageSearch:", error);
        return { results: [] }; // Return empty results on error
    }
}