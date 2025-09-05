/**
 * Smart Markdown Parser for Real-time Streaming
 * Handles partial markdown content and renders complete elements immediately
 */

class SmartMarkdownParser {
    constructor() {
        this.buffer = '';
        this.completedBlocks = [];
        this.pendingBlocks = [];
        this.lastProcessedLength = 0; // Performance optimization
        this.blockPatterns = {
            table: /```table[\s\S]*?```/g,
            chart: /```chart[\s\S]*?```/g,
            codeBlock: /```[\w]*[\s\S]*?```/g,
            header: /^#{1,6}\s+.+$/gm,
            bold: /\*\*([^*]+)\*\*/g,
            italic: /\*([^*]+)\*/g,
            link: /\[([^\]]+)\]\(([^)]+)\)/g,
            listItem: /^[\s]*[-*+]\s+.+$/gm,
            numberedList: /^[\s]*\d+\.\s+.+$/gm
        };
        
        // Pre-compile inline formatting patterns for performance
        this.inlinePatterns = [
            { pattern: this.blockPatterns.bold, replacement: '<strong>$1</strong>' },
            { pattern: this.blockPatterns.italic, replacement: '<em>$1</em>' },
            { pattern: this.blockPatterns.link, replacement: '<a href="$2">$1</a>' }
        ];
    }

    /**
     * Process new character and return any completed blocks
     * Optimized for minimal processing overhead
     */
    processCharacter(char) {
        this.buffer += char;
        
        // Only check for completed blocks on specific trigger characters
        if (char === '`' || char === '\n' || char === '#') {
            return this.extractCompletedBlocks();
        }
        
        return [];
    }

    /**
     * Process a chunk of text and return completed blocks
     */
    processChunk(text) {
        this.buffer += text;
        return this.extractCompletedBlocks();
    }

    /**
     * Extract completed markdown blocks from buffer
     */
    extractCompletedBlocks() {
        const completedBlocks = [];
        
        // Check for completed table blocks
        const tableMatches = this.findCompletedBlocks('table');
        completedBlocks.push(...tableMatches);
        
        // Check for completed chart blocks
        const chartMatches = this.findCompletedBlocks('chart');
        completedBlocks.push(...chartMatches);
        
        // Check for completed code blocks
        const codeMatches = this.findCompletedBlocks('codeBlock');
        completedBlocks.push(...codeMatches);
        
        // Check for completed headers (end with newline)
        const headerMatches = this.findCompletedHeaders();
        completedBlocks.push(...headerMatches);
        
        // Check for completed list items
        const listMatches = this.findCompletedListItems();
        completedBlocks.push(...listMatches);
        
        return completedBlocks;
    }

    /**
     * Find completed blocks of a specific type
     */
    findCompletedBlocks(blockType) {
        const pattern = this.blockPatterns[blockType];
        const matches = [];
        let match;
        
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(this.buffer)) !== null) {
            const block = {
                type: blockType,
                content: match[0],
                startIndex: match.index,
                endIndex: match.index + match[0].length,
                isComplete: true
            };
            
            // Check if this block was already processed
            if (!this.isBlockProcessed(block)) {
                matches.push(block);
                this.markBlockAsProcessed(block);
            }
        }
        
        return matches;
    }

    /**
     * Find completed headers (those ending with newline)
     */
    findCompletedHeaders() {
        const lines = this.buffer.split('\n');
        const headers = [];
        
        for (let i = 0; i < lines.length - 1; i++) { // Exclude last line as it might be incomplete
            const line = lines[i];
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            
            if (headerMatch) {
                const block = {
                    type: 'header',
                    content: line,
                    level: headerMatch[1].length,
                    text: headerMatch[2],
                    isComplete: true
                };
                
                if (!this.isBlockProcessed(block)) {
                    headers.push(block);
                    this.markBlockAsProcessed(block);
                }
            }
        }
        
        return headers;
    }

    /**
     * Find completed list items
     */
    findCompletedListItems() {
        const lines = this.buffer.split('\n');
        const listItems = [];
        
        for (let i = 0; i < lines.length - 1; i++) { // Exclude last line as it might be incomplete
            const line = lines[i];
            const listMatch = line.match(/^([\s]*)([-*+]|\d+\.)\s+(.+)$/);
            
            if (listMatch) {
                const block = {
                    type: 'listItem',
                    content: line,
                    indent: listMatch[1].length,
                    marker: listMatch[2],
                    text: listMatch[3],
                    isComplete: true
                };
                
                if (!this.isBlockProcessed(block)) {
                    listItems.push(block);
                    this.markBlockAsProcessed(block);
                }
            }
        }
        
        return listItems;
    }

    /**
     * Check if a block has already been processed
     */
    isBlockProcessed(block) {
        return this.completedBlocks.some(processed => 
            processed.type === block.type && 
            processed.content === block.content
        );
    }

    /**
     * Mark a block as processed
     */
    markBlockAsProcessed(block) {
        this.completedBlocks.push({
            type: block.type,
            content: block.content,
            timestamp: Date.now()
        });
    }

    /**
     * Get the current incomplete text (for live preview)
     */
    getIncompleteText() {
        // Get text that hasn't been rendered as complete blocks yet
        let incompleteText = this.buffer;
        
        // Remove completed blocks from the text
        this.completedBlocks.forEach(block => {
            incompleteText = incompleteText.replace(block.content, '');
        });
        
        return incompleteText.trim();
    }

    /**
     * Apply inline formatting to text (optimized with pre-compiled patterns)
     */
    applyInlineFormatting(text) {
        let formatted = text;
        
        // Use pre-compiled patterns for better performance
        this.inlinePatterns.forEach(({ pattern, replacement }) => {
            // Reset regex lastIndex for global patterns
            pattern.lastIndex = 0;
            formatted = formatted.replace(pattern, replacement);
        });
        
        return formatted;
    }

    /**
     * Render a completed block to HTML
     */
    renderBlock(block) {
        switch (block.type) {
            case 'header':
                return `<h${block.level}>${this.applyInlineFormatting(block.text)}</h${block.level}>`;
            
            case 'listItem':
                const indent = '  '.repeat(Math.floor(block.indent / 2));
                return `${indent}<li>${this.applyInlineFormatting(block.text)}</li>`;
            
            case 'table':
                return this.renderTableBlock(block.content);
            
            case 'chart':
                return this.renderChartBlock(block.content);
            
            case 'codeBlock':
                return this.renderCodeBlock(block.content);
            
            default:
                return this.applyInlineFormatting(block.content);
        }
    }

    /**
     * Render table block
     */
    renderTableBlock(content) {
        // Extract table content between ```table and ```
        const tableContent = content.replace(/```table\s*\n?/, '').replace(/\n?```$/, '');
        
        // This will be processed by the existing table rendering system
        return `<div class="streaming-table" data-table-content="${encodeURIComponent(tableContent)}"></div>`;
    }

    /**
     * Render chart block
     */
    renderChartBlock(content) {
        // Extract chart content between ```chart and ```
        const chartContent = content.replace(/```chart\s*\n?/, '').replace(/\n?```$/, '');
        
        // This will be processed by the existing chart rendering system
        return `<div class="streaming-chart" data-chart-content="${encodeURIComponent(chartContent)}"></div>`;
    }

    /**
     * Render code block
     */
    renderCodeBlock(content) {
        // Extract language and code content
        const match = content.match(/```(\w*)\s*\n?([\s\S]*?)\n?```/);
        if (match) {
            const language = match[1] || '';
            const code = match[2];
            return `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`;
        }
        return `<pre><code>${this.escapeHtml(content)}</code></pre>`;
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Reset the parser state
     */
    reset() {
        this.buffer = '';
        this.completedBlocks = [];
        this.pendingBlocks = [];
    }

    /**
     * Get parser statistics
     */
    getStats() {
        return {
            bufferLength: this.buffer.length,
            completedBlocks: this.completedBlocks.length,
            pendingBlocks: this.pendingBlocks.length
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartMarkdownParser;
} else if (typeof window !== 'undefined') {
    window.SmartMarkdownParser = SmartMarkdownParser;
}