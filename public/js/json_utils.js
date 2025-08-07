/**
 * Safari-compatible JSON parsing utilities
 * Safari's JavaScript engine is stricter about JSON parsing than Chrome/Firefox
 */

/**
 * Robust JSON parsing that handles common malformed JSON issues
 * @param {string} jsonString - The JSON string to parse
 * @param {boolean} allowFallback - Whether to create a fallback object if parsing fails
 * @returns {object} Parsed JSON object
 */
export function safeParse(jsonString, allowFallback = false) {
    if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('Invalid input: JSON string is required');
    }

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
        fixedJson = fixedJson.replace(/"\s*ification\s*",?\s*/g, '"classification":');
        
        // Strategy 2: Fix missing quotes around property names
        fixedJson = fixedJson.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        
        // Strategy 3: Fix trailing commas in objects and arrays
        fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
        
        // Strategy 4: Fix missing commas between properties
        fixedJson = fixedJson.replace(/"\s*\n\s*"/g, '",\n"');
        fixedJson = fixedJson.replace(/}\s*\n\s*{/g, '},\n{');
        
        // Strategy 5: Normalize quotes
        fixedJson = fixedJson.replace(/[""'']/g, '"');
        fixedJson = fixedJson.replace(/[\u2018\u2019]/g, "'");
        fixedJson = fixedJson.replace(/[\u201C\u201D]/g, '"');
        
        // Strategy 6: Fix incomplete strings and missing quotes around string values
        fixedJson = fixedJson.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_\s]*)\s*([,}])/g, ': "$1"$2');
        
        // Strategy 7: Clean up whitespace and control characters
        fixedJson = fixedJson.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        fixedJson = fixedJson.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
        fixedJson = fixedJson.replace(/\s+/g, ' ');
        
        // Strategy 8: Ensure proper JSON structure
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
            
            if (allowFallback) {
                // Last resort: try to construct a minimal valid response
                try {
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
            }
            
            throw new Error(`Failed to parse JSON: ${secondError.message}. Original content: ${potentialJson}`);
        }
    }
}

/**
 * Parse table configuration JSON with Safari compatibility
 * @param {string} jsonString - The table JSON string to parse
 * @returns {object} Parsed table configuration
 */
