import { orchestrateAgents } from '../agents/agent_orchestrator.js';
import { renderTable, renderChart, parseChartConfig } from './render_tools.js';
import { updateChartsTheme } from './chart_utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Function to set the CSS variable for viewport height
    const setAppHeight = () => {
        const doc = document.documentElement;
        doc.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    // Set height on load and resize
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    setAppHeight(); // Initial set

    // Dynamic cursor alignment function
    const alignCursorWithPlaceholder = (textareaId) => {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        
        const wrapper = textarea.closest('.textarea-wrapper');
        if (!wrapper) return;
        
        const placeholderSpan = wrapper.querySelector('.placeholder-text-span');
        if (!placeholderSpan) return;
        
        // Wait for fonts and images to load
        document.fonts.ready.then(() => {
            // Get bounding rects
            const spanRect = placeholderSpan.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            
            // Horizontal alignment
            const relativeLeft = spanRect.left - wrapperRect.left;
            const cursorOffset = 1; // Fine-tune horizontal
            const alignedPaddingLeft = relativeLeft + cursorOffset;
            textarea.style.paddingLeft = `${alignedPaddingLeft}px`;
            
            // Vertical alignment: Match baseline by adjusting padding-top
            const relativeTop = spanRect.top - wrapperRect.top;
            const verticalOffset = 0; // Fine-tune if needed (e.g., -1 to 1px for baseline)
            const alignedPaddingTop = relativeTop + verticalOffset;
            textarea.style.paddingTop = `${alignedPaddingTop}px`;
            
            // For bottom search, apply same
            if (textareaId === 'query-input-bottom') {
                textarea.style.paddingLeft = `${alignedPaddingLeft}px`;
                textarea.style.paddingTop = `${alignedPaddingTop}px`;
            }
        });
    };

    
    // Function to setup observers for dynamic re-alignment
    const setupAlignmentObservers = (textareaId) => {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;
        
        const wrapper = textarea.closest('.textarea-wrapper');
        if (!wrapper) return;
        
        // Initial alignment
        alignCursorWithPlaceholder(textareaId);
        
        // Re-align on window resize
        window.addEventListener('resize', () => alignCursorWithPlaceholder(textareaId));
        
        // Re-align on font changes
        document.fonts.ready.then(() => alignCursorWithPlaceholder(textareaId));
        
        // Observe mutations in wrapper for any changes
        const observer = new MutationObserver(() => alignCursorWithPlaceholder(textareaId));
        observer.observe(wrapper, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
    };
    
    // Setup for both search boxes
    setupAlignmentObservers('query-input');
    setupAlignmentObservers('query-input-bottom');
    const themeToggle = document.getElementById('theme-toggle');
    const userIconButton = document.getElementById('user-icon-button');
    const userDropdown = document.getElementById('user-dropdown');
    const userProfilePic = document.getElementById('user-profile-pic');
    const userName = document.getElementById('user-name');
    const userInfo = document.getElementById('user-info');
    const signoutButton = document.getElementById('signout-button');
    const firebaseSignInButton = document.getElementById('firebase-sign-in-button'); // Firebase Sign-In button
    const firebasePopupSignInButton = document.getElementById('firebase-popup-sign-in-button'); // Firebase Sign-In button in popup

    // Popup elements
    const rateLimitPopupOverlay = document.getElementById('rate-limit-popup-overlay');
    const rateLimitCooldownTimer = document.getElementById('rate-limit-cooldown-timer');
    const rateLimitDeveloperMessage = document.getElementById('rate-limit-developer-message');
    const rateLimitWaitButton = document.getElementById('rate-limit-wait-button');
    const signinRequiredPopupOverlay = document.getElementById('signin-required-popup-overlay');

    const body = document.body;
    const appWrapper = document.querySelector('.app-wrapper');

    // --- Element References ---
    const mainContent = document.querySelector('.main-content');
    const initialViewContent = document.querySelector('.initial-view-content');
    const bottomSearchWrapper = document.getElementById('bottom-search-wrapper');

    const queryInputTop = document.getElementById('query-input');
    const queryInputBottom = document.getElementById('query-input-bottom');

    const resultsContainer = document.getElementById('results-container');
    const sourcesContainer = document.getElementById('sources-container'); // Get sources container
    const sendBtnTop = document.querySelector('.search-wrapper .send-btn');
    const sendBtnBottom = document.getElementById('send-btn-bottom');
    
    // Query heading elements
    const queryHeading = document.getElementById('query-heading');
    const queryTextContent = document.getElementById('query-text-content');
    const showMoreBtn = document.getElementById('show-more-btn');
    const showLessBtn = document.getElementById('show-less-btn');
    const queryButtons = document.querySelector('.query-buttons');


    const autoResizeTextarea = (textarea) => {
        textarea.style.height = 'auto'; // Important for shrinking
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = parseInt(getComputedStyle(textarea).maxHeight);
        
        if (scrollHeight > maxHeight) {
            textarea.style.height = `${maxHeight}px`;
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.height = `${scrollHeight}px`;
            textarea.style.overflowY = 'hidden';
        }

        if (textarea.value === '') {
            textarea.style.height = ''; // Reset to CSS min-height
            textarea.style.overflowY = 'hidden';
        }
    };

    queryInputTop.addEventListener('input', () => {
        autoResizeTextarea(queryInputTop);
        // Update placeholder visibility immediately
        updatePlaceholderForInput(queryInputTop);
    });

    queryInputBottom.addEventListener('input', () => {
        autoResizeTextarea(queryInputBottom);
        // Update placeholder visibility immediately
        updatePlaceholderForInput(queryInputBottom);
    });

    // Helper function to update placeholder visibility
    const updatePlaceholderForInput = (input) => {
        const wrapper = input.closest('.textarea-wrapper');
        if (!wrapper) return;
        
        const placeholderText = wrapper.querySelector('.placeholder-text-span');
        if (placeholderText) {
            const hasText = input.value.trim() !== '';
            if (input.id === 'query-input-bottom' && hasText) {
                // If bottom input has text, ensure cat icon and arrow are hidden
                const catIcon = wrapper.querySelector('.placeholder-cat-icon');
                const arrowIcon = wrapper.querySelector('.placeholder-arrow-icon');
                if (catIcon) catIcon.style.display = 'none';
                if (arrowIcon) arrowIcon.style.display = 'none';
            } else if (input.id === 'query-input-bottom' && !hasText) {
                 // If bottom input is empty, ensure cat icon and arrow are visible
                const catIcon = wrapper.querySelector('.placeholder-cat-icon');
                const arrowIcon = wrapper.querySelector('.placeholder-arrow-icon');
                if (catIcon) catIcon.style.display = '';
                if (arrowIcon) arrowIcon.style.display = '';
            }
            placeholderText.classList.toggle('hidden', hasText);
            // Also update the wrapper class for CSS-based hiding
            wrapper.classList.toggle('has-content', hasText);
        }
    };


    const applyTheme = (theme) => {
        const isDark = theme === 'dark';
        body.classList.toggle('dark-mode', isDark);
        themeToggle.classList.toggle('toggled', isDark);
        // All styling is now handled by CSS variables, no need for applyThemeStyles
    };

    // Detect device theme preference if no saved theme exists
    const getDefaultTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme;
        }
        // Check device preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    };

    const savedTheme = getDefaultTheme();
    applyTheme(savedTheme); // Initial application of theme and styles

    // Make YouTopia logo clickable to go to home page
    const logoElement = document.querySelector('.logo a');
    if (logoElement) {
        logoElement.style.cursor = 'pointer';
        logoElement.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default link behavior
            // Navigate to home page
            window.location.href = '/';
        });
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = body.classList.contains('dark-mode') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
        updateChartsTheme();
    });

    // Listen for system theme changes and update if no user preference is saved
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only auto-update if user hasn't manually set a preference
            if (!localStorage.getItem('theme')) {
                const newTheme = e.matches ? 'dark' : 'light';
                applyTheme(newTheme);
                updateChartsTheme();
            }
        });
    }

    setTimeout(() => {
        appWrapper.classList.add('show');
    }, 100);
    // --- Firebase Sign-In handling ---

    const updateUserUI = async (user) => {
        if (user) {
            // User is signed in.
            userName.textContent = user.displayName;
            userProfilePic.src = user.photoURL;
            userInfo.style.display = 'flex';
            firebaseSignInButton.style.display = 'none';
            signoutButton.style.display = 'block';
            userDropdown.classList.add('signed-in');

            try {
                const idToken = await user.getIdToken(true); // Force refresh the token
                console.log('Firebase ID Token obtained and stored.');
                localStorage.setItem('id_token', idToken);
                localStorage.setItem('user_name', user.displayName);
                localStorage.setItem('user_email', user.email);
                localStorage.setItem('user_profile_pic', user.photoURL);
            } catch (error) {
                console.error('Error getting ID token:', error);
                // Handle error, maybe sign the user out
                window.firebaseSignOut();
            }
        } else {
            // User is signed out.
            userName.textContent = '';
            userProfilePic.src = '';
            userInfo.style.display = 'none';
            firebaseSignInButton.style.display = 'block';
            signoutButton.style.display = 'none';
            userDropdown.classList.remove('signed-in');

            // Clear all user-related data from localStorage
            localStorage.removeItem('user_name');
            localStorage.removeItem('user_email');
            localStorage.removeItem('user_profile_pic');
            localStorage.removeItem('id_token');
        }
    };

    // Firebase Auth state change listener
    window.firebaseAuth.onAuthStateChanged(async (user) => {
        await updateUserUI(user);
        if (user) {
            hidePopup(signinRequiredPopupOverlay); // Hide sign-in popup if it was open
        }
    });

    // Event listener for Firebase Sign-In button
    firebaseSignInButton.addEventListener('click', async () => {
        try {
            await window.firebaseSignIn();
        } catch (error) {
            console.error('Error during Firebase Sign-In:', error);
            alert('Firebase Sign-In failed. Please try again.');
        }
    });

    // Event listener for Firebase Sign-In button in popup
    firebasePopupSignInButton.addEventListener('click', async () => {
        try {
            await window.firebaseSignIn();
        } catch (error) {
            console.error('Error during Firebase Sign-In from popup:', error);
            alert('Firebase Sign-In failed. Please try again.');
        }
    });

    // Event listener for Sign Out button
    signoutButton.addEventListener('click', async () => {
        try {
            await window.firebaseSignOut();
        } catch (error) {
            console.error('Error during Firebase Sign-Out:', error);
            alert('Firebase Sign-Out failed. Please try again.');
        }
    });

   // --- Popup Functions ---
   const showPopup = (popupElement) => {
       popupElement.classList.add('show');
   };

   const hidePopup = (popupElement) => {
       popupElement.classList.remove('show');
   };

   // Initial UI update on page load
   updateUserUI();

   // Event listeners for user dropdown (now handled by generic dropdown logic in index.html)
   // userIconButton.addEventListener('click', (e) => {
   //     e.stopPropagation();
   //     userDropdown.classList.toggle('show');
   // });

   // document.addEventListener('click', (e) => {
   //     if (!userDropdown.contains(e.target) && !userIconButton.contains(e.target)) {
   //         userDropdown.classList.remove('show');
   //     }
   // });

   userDropdown.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing when clicking inside
   signoutButton.addEventListener('click', window.firebaseSignOut); // Sign out button listener
   rateLimitWaitButton.addEventListener('click', () => hidePopup(rateLimitPopupOverlay)); // "I'll wait" button listener


    // Hide the bottom bar initially
    bottomSearchWrapper.style.display = 'none';

    document.querySelectorAll('.example-prompt-btn').forEach(button => {
        button.addEventListener('click', () => {
            const query = button.getAttribute('data-query');
            queryInputTop.value = query;
            // Manually trigger input event to hide placeholder and resize textarea
            queryInputTop.dispatchEvent(new Event('input'));
            // Also manually update placeholder visibility
            updatePlaceholderForInput(queryInputTop);
            queryInputTop.focus();
        });
    });
    
    const logStep = (message) => {
        const logList = document.getElementById('log-list');
        if (logList) {
            const li = document.createElement('li');
            li.innerHTML = message; // Use innerHTML to allow icons
            logList.appendChild(li);
            logList.scrollTop = logList.scrollHeight; // Scroll to bottom
        }
    };
