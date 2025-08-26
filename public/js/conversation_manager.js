// Conversation History Manager and Context Condensing Function

class ConversationManager {
    constructor() {
        this.userHistory = []; // All conversations for the user (shown in history panel)
        this.chatContextHistory = []; // Only current session conversations (for AI context)
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
                    history: this.userHistory,
                }),
            });
        } catch (error) {
            console.error('Error saving conversation history:', error);
        }
    }

    // Add a user query to both histories
    addUserQuery(query) {
        const entry = {
            timestamp: Date.now(),
            query: query,
            response: null,
            sources: []
        };
        
        // Add to chat context history (current session only)
        this.chatContextHistory.push(entry);
        
        // Add to user history (all conversations)
        this.userHistory.push(entry);

        // Limit history length for chat context
        if (this.chatContextHistory.length > this.maxHistoryLength) {
            this.chatContextHistory.shift();
        }
        
        // Limit history length for user history
        if (this.userHistory.length > this.maxHistoryLength) {
            this.userHistory.shift();
        }
        
        this._saveHistory();
    }

    // Add a complete interaction to both histories
    addInteraction(query, response, sources = []) {
        // Check if the last entry in chat context is the same query without a response
        const lastContextEntry = this.chatContextHistory[this.chatContextHistory.length - 1];
        if (lastContextEntry && lastContextEntry.query === query && lastContextEntry.response === null) {
            // Update the existing entry in chat context
            lastContextEntry.response = response;
            lastContextEntry.sources = sources;
        } else {
            // Add a new entry to chat context
            this.chatContextHistory.push({
                timestamp: Date.now(),
                query: query,
                response: response,
                sources: sources
            });
        }
        
        // Check if the last entry in user history is the same query without a response
        const lastUserEntry = this.userHistory[this.userHistory.length - 1];
        if (lastUserEntry && lastUserEntry.query === query && lastUserEntry.response === null) {
            // Update the existing entry in user history
            lastUserEntry.response = response;
            lastUserEntry.sources = sources;
        } else {
            // Add a new entry to user history
            this.userHistory.push({
                timestamp: Date.now(),
                query: query,
                response: response,
                sources: sources
            });
        }

        // Limit history length for chat context
        if (this.chatContextHistory.length > this.maxHistoryLength) {
            this.chatContextHistory.shift();
        }
        
        // Limit history length for user history
        if (this.userHistory.length > this.maxHistoryLength) {
            this.userHistory.shift();
        }
        
        this._saveHistory();
    }

    // Load history from an external source (e.g., after fetching from backend)
    loadHistory(history) {
        if (Array.isArray(history)) {
            this.userHistory = history;
            // When loading user history, we start with a fresh chat context
            this.chatContextHistory = [];
        } else {
            console.error('Failed to load history: not an array.', history);
        }
    }

    // Get the full user history (for history panel)
    getUserHistory() {
        return [...this.userHistory];
    }

    // Get the current chat context history (for AI agents)
    getChatContextHistory() {
        return this.chatContextHistory
            .filter(item => item.response !== null) // Only include completed interactions
            .map(item => ({
                query: item.query,
                response: item.response
            }));
    }

    // Get conversation history in the format expected by the orchestrator (deprecated, use getChatContextHistory)
    getConversationHistory() {
        return this.getChatContextHistory();
    }

    // Get recent detailed context (last N interactions from current chat)
    getRecentContext(count = 2) {
        return this.chatContextHistory
            .filter(item => item.response !== null) // Only include completed interactions
            .slice(-count);
    }

    // Clear chat context history (for new conversations) but keep user history
    clearChatContext() {
        this.chatContextHistory = [];
    }
    
    // Clear all history including user history
    clearAllHistory() {
        this.chatContextHistory = [];
        this.userHistory = [];
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