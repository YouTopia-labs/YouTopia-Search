// Chart.js utilities for YouTopia
// Provides comprehensive charting capabilities with theme support and responsive design

import { safeParse } from './json_utils.js'; // Import Safari-compatible JSON parser


const chartColors = {
    light: {
        text: '#333333',
        secondaryText: '#666666',
        grid: 'rgba(0, 0, 0, 0.1)',
        border: '#CCCCCC',
        background: '#FFFFFF',
        // Soft pastel colors for datasets
        dataColors: [
            'rgba(173, 216, 230, 0.8)', // Light Blue
            'rgba(255, 182, 193, 0.8)', // Light Pink
            'rgba(152, 251, 152, 0.8)', // Light Green
            'rgba(255, 218, 185, 0.8)', // Peach
            'rgba(221, 160, 221, 0.8)', // Plum
            'rgba(255, 255, 224, 0.8)', // Light Yellow
            'rgba(175, 238, 238, 0.8)', // Pale Turquoise
            'rgba(255, 228, 225, 0.8)', // Misty Rose
            'rgba(230, 230, 250, 0.8)', // Lavender
            'rgba(240, 248, 255, 0.8)', // Alice Blue
        ],
        // Border colors (slightly more saturated)
        borderColors: [
            'rgba(135, 206, 250, 1)', // Light Sky Blue
            'rgba(255, 105, 180, 1)', // Hot Pink
            'rgba(144, 238, 144, 1)', // Light Green
            'rgba(255, 165, 0, 1)', // Orange
            'rgba(186, 85, 211, 1)', // Medium Orchid
            'rgba(255, 215, 0, 1)', // Gold
            'rgba(64, 224, 208, 1)', // Turquoise
            'rgba(250, 128, 114, 1)', // Salmon
            'rgba(147, 112, 219, 1)', // Medium Purple
            'rgba(100, 149, 237, 1)', // Cornflower Blue
        ]
    },
    dark: {
        text: '#E0E0E0',
        secondaryText: '#B0B0B0',
        grid: 'rgba(255, 255, 255, 0.1)',
        border: '#555555',
        background: '#2C2C2C',
        // Soft pastel colors for dark mode (slightly muted)
        dataColors: [
            'rgba(135, 206, 250, 0.7)', // Sky Blue
            'rgba(240, 128, 128, 0.7)', // Light Coral
            'rgba(144, 238, 144, 0.7)', // Light Green
            'rgba(255, 218, 185, 0.7)', // Peach
            'rgba(221, 160, 221, 0.7)', // Plum
            'rgba(255, 255, 224, 0.7)', // Light Yellow
            'rgba(175, 238, 238, 0.7)', // Pale Turquoise
            'rgba(255, 182, 193, 0.7)', // Light Pink
            'rgba(230, 230, 250, 0.7)', // Lavender
            'rgba(176, 224, 230, 0.7)', // Powder Blue
        ],
        // Border colors for dark mode
        borderColors: [
            'rgba(135, 206, 250, 1)', // Sky Blue
            'rgba(240, 128, 128, 1)', // Light Coral
            'rgba(144, 238, 144, 1)', // Light Green
            'rgba(255, 218, 185, 1)', // Peach
            'rgba(221, 160, 221, 1)', // Plum
            'rgba(255, 255, 224, 1)', // Light Yellow
            'rgba(175, 238, 238, 1)', // Pale Turquoise
            'rgba(255, 182, 193, 1)', // Light Pink
            'rgba(230, 230, 250, 1)', // Lavender
            'rgba(176, 224, 230, 1)', // Powder Blue
        ]
    }
};
// Global chart instances for theme updates
const chartInstances = new Map();

// Get current theme colors
function getCurrentThemeColors() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    return isDarkMode ? chartColors.dark : chartColors.light;
}