const renderSourceCards = (sources, container) => {
        container.innerHTML = ''; // Clear previous content
        if (!sources || sources.length === 0) {
            return;
        }

        const sourcesListDiv = document.createElement('div');
        sourcesListDiv.classList.add('sources-list'); // For styling the grid/flex layout of sources

        sources.forEach((source, index) => {
            const sourceCard = document.createElement('a');
            sourceCard.href = source.url;
            sourceCard.target = '_blank'; // Open in new tab
            sourceCard.rel = 'noopener noreferrer';
            sourceCard.classList.add('source-card');

            // Optional: Add favicon. You might need a service to fetch favicons dynamically
            // For now, a generic icon or a simple text fallback
            let faviconHtml = '';
            try {
                const urlObj = new URL(source.url);
                faviconHtml = `<img src="https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32" class="source-favicon" alt="Favicon">`;
            } catch (e) {
                faviconHtml = `<i class="fas fa-link source-favicon-fallback"></i>`;
            }

            sourceCard.innerHTML = `
                <div class="source-header">
                    ${faviconHtml}
                    <div class="source-info">
                        <div class="source-number">${source.number}.</div>
                        <div class="source-title">${source.title}</div>
                    </div>
                </div>
                <div class="source-url">${source.url}</div>
                ${source.snippet ? `<div class="source-snippet">${source.snippet}</div>` : ''}
            `;
            sourcesListDiv.appendChild(sourceCard);
        });
        container.appendChild(sourcesListDiv);
    };

    const renderCodeHighlighting = (container) => {
        // Highlight code blocks only
        container.querySelectorAll('pre code').forEach((block) => {
            Prism.highlightElement(block);
        });
    };

    // Export panel functionality
    const addExportPanel = (aiResponseElement, aiResponseContent) => {
        // Count words in the response
        const wordCount = countWords(aiResponseContent);
        
        // Add unique ID to aiResponseElement if it doesn't have one
        if (!aiResponseElement.id) {
            aiResponseElement.id = `ai-response-${Date.now()}`;
        }
        
        // Create export panel
        const exportPanel = document.createElement('div');
        exportPanel.classList.add('export-panel');
        
        exportPanel.innerHTML = `
            <div class="export-info">
                <span class="word-count">${wordCount} words</span>
            </div>
            <div class="export-actions">
                <button class="export-btn pdf-btn" onclick="exportToPDF('${aiResponseElement.id}')">
                    <i class="fas fa-file-pdf"></i>
                    PDF
                </button>
                <button class="export-btn md-btn" onclick="exportToMarkdown()">
                    <i class="fab fa-markdown"></i>
                    MD
                </button>
                <button class="export-btn copy-btn" onclick="copyToText()">
                    <i class="fas fa-copy"></i>
                    Copy
                </button>
            </div>
        `;
        
        // Insert export panel after the AI response
        aiResponseElement.insertAdjacentElement('afterend', exportPanel);
    };

    const countWords = (text) => {
        // Remove markdown syntax and count words
        const cleanText = text
            .replace(/#{1,6}\s+/g, '') // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
            .replace(/[^\w\s]/g, ' ') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        
        return cleanText ? cleanText.split(' ').length : 0;
    };

    // Global export functions
    window.exportToPDF = async (elementId) => {
        try {
            // Show loading feedback
            const pdfBtn = document.querySelector('.pdf-btn');
            if (pdfBtn) {
                const originalText = pdfBtn.innerHTML;
                pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                pdfBtn.disabled = true;
            }
            
            // Load libraries if not available
            if (typeof window.jspdf === 'undefined') {
                await loadPDFLibraries();
            }
            
            console.log('Looking for element with ID:', elementId);
            let element = document.getElementById(elementId);
            console.log('Found element:', element);
            
            if (!element) {
                console.error('Element not found with ID:', elementId);
                // Try to find the latest AI response element as fallback
                const fallbackElement = document.querySelector('.ai-response:last-of-type');
                if (fallbackElement) {
                    console.log('Using fallback element:', fallbackElement);
                    element = fallbackElement;
                } else {
                    alert('Content not found for PDF export. No AI response found.');
                    return;
                }
            }
            
            // Use the correct jsPDF constructor
            const { jsPDF } = window.jspdf || window;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            // PDF dimensions
            const pageWidth = 210;
            const pageHeight = 297;
            const margin = 20;
            const contentWidth = pageWidth - (2 * margin);
            let currentY = margin;
            
            // Set default font
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            
            // Process content by extracting text, charts, and tables separately
            await processContentForPDF(element, pdf, margin, contentWidth, currentY, pageHeight);
            
            pdf.save('youtopia-search.pdf');
            
            // Reset button
            if (pdfBtn) {
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
                pdfBtn.disabled = false;
            }
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF: ' + error.message);
            
            // Reset button on error
            const pdfBtn = document.querySelector('.pdf-btn');
            if (pdfBtn) {
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
                pdfBtn.disabled = false;
            }
        }
    };

    // Process content for PDF with proper handling of text, charts, and tables
    async function processContentForPDF(element, pdf, margin, contentWidth, startY, pageHeight) {
        let currentY = startY;
        const lineHeight = 6;
        const maxY = pageHeight - margin;
        
        // Add YouTopia branding header
        currentY = await addYoutopiaHeader(pdf, margin, contentWidth, currentY);
        
        // Get the markdown content if available
        const markdownContent = currentResponseContent || element.textContent;
        
        // Split content into sections
        const sections = parseContentSections(element);
        
        for (const section of sections) {
            // Check if we need a new page
            if (currentY > maxY - 30) {
                pdf.addPage();
                currentY = margin;
                // Add header to new pages too
                currentY = await addYoutopiaHeader(pdf, margin, contentWidth, currentY);
            }
            
            switch (section.type) {
                case 'text':
                    currentY = await addTextToPDF(pdf, section.content, margin, contentWidth, currentY, lineHeight, maxY);
                    break;
                case 'chart':
                    currentY = await addChartToPDF(pdf, section.element, margin, contentWidth, currentY, maxY, pageHeight);
                    break;
                case 'table':
                    currentY = await addTableToPDF(pdf, section.element, margin, contentWidth, currentY, maxY);
                    break;
            }
        }
        
        // Add footer with branding
        addYoutopiaFooter(pdf, margin, contentWidth, pageHeight);
    }
    
    // Parse content into sections (text, charts, tables)
    function parseContentSections(element) {
        const sections = [];
        const children = Array.from(element.children);
        
        for (const child of children) {
            if (child.classList.contains('chart-display') || child.classList.contains('chart-wrapper')) {
                sections.push({ type: 'chart', element: child });
            } else if (child.classList.contains('table-display') || child.classList.contains('gridjs-wrapper')) {
                sections.push({ type: 'table', element: child });
            } else if (child.classList.contains('export-panel')) {
                // Skip export panels
                continue;
            } else {
                // Text content
                const textContent = child.textContent.trim();
                if (textContent) {
                    sections.push({ type: 'text', content: textContent });
                }
            }
        }
        
        return sections;
    }
    
    // Add text to PDF with proper wrapping
    async function addTextToPDF(pdf, text, margin, contentWidth, currentY, lineHeight, maxY) {
        const lines = pdf.splitTextToSize(text, contentWidth);
        
        for (const line of lines) {
            if (currentY > maxY) {
                pdf.addPage();
                currentY = margin;
            }
            
            pdf.text(line, margin, currentY);
            currentY += lineHeight;
        }
        
        return currentY + lineHeight; // Add extra space after text block
    }
    
    // Add chart to PDF as PNG image
    async function addChartToPDF(pdf, chartElement, margin, contentWidth, currentY, maxY, pageHeight) {
        try {
            // Find the canvas element within the chart
            const canvas = chartElement.querySelector('canvas');
            if (!canvas) {
                console.warn('No canvas found in chart element');
                return currentY;
            }

            // Calculate chart dimensions with better aspect ratio
            const chartAspectRatio = canvas.width / canvas.height;
            const chartHeight = 120; // Increased height in mm for better quality
            const chartWidth = Math.min(contentWidth, chartHeight * chartAspectRatio);

            // Check if chart fits on current page, if not start new page
            if (currentY + chartHeight > maxY) {
                pdf.addPage();
                currentY = margin;
            }

            // Apply dark mode colors to the chart before exporting
            const isDarkMode = document.body.classList.contains('dark-mode');
            if (isDarkMode) {
                // Temporarily apply dark mode colors to the chart
                const originalStyle = canvas.style.cssText;
                canvas.style.filter = 'brightness(0.8) contrast(1.2)';

                // Get chart image data with higher quality
                const chartImageData = canvas.toDataURL('image/png', 1.0); // Highest quality

                // Restore original style
                canvas.style.cssText = originalStyle;

                // Add chart to PDF
                pdf.addImage(chartImageData, 'PNG', margin, currentY, chartWidth, chartHeight);
            } else {
                // Get chart image data with higher quality
                const chartImageData = canvas.toDataURL('image/png', 1.0); // Highest quality

                // Add chart to PDF
                pdf.addImage(chartImageData, 'PNG', margin, currentY, chartWidth, chartHeight);
            }

            return currentY + chartHeight + 10; // Add space after chart

        } catch (error) {
            console.error('Error adding chart to PDF:', error);
            return currentY;
        }
    }
    
    // Add table to PDF with proper formatting
    async function addTableToPDF(pdf, tableElement, margin, contentWidth, currentY, maxY) {
        try {
            // Extract table data
            const tableData = extractTableData(tableElement);
            if (!tableData || !tableData.headers || !tableData.rows) {
                return currentY;
            }
            
            // Calculate table dimensions
            const colWidth = contentWidth / tableData.headers.length;
            const rowHeight = 8;
            const headerHeight = 10;
            
            // Check if table header fits on current page
            if (currentY + headerHeight > maxY) {
                pdf.addPage();
                currentY = margin;
            }
            
            // Draw table header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            
            for (let i = 0; i < tableData.headers.length; i++) {
                const x = margin + (i * colWidth);
                pdf.rect(x, currentY, colWidth, headerHeight);
                pdf.text(tableData.headers[i], x + 2, currentY + 7);
            }
            
            currentY += headerHeight;
            
            // Draw table rows
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            
            for (const row of tableData.rows) {
                // Check if row fits on current page
                if (currentY + rowHeight > maxY) {
                    pdf.addPage();
                    currentY = margin;
                    
                    // Redraw header on new page
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(10);
                    for (let i = 0; i < tableData.headers.length; i++) {
                        const x = margin + (i * colWidth);
                        pdf.rect(x, currentY, colWidth, headerHeight);
                        pdf.text(tableData.headers[i], x + 2, currentY + 7);
                    }
                    currentY += headerHeight;
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                }
                
                for (let i = 0; i < row.length && i < tableData.headers.length; i++) {
                    const x = margin + (i * colWidth);
                    pdf.rect(x, currentY, colWidth, rowHeight);
                    
                    // Truncate long text to fit in cell
                    const cellText = String(row[i] || '').substring(0, 20);
                    pdf.text(cellText, x + 2, currentY + 6);
                }
                
                currentY += rowHeight;
            }
            
            return currentY + 10; // Add space after table
            
        } catch (error) {
            console.error('Error adding table to PDF:', error);
            return currentY;
        }
    }
    
    // Extract table data from DOM element
    function extractTableData(tableElement) {
        try {
            // Try to find GridJS table first
            const gridTable = tableElement.querySelector('.gridjs-table');
            if (gridTable) {
                const headers = Array.from(gridTable.querySelectorAll('.gridjs-th')).map(th => th.textContent.trim());
                const rows = Array.from(gridTable.querySelectorAll('.gridjs-tr')).map(tr => 
                    Array.from(tr.querySelectorAll('.gridjs-td')).map(td => td.textContent.trim())
                );
                return { headers, rows };
            }
            
            // Try regular HTML table
            const htmlTable = tableElement.querySelector('table');
            if (htmlTable) {
                const headers = Array.from(htmlTable.querySelectorAll('th')).map(th => th.textContent.trim());
                const rows = Array.from(htmlTable.querySelectorAll('tbody tr')).map(tr => 
                    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
                );
                return { headers, rows };
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting table data:', error);
            return null;
        }
    }
    
    // Add YouTopia header with logo and branding
    async function addYoutopiaHeader(pdf, margin, contentWidth, currentY) {
        try {
            // Load and convert cursor.svg to base64
            const logoData = await loadSVGAsBase64('/svg/cursor.svg');
            
            // Add logo (small size)
            const logoSize = 8; // 8mm
            pdf.addImage(logoData, 'PNG', margin, currentY, logoSize, logoSize);
            
            // Add YouTopia branding text
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.setTextColor(50, 50, 50); // Dark gray
            pdf.text('YouTopia', margin + logoSize + 5, currentY + 6);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100); // Medium gray
            pdf.text('Intelligently Human AI Assistant', margin + logoSize + 5, currentY + 12);
            
            // Add a subtle line separator
            pdf.setDrawColor(200, 200, 200); // Light gray
            pdf.setLineWidth(0.5);
            pdf.line(margin, currentY + 18, margin + contentWidth, currentY + 18);
            
            // Reset text color to black for content
            pdf.setTextColor(0, 0, 0);
            
            return currentY + 25; // Return new Y position after header
            
        } catch (error) {
            console.error('Error adding header:', error);
            // Fallback to text-only header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.setTextColor(50, 50, 50);
            pdf.text('YouTopia - Intelligently Human AI Assistant', margin, currentY + 6);
            
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.5);
            pdf.line(margin, currentY + 12, margin + contentWidth, currentY + 12);
            
            pdf.setTextColor(0, 0, 0);
            return currentY + 20;
        }
    }
    
    // Add YouTopia footer with branding
    function addYoutopiaFooter(pdf, margin, contentWidth, pageHeight) {
        const footerY = pageHeight - 15;
        
        // Add footer line
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.line(margin, footerY - 5, margin + contentWidth, footerY - 5);
        
        // Add footer text
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        
        // Left side - Generated by YouTopia with website link
        pdf.text('Generated by YouTopia AI Assistant - youtopia.co.in', margin, footerY);
        
        // Right side - Date
        const currentDate = new Date().toLocaleDateString();
        const dateText = `Generated on ${currentDate}`;
        const dateWidth = pdf.getTextWidth(dateText);
        pdf.text(dateText, margin + contentWidth - dateWidth, footerY);
        
        // Reset text color
        pdf.setTextColor(0, 0, 0);
    }
    
    // Load SVG and convert to base64 PNG for PDF
    async function loadSVGAsBase64(svgPath) {
        return new Promise((resolve, reject) => {
            fetch(svgPath)
                .then(response => response.text())
                .then(svgText => {
                    // Create a canvas to convert SVG to PNG
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    
                    // Set canvas size
                    canvas.width = 64;
                    canvas.height = 64;
                    
                    // Create blob URL from SVG
                    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(svgBlob);
                    
                    img.onload = function() {
                        // Fill with white background
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Draw SVG
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        // Convert to base64
                        const base64 = canvas.toDataURL('image/png');
                        URL.revokeObjectURL(url);
                        resolve(base64);
                    };
                    
                    img.onerror = function() {
                        URL.revokeObjectURL(url);
                        reject(new Error('Failed to load SVG'));
                    };
                    
                    img.src = url;
                })
                .catch(reject);
        });
    }

    // Function to load PDF libraries
    const loadPDFLibraries = () => {
        return new Promise((resolve, reject) => {
            // Load jsPDF
            if (typeof window.jspdf === 'undefined') {
                const jsPDFScript = document.createElement('script');
                jsPDFScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                jsPDFScript.onload = () => {
                    console.log('jsPDF loaded');
                    // Give a small delay to ensure library is fully initialized
                    setTimeout(() => {
                        if (typeof window.jspdf !== 'undefined') {
                            resolve();
                        } else {
                            reject(new Error('jsPDF loaded but not properly initialized'));
                        }
                    }, 100);
                };
                jsPDFScript.onerror = () => reject(new Error('Failed to load jsPDF'));
                document.head.appendChild(jsPDFScript);
            } else {
                resolve();
            }
        });
    };

    // Store the current response content globally for export functions
    let currentResponseContent = '';

    window.exportToMarkdown = () => {
        if (!currentResponseContent) {
            alert('No content available for export.');
            return;
        }
        
        // Use the stored markdown content directly
        let markdown = currentResponseContent;
        
        // Clean up any remaining HTML that might have been in the content
        markdown = markdown
            .replace(/<[^>]*>/g, '') // Remove any HTML tags
            .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
            .trim();
        
        // Add YouTopia branding header
        const currentDate = new Date().toLocaleDateString();
        const youtopiaHeader = `# YouTopia Search Results

**Generated by YouTopia AI Assistant**  
*Intelligently Human AI Assistant*  
Website: [youtopia.co.in](https://youtopia.co.in)  
Generated on: ${currentDate}

---

`;
        
        // Combine header with content
        const finalMarkdown = youtopiaHeader + markdown;
        
        // Create and download file
        const blob = new Blob([finalMarkdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'youtopia-search.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    window.copyToText = () => {
        if (!currentResponseContent) {
            alert('No content available to copy.');
            return;
        }
        
        // Convert markdown to plain text
        let plainText = currentResponseContent
            .replace(/#{1,6}\s+/g, '') // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
            .replace(/[^\w\s\n.,!?;:-]/g, ' ') // Remove special characters except basic punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        
        navigator.clipboard.writeText(plainText).then(() => {
            // Show feedback
            const copyBtn = document.querySelector('.copy-btn:last-of-type');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy text:', err);
            alert('Failed to copy text. Please try again.');
        });
    };

    // --- Rate Limit Display Function ---
    let cooldownInterval; // To store the interval for the cooldown timer

    const displayRateLimitPopup = (cooldownEndTimestamp, developerMessage) => {
        const now = Date.now();
        const timeLeftMs = cooldownEndTimestamp - now;

        if (timeLeftMs <= 0) {
            rateLimitCooldownTimer.textContent = '00:00:00';
            rateLimitDeveloperMessage.innerHTML = `<p>${developerMessage}</p>`;
            showPopup(rateLimitPopupOverlay);
            return;
        }

        // Clear any existing interval to prevent multiple timers running
        if (cooldownInterval) {
            clearInterval(cooldownInterval);
        }

        const updateTimer = () => {
            const remainingMs = cooldownEndTimestamp - Date.now();

            if (remainingMs <= 0) {
                clearInterval(cooldownInterval);
                rateLimitCooldownTimer.textContent = '00:00:00';
                rateLimitDeveloperMessage.innerHTML = `<p>${developerMessage}</p><p>You can now try your query again.</p>`;
                return;
            }

            const totalSeconds = Math.floor(remainingMs / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            const formatTime = (num) => String(num).padStart(2, '0');
            rateLimitCooldownTimer.textContent = `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
            rateLimitDeveloperMessage.innerHTML = `<p>${developerMessage}</p>`;
        };

        updateTimer(); // Initial call
        cooldownInterval = setInterval(updateTimer, 1000); // Update every second
        showPopup(rateLimitPopupOverlay);
    };

    // --- Main Search Handler ---
    const handleSearch = async (query, sourceElement = null) => {
        const userEmail = localStorage.getItem('user_email');
        const userName = localStorage.getItem('user_name');
        const idToken = localStorage.getItem('id_token'); // Get the ID Token

        if (!userEmail || !idToken) { // Also check for the token
            console.warn('User email or ID token is missing. Showing sign-in popup.');
            showPopup(signinRequiredPopupOverlay);
            return; // Prevent search if not signed in or token is missing
        }

        const isBottomSearch = sourceElement && sourceElement.id === 'query-input-bottom';
        let selectedModel = isBottomSearch ? 'Amaya' : (document.getElementById('selected-model')?.textContent || 'Amaya');
        const isShortResponseEnabled = document.getElementById('short-response-toggle').classList.contains('active');

        // Get user's local time string
        const userLocalTime = new Date().toLocaleString();

        if (!query.trim()) return;

        resultsContainer.innerHTML = '';
        sourcesContainer.innerHTML = '';

        // Check if log container already exists from a previous search
        let logContainer = document.getElementById('live-log-container');
        let logList;

        if (logContainer) {
            // If exists, clear its content and reset its state
            logList = document.getElementById('log-list');
            if (logList) logList.innerHTML = ''; // Clear previous log messages
            logContainer.classList.remove('is-done', 'has-error'); // Clear state
            logContainer.classList.add('is-active'); // Ensure it's active (blue animation)
        } else {
            // If not, create and insert it
            const logHTML = `
                <div id="live-log-container" class="is-active">
                    <div class="log-header" id="log-header-toggle">
                        <h4>Live Execution Log</h4>
                        <button id="log-toggle-btn" title="Toggle Log"><i class="fas fa-chevron-up"></i></button>
                    </div>
                    <ul id="log-list"></ul>
                </div>`;
            
            const tabsDiv = document.querySelector('.tabs');
            if (tabsDiv) { // Ensure tabsDiv exists before inserting
                tabsDiv.insertAdjacentHTML('afterend', logHTML);
                logContainer = document.getElementById('live-log-container'); // Get reference to the newly created container
                logList = document.getElementById('log-list'); // Get reference to the new log list
            }
        }
        
        renderCodeHighlighting(resultsContainer);
        
        // Initialize the log
        logStep('<i class="fas fa-search"></i> Orchestrating a search...');
        
        if (!body.classList.contains('search-active')) {
            initialViewContent.style.display = 'none';
            bottomSearchWrapper.style.display = 'flex';
            body.classList.add('search-active');

            // Trigger placeholder visibility update for bottom search box
            const bottomWrapper = queryInputBottom.closest('.textarea-wrapper');
            if (bottomWrapper) {
                const bottomPlaceholderText = bottomWrapper.querySelector('.placeholder-text-span');
                if (bottomPlaceholderText) {
                    bottomPlaceholderText.classList.remove('hidden');
                }
            }

            // Change placeholder for follow-up questions
            const bottomPlaceholderSpan = document.querySelector('#bottom-search-wrapper .placeholder-text-span');
            if (bottomPlaceholderSpan) {
                bottomPlaceholderSpan.textContent = 'Ask a follow up question';
            }
        }

        // Display the query as a Markdown heading
        // queryHeading.textContent = `Query: ${query}`; // Will be handled by truncateQueryText
        
        const originalQueryText = `${query.trim()}`;
        queryTextContent.textContent = originalQueryText;
        // Temporarily remove max-height to get true scrollHeight
        queryHeading.style.maxHeight = 'none';
        queryHeading.classList.remove('expanded'); // Ensure not in expanded state
        // Use a small delay to ensure rendering before checking scrollHeight
        setTimeout(() => {
            const currentHeight = queryTextContent.scrollHeight;
            const lineHeight = parseFloat(getComputedStyle(queryTextContent).lineHeight);
            const targetMaxHeight = Math.min(120, Math.max(lineHeight * 1.5, currentHeight)); // At least 1.5 lines, up to 120px
            if (currentHeight > targetMaxHeight) { // Check against desired initial height
                queryHeading.style.maxHeight = `${targetMaxHeight}px`; // Apply initial max height
                showMoreBtn.style.display = 'block';
                showLessBtn.style.display = 'none';
                queryButtons.classList.add('show-gradient'); // Show gradient
            } else {
                queryHeading.style.maxHeight = 'none'; // No max height for short content
                showMoreBtn.style.display = 'none';
                showLessBtn.style.display = 'none';
                queryButtons.classList.remove('show-gradient'); // Hide gradient
            }
        }, 0); // Use setTimeout with 0 for next tick execution
        
        // Set button state to loading
        setSendButtonState(true);
        try {
            logStep(`<i class="fas fa-brain"></i> Generating response for: "<b>${query.trim()}</b>"`);

            let aiResponseContent = ''; // Accumulate streamed content here
            const aiResponseElement = document.createElement('div');
            aiResponseElement.classList.add('ai-response');
            resultsContainer.appendChild(aiResponseElement);

            const streamCallback = (chunk) => {
                aiResponseContent += chunk;
                
                // Store the current response content for export functions
                currentResponseContent = aiResponseContent;
                // Before parsing, extract sources if they are present
                const sourcesRegex = /## Sources\n([\s\S]*)/;
                const match = aiResponseContent.match(sourcesRegex);
                let contentToRender = aiResponseContent;
                let sourcesMarkdown = '';

                if (match) {
                    sourcesMarkdown = match[1];
                    contentToRender = aiResponseContent.replace(sourcesRegex, '').trim();

                    // Preprocess sourcesMarkdown to convert plain URLs into markdown links
                    const parsedSources = sourcesMarkdown.split('\n').map(line => {
                        const sourceRegex = /^(\d+)\.\s*\[([^\]]+)\]\((https?:\/\/[^\)]+)\)(?:\s*-\s*(.*))?$/;
                        const match = line.match(sourceRegex);
                        if (match) {
                            const number = match[1];
                            const title = match[2];
                            const url = match[3];
                            const snippet = match[4] || '';
                            return { number, title, url, snippet };
                        }
                        // Fallback for old/simple URL format
                        const urlMatch = line.match(/^(\d+\.\s*)(https?:\/\/\S+)$/);
                        if (urlMatch) {
                            const number = urlMatch[1].replace('.', '');
                            const url = urlUrl[2];
                            let title = url; // Default title is the URL
                            try {
                                const urlObj = new URL(url);
                                title = urlObj.hostname.replace('www.', ''); // Use hostname as title
                            } catch (e) { /* invalid URL */ }
                            return { number, title, url, snippet: '' };
                        }
                        return null; // Ignore lines that don't match source format
                    }).filter(Boolean); // Remove null entries

                    renderSourceCards(parsedSources, sourcesContainer);
                }

                aiResponseElement.innerHTML = marked.parse(contentToRender);
                renderCodeHighlighting(aiResponseElement); // Re-render highlights
                // Only auto-scroll if the user is near the bottom
                const isScrolledToBottom = resultsContainer.scrollHeight - resultsContainer.clientHeight <= resultsContainer.scrollTop + 1; // +1 for a small buffer
                if (isScrolledToBottom) {
                    resultsContainer.scrollTop = resultsContainer.scrollHeight;
                }

                // Process charts within the stream callback
                aiResponseElement.querySelectorAll('pre code.language-chart').forEach((codeBlock, index) => {
                    // Show processing message immediately
                    const chartContainerId = `chart-container-${Date.now()}-${index}`;
                    const chartDiv = document.createElement('div');
                    chartDiv.id = chartContainerId;
                    chartDiv.classList.add('chart-display');
                    chartDiv.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 8px; margin: 10px 0;">
                            <i class="fas fa-chart-line" style="font-size: 24px; margin-bottom: 8px; opacity: 0.6;"></i>
                            <div style="font-size: 14px;">Processing chart block...</div>
                        </div>
                    `;

                    codeBlock.parentNode.parentNode.insertBefore(chartDiv, codeBlock.parentNode);
                    codeBlock.parentNode.remove();

                    // Process chart asynchronously without showing errors during streaming
                    setTimeout(() => {
                        try {
                            let chartConfigText = codeBlock.textContent.trim();
                            if (!chartConfigText) {
                                throw new Error('Empty chart configuration');
                            }

                            // Clean up the JSON format
                            chartConfigText = chartConfigText.replace(/(\w+):/g, "\"$1\":");
                            let chartConfig;
                            try {
                                chartConfig = JSON.parse(chartConfigText);
                            } catch (parseError) {
                                // Try to fix common JSON issues
                                let cleanedText = chartConfigText;
                                cleanedText = cleanedText.replace(/\"(\w+):\"/g, "\"$1\":");
                                cleanedText = cleanedText.replace(/}\s*{/g, '},{');
                                cleanedText = cleanedText.replace(/}\s*]/g, '}]');
                                cleanedText = cleanedText.replace(/}\s*\]/g, '}]');
                                try {
                                    chartConfig = JSON.parse(cleanedText);
                                } catch (secondParseError) {
                                    throw new Error(`Invalid chart configuration format`);
                                }
                            }

                            if (!chartConfig.type) {
                                throw new Error('Chart configuration is missing "type" property');
                            }
                            if (!chartConfig.data) {
                                throw new Error('Chart configuration is missing "data" property');
                            }

                            // Clear processing message and render chart
                            chartDiv.innerHTML = '';
                            renderChart(chartContainerId, chartConfig);
                        } catch (e) {
                            console.error("Error processing chart:", e);
                            console.error("Chart content was:", codeBlock.textContent);
                            chartDiv.innerHTML = `
                                <div style="padding: 15px; border: 1px solid var(--error-color, #e74c3c); border-radius: 8px; background-color: var(--error-bg, #fdf2f2); color: var(--error-color, #e74c3c); margin: 10px 0;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        <strong>Chart Processing Error</strong>
                                    </div>
                                    <div style="font-size: 14px; opacity: 0.9;">${e.message}</div>
                                </div>
                            `;
                        }
                    }, 500); // Delay to allow streaming to complete
                });

                // Process tables within the stream callback
                aiResponseElement.querySelectorAll('pre code.language-table').forEach((codeBlock, index) => {
                    // Show processing message immediately
                    const tableContainerId = `table-container-${Date.now()}-${index}`;
                    const tableDiv = document.createElement('div');
                    tableDiv.id = tableContainerId;
                    tableDiv.classList.add('table-display');
                    tableDiv.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 8px; margin: 10px 0;">
                            <i class="fas fa-table" style="font-size: 24px; margin-bottom: 8px; opacity: 0.6;"></i>
                            <div style="font-size: 14px;">Processing table block...</div>
                        </div>
                    `;

                    codeBlock.parentNode.parentNode.insertBefore(tableDiv, codeBlock.parentNode);
                    codeBlock.parentNode.remove();

                    // Process table asynchronously without showing errors during streaming
                    setTimeout(() => {
                        try {
                            let tableConfigText = codeBlock.textContent.trim();
                            if (!tableConfigText) {
                                throw new Error('Empty table configuration');
                            }

                            // Robust JSON parsing with strict validation
                            let tableConfig;
                            
                            // Step 1: Clean and normalize the input
                            let cleanedText = tableConfigText
                                .trim()
                                .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove non-printable characters
                                .replace(/^\s*```\s*table\s*/i, '') // Remove table code block markers
                                .replace(/\s*```\s*$/i, '')
                                .trim();
                            
                            // AGGRESSIVE CONTENT SANITIZATION
                            // Remove problematic characters that cause JSON parsing issues
                            cleanedText = cleanedText
                                .replace(/[""'']/g, '"') // Normalize all quote types to standard double quotes
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

                            // Simple cleanup for common issues
                            cleanedText = cleanedText
                                .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted property names
                                .replace(/'/g, '"') // Convert single quotes to double quotes
                                .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                                .replace(/([}\]])(\s*)([{\[])/g, '$1,$2$3'); // Add missing commas between objects/arrays

                            // CRITICAL: Sanitize cell content to prevent JSON parsing errors
                            // Find all string values in arrays and sanitize them
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
                            try {
                                tableConfig = JSON.parse(cleanedText);
                            } catch (parseError) {
                                console.error('JSON parsing failed:', parseError.message);
                                console.error('Cleaned text:', cleanedText);
                                throw new Error(`Invalid table JSON format. Error: ${parseError.message}. Expected simple format: {"headers": ["Col1", "Col2"], "data": [["Row1Col1", "Row1Col2"]]}`);
                            }

                            // FINAL SAFETY NET: Clean the parsed object
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

                            // Step 5: Strict validation of table structure
                            if (!tableConfig || typeof tableConfig !== 'object') {
                                throw new Error('Table configuration must be a valid object');
                            }
                            
                            // Check for only allowed properties
                            const allowedProps = ['headers', 'data'];
                            const actualProps = Object.keys(tableConfig);
                            const invalidProps = actualProps.filter(prop => !allowedProps.includes(prop));
                            if (invalidProps.length > 0) {
                                throw new Error(`Invalid properties found: ${invalidProps.join(', ')}. Only "headers" and "data" are allowed`);
                            }
                            
                            // Validate headers
                            if (!tableConfig.headers) {
                                throw new Error('Table configuration is missing "headers" property');
                            }
                            if (!Array.isArray(tableConfig.headers)) {
                                throw new Error('Headers must be an array');
                            }
                            if (tableConfig.headers.length === 0) {
                                throw new Error('Headers array cannot be empty');
                            }

                            
                            // Validate header values
                            for (let i = 0; i < tableConfig.headers.length; i++) {
                                const header = tableConfig.headers[i];
                                if (typeof header !== 'string') {
                                    throw new Error(`Header at index ${i} must be a string, got ${typeof header}`);
                                }
                                if (header.includes('"') || header.includes(',') || header.includes('\n')) {
                                    throw new Error(`Header "${header}" contains invalid characters (quotes, commas, or line breaks)`);
                                }
                            }
                            
                            // Validate data
                            if (!tableConfig.data) {
                                throw new Error('Table configuration is missing "data" property');
                            }
                            if (!Array.isArray(tableConfig.data)) {
                                throw new Error('Data must be an array');
                            }
                            if (tableConfig.data.length === 0) {
                                throw new Error('Data array cannot be empty');
                            }

                            
                            // Validate each row
                            for (let i = 0; i < tableConfig.data.length; i++) {
                                const row = tableConfig.data[i];
                                if (!Array.isArray(row)) {
                                    throw new Error(`Row ${i} must be an array, got ${typeof row}`);
                                }
                                if (row.length !== tableConfig.headers.length) {
                                    throw new Error(`Row ${i} has ${row.length} columns but headers has ${tableConfig.headers.length} columns`);
                                }
                                
                                // Validate each cell
                                for (let j = 0; j < row.length; j++) {
                                    const cell = row[j];
                                    if (typeof cell !== 'string' && typeof cell !== 'number') {
                                        throw new Error(`Cell at row ${i}, column ${j} must be a string or number, got ${typeof cell}`);
                                    }
                                    if (typeof cell === 'string' && (cell.includes('"') || cell.includes('\n'))) {
                                        throw new Error(`Cell "${cell}" at row ${i}, column ${j} contains invalid characters (quotes or line breaks)`);
                                    }
                                }
                            }

                            // Clear processing message and render table
                            tableDiv.innerHTML = '';
                            console.log('Rendering table with config:', tableConfig);
                            console.log('Table container ID:', tableContainerId);
                            renderTable(tableConfig, tableContainerId);
                        } catch (e) {
                            console.error("Error processing table:", e);
                            console.error("Table content was:", codeBlock.textContent);
                            tableDiv.innerHTML = `
                                <div style="padding: 15px; border: 1px solid var(--error-color, #e74c3c); border-radius: 8px; background-color: var(--error-bg, #fdf2f2); color: var(--error-color, #e74c3c); margin: 10px 0;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        <strong>Table Processing Error</strong>
                                    </div>
                                    <div style="font-size: 14px; opacity: 0.9;">${e.message}</div>
                                </div>
                            `;
                        }
                    }, 500); // Delay to allow streaming to complete
                });
                resultsContainer.scrollTop = resultsContainer.scrollHeight;
            };

            const logCallback = (message) => {
                logStep(message);
            };

            try {
                console.log('Sending request to /api/query-proxy with payload:', {
                    query: query,
                    api_target: selectedModel.toLowerCase(),
                    user_email: userEmail,
                    user_name: userName,
                    user_local_time: userLocalTime,
                    short_response_enabled: isShortResponseEnabled
                });
                const response = await fetch('/api/query-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        api_target: selectedModel.toLowerCase(), // This will be used by the worker to route
                        user_email: userEmail,
                        user_name: userName,
                        user_local_time: userLocalTime,
                        short_response_enabled: isShortResponseEnabled,
                        id_token: idToken // Add the ID token to the request
                    }),
                });
                console.log('Received response from /api/query-proxy. Status:', response.status, 'OK:', response.ok);

                if (response.status === 429) {
                    const errorData = await response.json();
                    displayRateLimitPopup(errorData.cooldown_end_timestamp, errorData.message_from_developer);
                    logStep('<i class="fas fa-hourglass-half" style="color: #FBBF24;"></i> Query limit exceeded.');
                    setSendButtonState(false); // Ensure button is reset
                    const logContainer = document.getElementById('live-log-container');
                    if (logContainer) {
                        logContainer.classList.remove('is-active');
                        logContainer.classList.add('has-error'); // Indicate an error state
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        logContainer.classList.add('collapsed');
                        setTimeout(() => {
                            logContainer.classList.remove('has-error');
                        }, 1000);
                    }
                    return; // Stop further processing for 429
                }

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let done = false;

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;
                    const chunk = decoder.decode(value);
                    streamCallback(chunk);
                }

                addExportPanel(aiResponseElement, aiResponseContent);
                logStep('<i class="fas fa-check-circle" style="color: #10B981;"></i> Response completed successfully.');
                setSendButtonState(false);
                const logContainer = document.getElementById('live-log-container');
                if (logContainer) {
                    logContainer.classList.remove('is-active');
                    logContainer.classList.add('is-done');
                    setTimeout(() => logContainer.classList.remove('is-done'), 1000);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    logContainer.classList.add('collapsed');
                }
            } catch (error) {
                console.error('Search failed:', error);
                let errorMessage = error.message || 'Unknown error occurred';
                let errorIcon = 'fas fa-exclamation-triangle';
                let userFriendlyMessage = 'Sorry, something went wrong. Please try again.';

                if (errorMessage.includes('JSON.parse')) {
                    errorIcon = 'fas fa-code';
                    userFriendlyMessage = 'There was an issue processing the AI response. This might be a temporary problem with the AI service.';
                    logStep(`<i class="${errorIcon}" style="color: #EF4444;"></i> JSON parsing error in AI response`);
                } else if (errorMessage.includes('Network Error') || errorMessage.includes('Load failed') || errorMessage.includes('Failed to fetch')) {
                    errorIcon = 'fas fa-wifi';
                    userFriendlyMessage = 'Network connection issue. Please check your internet connection and try again.';
                    logStep(`<i class="${errorIcon}" style="color: #EF4444;"></i> Network connectivity issue`);
                } else if (errorMessage.includes('Mistral API error') || errorMessage.includes('Serper API error') || errorMessage.includes('Coingecko API error')) {
                    errorIcon = 'fas fa-server';
                    userFriendlyMessage = 'The AI service is currently experiencing issues. Please try again in a moment.';
                    logStep(`<i class="${errorIcon}" style="color: #EF4444;"></i> AI service error`);
                } else if (errorMessage.includes('Empty response') || errorMessage.includes('No content received')) {
                    errorIcon = 'fas fa-inbox';
                    userFriendlyMessage = 'The AI service returned an empty response. Please try rephrasing your query.';
                    logStep(`<i class="${errorIcon}" style="color: #EF4444;"></i> Empty response from AI service`);
                } else {
                    logStep(`<i class="${errorIcon}" style="color: #EF4444;"></i> Error: ${errorMessage}`);
                }

                setSendButtonState(false);
                const logContainer = document.getElementById('live-log-container');
                if (logContainer && !logContainer.classList.contains('has-error')) {
                    logContainer.classList.remove('is-active');
                    logContainer.classList.add('has-error');
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    logContainer.classList.add('collapsed');
                    setTimeout(() => logContainer.classList.remove('has-error'), 1000);
                }

                resultsContainer.insertAdjacentHTML('beforeend', `
                    <div class="ai-response">
                        <h3><i class="${errorIcon}" style="color: #EF4444;"></i> Search Error</h3>
                        <p>${userFriendlyMessage}</p>
                        <details>
                            <summary>Technical Details</summary>
                            <pre style="background: var(--content-bg-color); border: 1px solid var(--border-color); padding: 10px; border-radius: 4px; font-size: 12px; overflow-x: auto; color: var(--text-primary);">${errorMessage}</pre>
                        </details>
                        <div style="margin-top: 15px;">
                            <button onclick="location.reload()" style="background: var(--send-button-grad-start); color: var(--send-button-text); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-refresh"></i> Refresh Page
                            </button>
                        </div>
                    </div>
                `);
            }

            } catch (error) {
            if (error.name === 'AbortError') {
                logStep('<i class="fas fa-pause-circle" style="color: #FBBF24;"></i> Response paused.');
            } else {
                // This catch block handles any other errors not caught by the orchestration try-catch
                console.error('Search failed:', error);
                if (!error.message.includes('JSON.parse') && !error.message.includes('Mistral API')) {
                    // Only log if it's not already handled above
                    logStep(`<i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i> Unexpected error: ${error.message}`);
                }
            }

            // Always set button state back to enabled, even on error
            setSendButtonState(false);
            const logContainer = document.getElementById('live-log-container');
            if (logContainer && !logContainer.classList.contains('has-error')) {
                logContainer.classList.remove('is-active');
                logContainer.classList.add('has-error');
                await new Promise(resolve => setTimeout(resolve, 1200));
                logContainer.classList.add('collapsed');
                setTimeout(() => {
                    logContainer.classList.remove('has-error');
                }, 1000);
            }
        }
    };


    // Removed renderAIResponse as content is now streamed and rendered incrementally.
    // The functionality of rendering Markdown and highlighting code is now part of the streamCallback.
 
 
 
     // Function to set the state of the send buttons (loading/enabled)
     const setSendButtonState = (isLoading) => {
         const buttons = [sendBtnTop, sendBtnBottom];
         buttons.forEach(button => {
             if (!button) return;
             const icon = button.querySelector('i');
             if (!icon) return;

             if (isLoading) {
                 icon.classList.remove('fa-arrow-right');
                 icon.classList.add('fa-spinner', 'fa-spin');
                 button.disabled = true;
                 button.title = 'Loading... Click to pause';
                 button.classList.add('loading'); // Add loading class
             } else {
                 icon.classList.remove('fa-spinner', 'fa-spin');
                 icon.classList.add('fa-arrow-right');
                 button.disabled = false;
                 button.title = 'Send message';
                 button.classList.remove('loading'); // Remove loading class
             }
         });
     };

     const triggerSearchOrPause = (sourceElement) => {
         const query = sourceElement.value.trim();
         console.log('triggerSearchOrPause called with query:', query, 'from element:', sourceElement.id);

         if (!query) {
             console.log('Query is empty, search not triggered.');
             return;
         }

         // Determine which model selection element to use based on the source
         const isBottomSearch = sourceElement && sourceElement.id === 'query-input-bottom';
         let selectedModel;

         if (isBottomSearch) {
             selectedModel = 'Amaya'; // Bottom search box defaults to Amaya
         } else {
             const modelElement = document.getElementById('selected-model');
             selectedModel = modelElement ? modelElement.textContent : 'Amaya';
         }

         console.log('Calling handleSearch with query:', query, 'and selectedModel:', selectedModel);
         handleSearch(query, sourceElement);

         // Clear the input after search is triggered
         sourceElement.value = '';
         sourceElement.blur();

         // Update placeholder visibility after clearing
         updatePlaceholderForInput(sourceElement);

         // Hide the pre-release tag
         const preReleaseTag = document.querySelector('.pre-release-tag');
         if (preReleaseTag) {
             preReleaseTag.style.display = 'none';
         }
     };

     document.querySelector('.search-wrapper .send-btn').addEventListener('click', () => {
         console.log('Top send button clicked.');
         triggerSearchOrPause(queryInputTop);
     });
     queryInputTop.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
             e.preventDefault();
             console.log('Enter key pressed on top input.');
             triggerSearchOrPause(e.target);
         }
     });

     // Fix follow-up search box functionality
     document.getElementById('send-btn-bottom').addEventListener('click', () => {
         console.log('Bottom send button clicked.');
         triggerSearchOrPause(queryInputBottom);
     });
     queryInputBottom.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && !e.shiftKey) {
             e.preventDefault();
             console.log('Enter key pressed on bottom input.');
             triggerSearchOrPause(e.target);
         }
     });
 
     
     // Code block actions
     window.copyCode = function(button) {
         const pre = button.closest('.code-toolbar').querySelector('pre');
         const code = pre.querySelector('code').innerText;
         navigator.clipboard.writeText(code).then(() => {
             button.innerHTML = '<i class="fas fa-check"></i>';
             button.title = 'Copied!';
             setTimeout(() => {
                 button.innerHTML = '<i class="fas fa-copy"></i>';
                 button.title = 'Copy code';
             }, 2000);
         });
     }
 
     window.downloadCode = function(button, language) {
         const pre = button.closest('.code-toolbar').querySelector('pre');
         const code = pre.querySelector('code').innerText;
         const blob = new Blob([code], { type: 'text/plain' });
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `code.${language || 'txt'}`;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url);
     }
 
     mainContent.addEventListener('click', (e) => {
         const logHeaderToggle = e.target.closest('#log-header-toggle');
         if (logHeaderToggle) {
             e.preventDefault();
             e.stopPropagation();
             
             const currentLogContainer = document.getElementById('live-log-container');
             
             if (currentLogContainer) {
                 currentLogContainer.classList.toggle('collapsed');
                 // CSS handles rotation automatically, no need to change icon class
             }
         }
     });
     
     document.querySelector('.logo a').addEventListener('click', (e) => {
         e.preventDefault();
         if (body.classList.contains('search-active')) {
             body.classList.remove('search-active');
             // Clear all results and log messages when navigating home
             document.getElementById('results-container').innerHTML = '';
             document.getElementById('query-heading').classList.remove('expanded');
             document.getElementById('query-text-content').innerHTML = '';
             document.getElementById('show-more-btn').style.display = 'none';
             document.getElementById('show-less-btn').style.display = 'none';
             
             // Remove the live log container when navigating home
             const logContainer = document.getElementById('live-log-container');
             if (logContainer) {
                 logContainer.remove(); // Remove the entire container since it's positioned after tabs
             }

             queryInputTop.value = '';
             queryInputBottom.value = '';

             // Reset textarea heights to default
             queryInputTop.style.height = '';
             queryInputTop.style.overflowY = 'hidden';
             queryInputBottom.style.height = '';
             queryInputBottom.style.overflowY = 'hidden';

             mainContent.insertBefore(initialViewContent, mainContent.firstChild);
             bottomSearchWrapper.style.display = 'none';
 
             // Reset the placeholder text
             const bottomPlaceholderSpan = document.querySelector('#bottom-search-wrapper .placeholder-text-span');
             if (bottomPlaceholderSpan) {
                 bottomPlaceholderSpan.textContent = 'type your query';
             }
             
             // Reset placeholder visibility for top search box
             const topWrapper = queryInputTop.closest('.textarea-wrapper');
             if (topWrapper) {
                 const topPlaceholderText = topWrapper.querySelector('.placeholder-text-span');
                 if (topPlaceholderText) {
                     topPlaceholderText.classList.remove('hidden');
                 }
             }
         }
       });
 
 
     // --- Custom Placeholder Logic and Cat Icon Rotation ---
     const setupPlaceholder = (inputId) => {
         const input = document.getElementById(inputId);
         if (!input) return;
         
         const wrapper = input.closest('.textarea-wrapper');
         if (!wrapper) return;
         
         const placeholderText = wrapper.querySelector('.placeholder-text-span');
         const catIcon = wrapper.querySelector('.placeholder-cat-icon');
         
         const updatePlaceholderVisibility = () => {
             const hasText = input.value.trim() !== '';
             if (placeholderText) {
                 placeholderText.classList.toggle('hidden', hasText);
                 // Also update the wrapper class for CSS-based hiding
                 wrapper.classList.toggle('has-content', hasText);
             }
         };
 
         // Handle cat icon rotation on focus/blur
         input.addEventListener('focus', () => {
             if (catIcon) {
                 catIcon.src = 'svg/cat2.svg'; // Change to cat2.svg on focus
             }
             updatePlaceholderVisibility(); // Call visibility update on focus
         });
         
         input.addEventListener('blur', () => {
             if (catIcon) {
                 catIcon.src = 'svg/cat.svg'; // Change back to cat.svg on blur
             }
             updatePlaceholderVisibility(); // Call visibility update on blur
         });
         
         // Initial check in case of pre-filled values
         updatePlaceholderVisibility();
     };
 
     setupPlaceholder('query-input');
     setupPlaceholder('query-input-bottom');
 
     const shortResponseToggle = document.getElementById('short-response-toggle');
     shortResponseToggle.addEventListener('click', () => {
         shortResponseToggle.classList.toggle('active');
     });
 
     // Add event listeners for show more/less buttons
     showMoreBtn.addEventListener('click', () => {
         queryHeading.classList.add('expanded');
         queryHeading.style.maxHeight = '500px'; // Set to expanded max height
         showMoreBtn.style.display = 'none';
         showLessBtn.style.display = 'block';
         queryButtons.classList.remove('show-gradient'); // Hide gradient when expanded
     });
 
     showLessBtn.addEventListener('click', () => {
         queryHeading.classList.remove('expanded');
         const currentHeight = queryTextContent.scrollHeight;
         const lineHeight = parseFloat(getComputedStyle(queryTextContent).lineHeight);
         const targetMaxHeight = Math.min(120, Math.max(lineHeight * 1.5, currentHeight)); // At least 1.5 lines, up to 120px
         queryHeading.style.maxHeight = `${targetMaxHeight}px`; // Revert to initial max height
         
         // Re-check if "show more" should be visible after collapsing
         if (currentHeight > targetMaxHeight) {
             showMoreBtn.style.display = 'block';
             queryButtons.classList.add('show-gradient'); // Show gradient if still truncated
         } else {
             showMoreBtn.style.display = 'none';
             queryButtons.classList.remove('show-gradient'); // Hide gradient if not truncated
         }
         showLessBtn.style.display = 'none';
     });
 });
