// A safer JSON parsing function that handles errors gracefully
export function safeParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse JSON:", error);
    return null;
  }
}

// Parse chart configuration from markdown-style syntax
export function parseChartConfig(configString) {
    try {
        return JSON.parse(configString);
    } catch (error) {
        console.error('Error parsing chart configuration:', error);
        return null;
    }
}

// Parse table configuration from markdown-style syntax
export function parseTableConfig(configString) {
    try {
        return JSON.parse(configString);
    } catch (error) {
        console.error('Error parsing table configuration:', error);
        return null;
    }
}