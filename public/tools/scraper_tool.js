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

  const keywordString = keywords.join(',');
  const fullUrl = `${SCRAPER_API_BASE_URL}?url=${encodeURIComponent(url)}&keyword=${encodeURIComponent(keywordString)}`;

  if (logCallback) {
    logCallback(`<i class="fas fa-spider"></i> Scraping ${url} for keywords: "<b>${keywords.join(', ')}</b>"`);
  }

  try {
    const response = await fetch(fullUrl);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      console.error(`Scraper API error for ${url}:`, errorData);
      return { success: false, ...errorData };
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error calling scraper API for ${url}:`, error);
    return { success: false, error: error.message };
  }
}