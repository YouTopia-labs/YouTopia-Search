import { updateChartsTheme, renderChart, parseChartConfig } from './chart_utils.js';



// Download table as CSV
function downloadTableAsCSV(tableConfig, filename = 'table.csv') {
    try {
        // Create CSV content
        let csvContent = '';
        
        // Add headers
        csvContent += tableConfig.headers.map(header => `"${header}"`).join(',') + '\n';
        
        // Add data rows
        tableConfig.data.forEach(row => {
            csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
        });
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading CSV:', error);
    }
}

// Create download button
function createDownloadButton(type, downloadFunction) {
    const button = document.createElement('button');
    button.className = 'download-btn';
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    `;
    button.style.cssText = `
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 24px;
        height: 24px;
        border: none;
        background: var(--secondary-bg-color, #f8f9fa);
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
        z-index: 10;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    `;
    
    button.addEventListener('click', downloadFunction);
    
    return button;
}

export function renderTable(tableConfig, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Table container with ID '${containerId}' not found.`);
        return;
    }

    // Check if Grid.js is available
    if (typeof gridjs === 'undefined') {
        console.error('Grid.js library is not loaded');
        container.innerHTML = `
            <div style="padding: 15px; border: 1px solid var(--error-color, #e74c3c); border-radius: 8px; background-color: var(--error-bg, #fdf2f2); color: var(--error-color, #e74c3c); margin: 10px 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Table Rendering Error</strong>
                </div>
                <div style="font-size: 14px; opacity: 0.9;">Grid.js library is not loaded</div>
            </div>
        `;
        return;
    }

    try {
        // Validate table configuration
        if (!tableConfig) {
            throw new Error('Table configuration is null or undefined');
        }
        
        if (!tableConfig.headers || !Array.isArray(tableConfig.headers)) {
            throw new Error('Table headers must be an array');
        }
        
        if (!tableConfig.data || !Array.isArray(tableConfig.data)) {
            throw new Error('Table data must be an array');
        }

        // Set container to relative positioning for floating download button
        container.style.position = 'relative';

        // Create Grid.js table
        const grid = new gridjs.Grid({
            columns: tableConfig.headers,
            data: tableConfig.data,
            style: {
                table: {
                    'min-width': '100%'
                },
                th: {
                    'background-color': 'var(--secondary-bg-color)',
                    'color': 'var(--text-primary)',
                    'border': '1px solid var(--chart-border-color)'
                },
                td: {
                    'background-color': 'var(--content-bg-color)',
                    'color': 'var(--text-primary)',
                    'border': '1px solid var(--chart-border-color)'
                }
            }
        });

        // Render grid directly in container
        grid.render(container);
        
        // Add floating download button
        const downloadBtn = createDownloadButton('csv', () => {
            downloadTableAsCSV(tableConfig, `table_${Date.now()}.csv`);
        });
        container.appendChild(downloadBtn);
        
    } catch (error) {
        console.error('Error rendering table:', error);
        container.innerHTML = `
            <div style="padding: 15px; border: 1px solid var(--error-color, #e74c3c); border-radius: 8px; background-color: var(--error-bg, #fdf2f2); color: var(--error-color, #e74c3c); margin: 10px 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Table Rendering Error</strong>
                </div>
                <div style="font-size: 14px; opacity: 0.9;">${error.message}</div>
            </div>
        `;
    }
}

// Export chart rendering functions for use in main.js
export { renderChart, parseChartConfig } from './chart_utils.js';