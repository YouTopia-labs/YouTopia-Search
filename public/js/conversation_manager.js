// Conversation History Manager and Context Condensing Function

class ConversationManager {
    constructor() {
        this.conversationHistory = [];
        this.maxHistoryLength = 10; // Limit history to prevent excessive memory usage
        this.WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';
    }

    async _saveHistory() {
        const id_token = localStorage.getItem('id_token');
        if (!id_token) {
            console.warn('Cannot save history: user not logged in.');
            return;
        }

        try {
            await fetch(`${this.WORKER_BASE_URL}api/conversation-history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_token: id_token,
                    history: this.conversationHistory,
                }),
            });
        } catch (error) {
            console.error('Error saving conversation history:', error);
        }
    }

    // Add a user query to the conversation history
    addUserQuery(query) {
        // Add the query without a response yet
        this.conversationHistory.push({
            timestamp: Date.now(),
            query: query,
            response: null,
            sources: []
        });

        // Limit history length
        if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory.shift();
        }
        this._saveHistory();
    }

    // Add a complete interaction to the conversation history
    addInteraction(query, response, sources = []) {
        // Check if the last entry is the same query without a response
        const lastEntry = this.conversationHistory[this.conversationHistory.length - 1];
        if (lastEntry && lastEntry.query === query && lastEntry.response === null) {
            // Update the existing entry
            lastEntry.response = response;
            lastEntry.sources = sources;
        } else {
            // Add a new entry
            this.conversationHistory.push({
                timestamp: Date.now(),
                query: query,
                response: response,
                sources: sources
            });
        }

        // Limit history length
        if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory.shift();
        }
        this._saveHistory();
    }

    // Load history from an external source (e.g., after fetching from backend)
    loadHistory(history) {
        if (Array.isArray(history)) {
            this.conversationHistory = history;
        } else {
            console.error('Failed to load history: not an array.', history);
        }
    }

    // Get the full conversation history
    getHistory() {
        return [...this.conversationHistory];
    }

    // Get conversation history in the format expected by the orchestrator
    getConversationHistory() {
        return this.conversationHistory
            .filter(item => item.response !== null) // Only include completed interactions
            .map(item => ({
                query: item.query,
                response: item.response
            }));
    }

    // Get recent detailed context (last N interactions)
    getRecentContext(count = 2) {
        return this.conversationHistory
            .filter(item => item.response !== null) // Only include completed interactions
            .slice(-count);
    }

    // Clear conversation history
    clearHistory() {
        this.conversationHistory = [];
    }
}

// Context condensing function
export function condenseContext(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
        return {
            summary: "",
            keyEntities: [],
            recentFocus: ""
        };
    }

    // For simplicity, we'll implement a basic condensing approach
    // In a production system, this could use an LLM to generate summaries
    
    // Extract key entities (simple keyword extraction)
    const allText = conversationHistory.map(item =>
        `${item.query} ${item.response}`
    ).join(' ');
    
    // Simple entity extraction (in a real implementation, this could use NLP techniques)
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those']);
    const words = allText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const wordCount = {};
    
    words.forEach(word => {
        if (word.length > 3 && !commonWords.has(word)) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });
    
    // Get top entities
    const keyEntities = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);
    
    // Create a simple summary
    const topics = [...new Set(keyEntities.slice(0, 5))];
    const summary = `Previous conversation about ${topics.join(', ')}`;
    
    // Get recent focus
    const recentItem = conversationHistory[conversationHistory.length - 1];
    const recentFocus = recentItem ? recentItem.query : "";
    
    return {
        summary: summary,
        keyEntities: keyEntities,
        recentFocus: recentFocus
    };
}

export default ConversationManager;