export function parseTableConfig(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('Invalid input: JSON string is required');
    }

    // Clean and normalize the input
    let cleanedText = jsonString
        .trim()
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove non-printable characters
        .replace(/^\s*```\s*table\s*/i, '') // Remove table code block markers
        .replace(/\s*```\s*$/i, '')
        .trim();
    
    // Normalize quotes and special characters
    cleanedText = cleanedText
        .replace(/[""'']/g, '"') // Normalize all quote types
        .replace(/…/g, '...') // Replace ellipsis
        .replace(/–/g, '-') // Replace en-dash
        .replace(/—/g, '-') // Replace em-dash
        .replace(/[\u2018\u2019]/g, "'") // Replace smart single quotes
        .replace(/[\u201C\u201D]/g, '"') // Replace smart double quotes
        .replace(/\r\n/g, ' ') // Replace Windows line breaks
        .replace(/\n/g, ' ') // Replace Unix line breaks
        .replace(/\r/g, ' ') // Replace Mac line breaks
        .replace(/\t/g, ' ') // Replace tabs
        .replace(/\s+/g, ' '); // Collapse multiple spaces

    // Basic structure validation
    if (!cleanedText.includes('"headers"') || !cleanedText.includes('"data"')) {
        throw new Error('Table must contain both "headers" and "data" properties');
    }

    // Fix common JSON issues
    cleanedText = cleanedText
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted property names
        .replace(/'/g, '"') // Convert single quotes to double quotes
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/([}\]])(\s*)([{\[])/g, '$1,$2$3'); // Add missing commas between objects/arrays

    // Sanitize cell content to prevent JSON parsing errors
    cleanedText = cleanedText.replace(/"([^"]*?)"/g, (match, content) => {
        // Skip if this is a property name (headers or data)
        if (content === 'headers' || content === 'data') {
            return match;
        }
        
        // Sanitize the content
        let sanitized = content
            .replace(/\\/g, '') // Remove backslashes
            .replace(/"/g, '') // Remove internal quotes
            .replace(/'/g, '') // Remove single quotes
            .replace(/,/g, '') // Remove commas
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .replace(/\r/g, ' ') // Replace carriage returns
            .replace(/\t/g, ' ') // Replace tabs
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim();
        
        return `"${sanitized}"`;
    });

    // Try to parse the JSON
    let tableConfig;
    try {
        tableConfig = JSON.parse(cleanedText);
    } catch (parseError) {
        console.error('JSON parsing failed:', parseError.message);
        console.error('Cleaned text:', cleanedText);
        throw new Error(`Invalid table JSON format. Error: ${parseError.message}. Expected format: {"headers": ["Col1", "Col2"], "data": [["Row1Col1", "Row1Col2"]]}`);
    }

    // Clean the parsed object
    if (tableConfig && tableConfig.headers && Array.isArray(tableConfig.headers)) {
        tableConfig.headers = tableConfig.headers.map(header => {
            if (typeof header === 'string') {
                return header.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, ' ').trim();
            }
            return String(header).replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, ' ').trim();
        });
    }

    if (tableConfig && tableConfig.data && Array.isArray(tableConfig.data)) {
        tableConfig.data = tableConfig.data.map(row => {
            if (Array.isArray(row)) {
                return row.map(cell => {
                    if (typeof cell === 'string') {
                        return cell.replace(/[^a-zA-Z0-9\s\-_.$]/g, '').replace(/\s+/g, ' ').trim();
                    }
                    if (typeof cell === 'number') {
                        return cell;
                    }
                    return String(cell).replace(/[^a-zA-Z0-9\s\-_.$]/g, '').replace(/\s+/g, ' ').trim();
                });
            }
            return row;
        });
    }

    // Validate structure
    if (!tableConfig || typeof tableConfig !== 'object') {
        throw new Error('Table configuration must be a valid object');
    }
    
    if (!tableConfig.headers || !Array.isArray(tableConfig.headers) || tableConfig.headers.length === 0) {
        throw new Error('Table must have valid headers array');
    }
    
    if (!tableConfig.data || !Array.isArray(tableConfig.data)) {
        throw new Error('Table must have valid data array');
    }

    return tableConfig;
}

/**
 * Parse chart configuration JSON with Safari compatibility
 * @param {string} jsonString - The chart JSON string to parse
 * @returns {object} Parsed chart configuration
 */
export function parseChartConfig(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('Invalid input: JSON string is required');
    }

    let chartConfigText = jsonString.trim();
    
    // Clean up the JSON format
    chartConfigText = chartConfigText.replace(/(\w+):/g, "\"$1\":");
    
    try {
        return JSON.parse(chartConfigText);
    } catch (parseError) {
        // Try to fix common JSON issues
        let cleanedText = chartConfigText;
        cleanedText = cleanedText.replace(/\"(\w+):\"/g, "\"$1\":");
        cleanedText = cleanedText.replace(/}\s*{/g, '},{');
        cleanedText = cleanedText.replace(/}\s*]/g, '}]');
        cleanedText = cleanedText.replace(/}\s*\]/g, '}]');
        
        // Normalize quotes
        cleanedText = cleanedText.replace(/[""'']/g, '"');
        cleanedText = cleanedText.replace(/[\u2018\u2019]/g, "'");
        cleanedText = cleanedText.replace(/[\u201C\u201D]/g, '"');
        
        // Remove trailing commas
        cleanedText = cleanedText.replace(/,(\s*[}\]])/g, '$1');
        
        try {
            const chartConfig = JSON.parse(cleanedText);
            
            if (!chartConfig.type) {
                throw new Error('Chart configuration is missing "type" property');
            }
            if (!chartConfig.data) {
                throw new Error('Chart configuration is missing "data" property');
            }
            
            return chartConfig;
        } catch (secondParseError) {
            throw new Error(`Invalid chart configuration format: ${secondParseError.message}`);
        }
    }
}