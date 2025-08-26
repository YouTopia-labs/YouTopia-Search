const SCRAPER_API_BASE_URL = 'https://scraper.ayushhroyy.workers.dev/';

/**
 * Scrapes a website for specific keywords using the web scraper API.
 *
 * @param {string} url The URL of the website to scrape.
 * @param {string[]} keywords An array of keywords to search for.
 * @param {function} logCallback A function to log progress messages.
 * @returns {Promise<object>} The JSON response from the scraper API.
 */
export async function scrapeWebsite(url, keywords, logCallback) {
  if (!url || !keywords || keywords.length === 0) {
    console.error('ScraperError: URL and at least one keyword are required.');
    return { success: false, error: 'URL and at least one keyword are required.' };
  }

  // Limit keywords to 12 as per the updated requirement
  const limitedKeywords = keywords.slice(0, 12);
  const keywordString = limitedKeywords.join(',');
  const fullUrl = `${SCRAPER_API_BASE_URL}?url=${encodeURIComponent(url)}&keyword=${encodeURIComponent(keywordString)}`;

  if (logCallback) {
    logCallback(`<i class="fas fa-spider"></i> Scraping ${url} for keywords: "<b>${limitedKeywords.join(', ')}</b>"`);
  }

  // Implement retry mechanism
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        console.error(`Scraper API error for ${url}:`, errorData);
        
        // If it's a 5xx error, retry
        if (response.status >= 500 && attempt < maxRetries) {
          console.log(`Retrying scrape attempt ${attempt + 1}/${maxRetries} for ${url}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
          continue;
        }
        
        return { success: false, ...errorData };
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error calling scraper API for ${url} (attempt ${attempt}/${maxRetries}):`, error);
      
      // Retry on network errors or timeouts
      if ((error.name === 'AbortError' || error.name === 'TypeError') && attempt < maxRetries) {
        console.log(`Retrying scrape attempt ${attempt + 1}/${maxRetries} for ${url}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        continue;
      }
      
      return { success: false, error: error.message };
    }
  }
}

/**
 * Fetches an image to determine its dimensions and returns the URL with an orientation fragment.
 * @param {string} imageUrl - The URL of the image.
 * @returns {Promise<string>} The image URL with '#landscape' or '#portrait' fragment.
 */
export function tagImageWithDimensions(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.height > img.width) {
        resolve(`${imageUrl}#portrait`);
      } else {
        resolve(`${imageUrl}#landscape`);
      }
    };
    img.onerror = () => {
      // If image fails to load, return original URL without a tag
      console.warn(`Could not load image to determine dimensions: ${imageUrl}`);
      resolve(imageUrl);
    };
    img.src = imageUrl;
  });
}