// Common chart options with responsive design and theme support
function getBaseChartOptions(chartType = 'line') {
    const colors = getCurrentThemeColors();
    
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        plugins: {
            legend: {
                labels: {
                    color: colors.text,
                    font: {
                        family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        size: 12
                    },
                    padding: 20,
                    usePointStyle: true
                }
            },
            tooltip: {
                backgroundColor: colors.background,
                titleColor: colors.text,
                bodyColor: colors.text,
                borderColor: colors.border,
                borderWidth: 1,
                cornerRadius: 8,
                displayColors: true,
                titleFont: {
                    family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    size: 12
                }
            }
        },
        scales: chartType === 'pie' || chartType === 'doughnut' || chartType === 'radar' ? {} : {
            x: {
                grid: {
                    color: colors.grid,
                    drawBorder: false
                },
                ticks: {
                    color: colors.secondaryText,
                    font: {
                        family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        size: 11
                    }
                },
                border: {
                    color: colors.border
                }
            },
            y: {
                grid: {
                    color: colors.grid,
                    drawBorder: false
                },
                ticks: {
                    color: colors.secondaryText,
                    font: {
                        family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        size: 11
                    }
                },
                border: {
                    color: colors.border
                }
            }
        }
    };
}

// Download chart as PNG
function downloadChartAsPNG(canvas, filename = 'chart.png') {
    try {
        // Create download link
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error downloading chart:', error);
    }
}

// Create download button for charts
function createChartDownloadButton(canvas) {
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
    
    button.addEventListener('click', () => {
        downloadChartAsPNG(canvas, `chart_${Date.now()}.png`);
    });
    
    return button;
}

// Create a chart container with proper styling
function createChartContainer(containerId, title = '') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Chart container with ID '${containerId}' not found.`);
        return null;
    }

    // Create chart wrapper
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'chart-wrapper';
    chartWrapper.style.cssText = `
        position: relative;
        margin: 20px 0;
        padding: 20px;
    `;
    chartWrapper.classList.add('chart-display-container'); // Add a class for CSS styling

    // Add title if provided
    if (title) {
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.cssText = `
            margin: 0 0 20px 0;
            color: var(--text-primary);
            font-family: Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 1.2rem;
            font-weight: 600;
            text-align: center;
        `;
        chartWrapper.appendChild(titleElement);
    }

    // Create canvas container with responsive sizing
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
        position: relative;
        height: 400px;
        width: 100%;
        max-width: 100%;
    `;
    // No direct styling here, rely on CSS classes

    // Create canvas
    const canvas = document.createElement('canvas');
    const chartId = `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    canvas.id = chartId;
    
    canvasContainer.appendChild(canvas);
    chartWrapper.appendChild(canvasContainer);
    
    // Add download button
    const downloadBtn = createChartDownloadButton(canvas);
    chartWrapper.appendChild(downloadBtn);
    
    container.appendChild(chartWrapper);

    return { canvas, chartId, wrapper: chartWrapper };
}

// Create line chart
export function createLineChart(containerId, data, options = {}) {
    const chartContainer = createChartContainer(containerId, options.title);
    if (!chartContainer) return null;

    const colors = getCurrentThemeColors();
    const baseOptions = getBaseChartOptions('line');
    
    // Prepare datasets with colors
    const datasets = data.datasets.map((dataset, index) => ({
        ...dataset,
        borderColor: dataset.borderColor || colors.borderColors[index % colors.borderColors.length],
        backgroundColor: dataset.backgroundColor || colors.dataColors[index % colors.dataColors.length],
        borderWidth: dataset.borderWidth || 2,
        fill: dataset.fill !== undefined ? dataset.fill : false,
        tension: dataset.tension || 0.4,
        pointRadius: dataset.pointRadius || 4,
        pointHoverRadius: dataset.pointHoverRadius || 6,
        pointBackgroundColor: dataset.pointBackgroundColor || colors.borderColors[index % colors.borderColors.length],
        pointBorderColor: dataset.pointBorderColor || '#ffffff',
        pointBorderWidth: dataset.pointBorderWidth || 2
    }));

    const chartConfig = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: datasets
        },
        options: {
            ...baseOptions,
            ...options.chartOptions
        }
    };

    const chart = new Chart(chartContainer.canvas, chartConfig);
    chartInstances.set(chartContainer.chartId, chart);
    
    return chart;
}

// Create bar chart
export function createBarChart(containerId, data, options = {}) {
    const chartContainer = createChartContainer(containerId, options.title);
    if (!chartContainer) return null;

    const colors = getCurrentThemeColors();
    const baseOptions = getBaseChartOptions('bar');
    
    // Prepare datasets with colors
    const datasets = data.datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: dataset.backgroundColor || colors.dataColors[index % colors.dataColors.length],
        borderColor: dataset.borderColor || colors.borderColors[index % colors.borderColors.length],
        borderWidth: dataset.borderWidth || 1,
        borderRadius: dataset.borderRadius || 4,
        borderSkipped: false
    }));

    const chartConfig = {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: datasets
        },
        options: {
            ...baseOptions,
            ...options.chartOptions
        }
    };

    const chart = new Chart(chartContainer.canvas, chartConfig);
    chartInstances.set(chartContainer.chartId, chart);
    
    return chart;
}

// Create pie chart
export function createPieChart(containerId, data, options = {}) {
    const chartContainer = createChartContainer(containerId, options.title);
    if (!chartContainer) return null;

    const colors = getCurrentThemeColors();
    const baseOptions = getBaseChartOptions('pie');
    
    // Prepare datasets with colors
    const datasets = data.datasets.map((dataset) => ({
        ...dataset,
        backgroundColor: dataset.backgroundColor || colors.dataColors.slice(0, data.labels.length),
        borderColor: dataset.borderColor || colors.borderColors.slice(0, data.labels.length),
        borderWidth: dataset.borderWidth || 2
    }));

    const chartConfig = {
        type: 'pie',
        data: {
            labels: data.labels,
            datasets: datasets
        },
        options: {
            ...baseOptions,
            ...options.chartOptions
        }
    };

    const chart = new Chart(chartContainer.canvas, chartConfig);
    chartInstances.set(chartContainer.chartId, chart);
    
    return chart;
}

// Create radar chart
export function createRadarChart(containerId, data, options = {}) {
    const chartContainer = createChartContainer(containerId, options.title);
    if (!chartContainer) return null;

    const colors = getCurrentThemeColors();
    const baseOptions = getBaseChartOptions('radar');
    
    // Prepare datasets with colors
    const datasets = data.datasets.map((dataset, index) => ({
        ...dataset,
        borderColor: dataset.borderColor || colors.borderColors[index % colors.borderColors.length],
        backgroundColor: dataset.backgroundColor || colors.dataColors[index % colors.dataColors.length],
        borderWidth: dataset.borderWidth || 2,
        pointRadius: dataset.pointRadius || 4,
        pointHoverRadius: dataset.pointHoverRadius || 6,
        pointBackgroundColor: dataset.pointBackgroundColor || colors.borderColors[index % colors.borderColors.length],
        pointBorderColor: dataset.pointBorderColor || '#ffffff',
        pointBorderWidth: dataset.pointBorderWidth || 2
    }));

    // Radar-specific options
    const radarOptions = {
        ...baseOptions,
        scales: {
            r: {
                grid: {
                    color: colors.grid
                },
                angleLines: {
                    color: colors.grid
                },
                ticks: {
                    color: colors.secondaryText,
                    font: {
                        family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        size: 11
                    }
                },
                pointLabels: {
                    color: colors.text,
                    font: {
                        family: 'Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        size: 12
                    }
                }
            }
        }
    };

    const chartConfig = {
        type: 'radar',
        data: {
            labels: data.labels,
            datasets: datasets
        },
        options: {
            ...radarOptions,
            ...options.chartOptions
        }
    };

    const chart = new Chart(chartContainer.canvas, chartConfig);
    chartInstances.set(chartContainer.chartId, chart);
    
    return chart;
}

// Create area chart (line chart with fill)
export function createAreaChart(containerId, data, options = {}) {
    const chartContainer = createChartContainer(containerId, options.title);
    if (!chartContainer) return null;

    const colors = getCurrentThemeColors();
    const baseOptions = getBaseChartOptions('line');
    
    // Prepare datasets with colors and fill
    const datasets = data.datasets.map((dataset, index) => ({
        ...dataset,
        borderColor: dataset.borderColor || colors.borderColors[index % colors.borderColors.length],
        backgroundColor: dataset.backgroundColor || colors.dataColors[index % colors.dataColors.length],
        borderWidth: dataset.borderWidth || 2,
        fill: dataset.fill !== undefined ? dataset.fill : true,
        tension: dataset.tension || 0.4,
        pointRadius: dataset.pointRadius || 3,
        pointHoverRadius: dataset.pointHoverRadius || 5,
        pointBackgroundColor: dataset.pointBackgroundColor || colors.borderColors[index % colors.borderColors.length],
        pointBorderColor: dataset.pointBorderColor || '#ffffff',
        pointBorderWidth: dataset.pointBorderWidth || 2
    }));

    const chartConfig = {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: datasets
        },
        options: {
            ...baseOptions,
            ...options.chartOptions
        }
    };

    const chart = new Chart(chartContainer.canvas, chartConfig);
    chartInstances.set(chartContainer.chartId, chart);
    
    return chart;
}

// Update all charts when theme changes
export function updateChartsTheme() {
    chartInstances.forEach((chart, chartId) => {
        const colors = getCurrentThemeColors();
        
        // Update chart options
        chart.options.plugins.legend.labels.color = colors.text;
        chart.options.plugins.tooltip.backgroundColor = colors.background;
        chart.options.plugins.tooltip.titleColor = colors.text;
        chart.options.plugins.tooltip.bodyColor = colors.text;
        chart.options.plugins.tooltip.borderColor = colors.border;
        
        // Update scales if they exist
        if (chart.options.scales) {
            if (chart.options.scales.x) {
                chart.options.scales.x.grid.color = colors.grid;
                chart.options.scales.x.ticks.color = colors.secondaryText;
                chart.options.scales.x.border.color = colors.border;
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.grid.color = colors.grid;
                chart.options.scales.y.ticks.color = colors.secondaryText;
                chart.options.scales.y.border.color = colors.border;
            }
            if (chart.options.scales.r) {
                chart.options.scales.r.grid.color = colors.grid;
                chart.options.scales.r.angleLines.color = colors.grid;
                chart.options.scales.r.ticks.color = colors.secondaryText;
                chart.options.scales.r.pointLabels.color = colors.text;
            }
        }
        
        // Update dataset colors
        chart.data.datasets.forEach((dataset, index) => {
            if (chart.config.type === 'pie') {
                dataset.backgroundColor = colors.dataColors.slice(0, chart.data.labels.length);
                dataset.borderColor = colors.borderColors.slice(0, chart.data.labels.length);
            } else {
                dataset.borderColor = colors.borderColors[index % colors.borderColors.length];
                dataset.backgroundColor = colors.dataColors[index % colors.dataColors.length];
                if (dataset.pointBackgroundColor) {
                    dataset.pointBackgroundColor = colors.borderColors[index % colors.borderColors.length];
                }
            }
        });
        
        chart.update('none'); // Update without animation for smooth theme transition
    });
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

// Render chart based on configuration
export function renderChart(containerId, chartConfig) {
    if (!chartConfig || !chartConfig.type || !chartConfig.data) {
        console.error('Invalid chart configuration');
        return null;
    }

    const { type, data, options = {} } = chartConfig;

    switch (type.toLowerCase()) {
        case 'line':
            return createLineChart(containerId, data, options);
        case 'bar':
            return createBarChart(containerId, data, options);
        case 'pie':
            return createPieChart(containerId, data, options);
        case 'radar':
            return createRadarChart(containerId, data, options);
        case 'area':
            return createAreaChart(containerId, data, options);
        default:
            console.error(`Unsupported chart type: ${type}`);
            return null;
    }
}

// Clean up chart instances
export function destroyChart(chartId) {
    const chart = chartInstances.get(chartId);
    if (chart) {
        chart.destroy();
        chartInstances.delete(chartId);
    }
}

// Clean up all charts
export function destroyAllCharts() {
    chartInstances.forEach((chart, chartId) => {
        chart.destroy();
    });
    chartInstances.clear();
}