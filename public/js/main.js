import { orchestrateAgents } from '../agents/agent_orchestrator.js';
import { renderTable, renderChart, parseChartConfig } from './render_tools.js';
import { updateChartsTheme } from './chart_utils.js';
import { parseChartConfig as safeParseChartConfig, parseTableConfig } from './json_utils.js';

const WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';

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
    const rateLimitCloseButton = document.getElementById('rate-limit-close-button');
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

                // Fetch user status from the worker to check for 20x plan
                const userStatusResponse = await fetch(`${WORKER_BASE_URL}api/query-proxy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: "check_user_status", // A dummy query type for status check
                        user_name: user.displayName,
                        user_email: user.email,
                        id_token: idToken,
                        api_target: "status_check", // A new API target for status
                        api_payload: {}
                    })
                });

                if (userStatusResponse.ok) {
                    const statusData = await userStatusResponse.json();
                    if (statusData.is_whitelisted_20x_plan) {
                        const userStatusElement = document.getElementById('user-status');
                        if (userStatusElement) {
                            userStatusElement.textContent = '✨';
                            userStatusElement.title = '20x Plus Plan User';
                        }
                    }
                } else {
                    console.error('Failed to fetch user status:', await userStatusResponse.text());
                }

            } catch (error) {
                console.error('Error getting ID token or user status:', error);
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
            localStorage.removeItem('id_token'); // Remove the Firebase token
            
            const userStatusElement = document.getElementById('user-status');
            if (userStatusElement) {
                userStatusElement.textContent = ''; // Clear status indicator
                userStatusElement.title = '';
            }
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
   rateLimitCloseButton.addEventListener('click', () => hidePopup(rateLimitPopupOverlay)); // "Close" button listener


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
            const pdfBtn = document.querySelector('.pdf-btn');
            if (pdfBtn) {
                pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
                pdfBtn.disabled = true;
            }

            await loadPDFLibraries();

            let element = document.getElementById(elementId);
            if (!element) {
                console.error('Element not found, falling back to the last AI response.');
                element = document.querySelector('.ai-response:last-of-type');
                if (!element) {
                    alert('Content not found for PDF export.');
                    return;
                }
            }
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            // --- FONT DEFINITIONS ---
            // Add Noto Sans for emoji support
            pdf.addFileToVFS('NotoSans-Regular.ttf', window.noto_sans_regular_base64);
            pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
            pdf.setFont('NotoSans');
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (2 * margin);
            let currentY = margin;
            
            const addPageIfNeeded = (height) => {
                if (currentY + height > pageHeight - margin) {
                    pdf.addPage();
                    currentY = margin;
                    addHeader(pdf, 'YouTopia Search Results', false); // Not the first page
                    return true;
                }
                return false;
            };

            const addHeader = (doc, title, isFirstPage = false) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.setTextColor(40);
                doc.text(title, margin, currentY);
                
                if (isFirstPage) {
                    const searchIcon = document.querySelector('.search-logo');
                    if (searchIcon) {
                        try {
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            const img = new Image();
                            img.crossOrigin = "Anonymous"; // Handle CORS
                            img.onload = () => {
                                canvas.width = img.width;
                                canvas.height = img.height;
                                context.drawImage(img, 0, 0);
                                const iconData = canvas.toDataURL('image/png');
                                doc.addImage(iconData, 'PNG', pageWidth - margin - 10, currentY - 8, 10, 10);
                            };
                            img.src = searchIcon.src;
                        } catch (e) {
                            console.error("Error adding search icon to PDF:", e);
                        }
                    }
                }
                
                currentY += 10;
                doc.setDrawColor(220, 220, 220);
                doc.line(margin, currentY, pageWidth - margin, currentY);
                currentY += 5;
            };

            const addFooter = (doc) => {
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    const text = `Page ${i} of ${pageCount} | Crafted by YouTopia Search | youtopia.co.in | ${new Date().toLocaleDateString()}`;
                    const textWidth = doc.getTextWidth(text);
                    doc.text(text, (pageWidth - textWidth) / 2, pageHeight - 10);
                }
            };

            addHeader(pdf, 'YouTopia Search Results', true); // This is the first page
            
            const sections = parseContentSections(element);

            const drawStyledText = (segments, x, y, options) => {
                const { initialX, maxWidth, lineHeight, defaultStyle, defaultColor } = options;
                let currentX = x;
                let currentY = y;

                for (const segment of segments) {
                    if (segment.type === 'linebreak') {
                        currentY += lineHeight;
                        currentX = initialX;
                        continue;
                    }

                    let style = defaultStyle;
                    let color = defaultColor;
                    let isLink = false;
                    let fontName = 'NotoSans';

                    switch(segment.type) {
                        case 'strong': style = 'bold'; break;
                        case 'italic': style = 'italic'; break;
                        case 'inline-code':
                            fontName = 'courier';
                            style = 'normal';
                            break;
                        case 'link':
                            color = [0, 80, 150];
                            isLink = true;
                            break;
                    }

                    pdf.setFont(fontName, style);
                    pdf.setTextColor(color[0], color[1], color[2]);

                    const words = segment.value.split(' ');
                    for (const word of words) {
                        if (!word) continue;
                        const wordWithSpace = word + ' ';
                        const wordWidth = pdf.getStringUnitWidth(wordWithSpace) * pdf.getFontSize() / pdf.internal.scaleFactor;
                        
                        if (currentX + wordWidth > initialX + maxWidth) {
                            currentY += lineHeight;
                            currentX = initialX;
                        }

                        pdf.text(wordWithSpace, currentX, currentY);
                        if (isLink) {
                            const linkHeight = pdf.getFontSize() * 1.2;
                            pdf.link(currentX, currentY - linkHeight / 1.5, wordWidth, linkHeight, { url: segment.href });
                        }

                        currentX += wordWidth;
                    }
                }
                pdf.setFont('NotoSans', defaultStyle);
                pdf.setTextColor(defaultColor[0], defaultColor[1], defaultColor[2]);
                return currentY - y + lineHeight;
            };

            for (const section of sections) {
                addPageIfNeeded(20);

                if (section.type === 'heading') {
                    const { level, content } = section;
                    const fontSize = Math.max(20 - (level - 1) * 2, 10);
                    const lineHeight = fontSize * 0.5;
                    pdf.setFont('NotoSans', 'bold');
                    pdf.setFontSize(fontSize);
                    pdf.setTextColor(40);
                    
                    const height = drawStyledText(content, margin, currentY, {
                        initialX: margin,
                        maxWidth: contentWidth,
                        lineHeight: lineHeight,
                        defaultStyle: 'bold',
                        defaultColor: [40, 40, 40]
                    });
                    currentY += height;
                    if (level <= 2) {
                        currentY += 3; // Add more space after h1/h2
                    }

                } else if (section.type === 'paragraph') {
                    const fontSize = 11;
                    const lineHeight = fontSize * 0.5;
                    pdf.setFontSize(fontSize);
                    
                    const height = drawStyledText(section.content, margin, currentY, {
                        initialX: margin,
                        maxWidth: contentWidth,
                        lineHeight: lineHeight,
                        defaultStyle: 'normal',
                        defaultColor: [50, 50, 50]
                    });
                    currentY += height;

                } else if (section.type === 'blockquote') {
                    const fontSize = 10;
                    const lineHeight = fontSize * 0.5;
                    const bqMargin = margin + 5;
                    const bqWidth = contentWidth - 10;
                    
                    pdf.setFontSize(fontSize);
                    const textHeight = drawStyledText(section.content, bqMargin, currentY, {
                        initialX: bqMargin,
                        maxWidth: bqWidth,
                        lineHeight: lineHeight,
                        defaultStyle: 'italic',
                        defaultColor: [100, 100, 100]
                    });

                    pdf.setFillColor(230, 230, 230);
                    pdf.rect(margin, currentY - lineHeight * 0.5, 1.5, textHeight, 'F');

                    currentY += textHeight;

                } else if (section.type === 'list') {
                    const { isOrdered, items } = section;
                    const fontSize = 11;
                    const lineHeight = fontSize * 0.5;
                    const itemMargin = margin + 8;
                    const itemWidth = contentWidth - 8;

                    pdf.setFontSize(fontSize);

                    items.forEach((item, index) => {
                        const bullet = isOrdered ? `${index + 1}.` : '•';
                        pdf.setFont('NotoSans', 'normal');
                        pdf.setTextColor(50);
                        pdf.text(bullet, margin, currentY);

                        const height = drawStyledText(item, itemMargin, currentY, {
                            initialX: itemMargin,
                            maxWidth: itemWidth,
                            lineHeight: lineHeight,
                            defaultStyle: 'normal',
                            defaultColor: [50, 50, 50]
                        });
                        currentY += height;
                    });
                    currentY += lineHeight;

                } else if (section.type === 'code') {
                    const fontSize = 9;
                    const lineHeight = fontSize * 0.5;
                    const padding = 3;
                    const codeMargin = margin + padding;
                    const codeWidth = contentWidth - (2 * padding);
                    
                    pdf.setFont('courier', 'normal');
                    pdf.setFontSize(fontSize);
                    pdf.setTextColor(0);
                    
                    const lines = pdf.splitTextToSize(section.content, codeWidth);
                    const blockHeight = (lines.length * lineHeight) + (2 * padding);
                    addPageIfNeeded(blockHeight);

                    pdf.setFillColor(240, 240, 240);
                    pdf.rect(margin, currentY - (lineHeight/2), contentWidth, blockHeight, 'F');
                    
                    pdf.text(lines, codeMargin, currentY + padding);
                    currentY += blockHeight;

                } else if (section.type === 'image') {
                    try {
                        const imgData = await getImageData(section.element.src);
                        const imgProps = pdf.getImageProperties(imgData);
                        let imgWidth = section.element.width;
                        let imgHeight = section.element.height;

                        if (imgWidth > contentWidth) {
                            imgHeight = (imgHeight * contentWidth) / imgWidth;
                            imgWidth = contentWidth;
                        }

                        addPageIfNeeded(imgHeight + (section.element.title ? 10 : 0));
                        pdf.addImage(imgData, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight);
                        currentY += imgHeight + 5;

                        if (section.element.title) {
                            pdf.setFont('NotoSans', 'italic');
                            pdf.setFontSize(9);
                            pdf.setTextColor(100);
                            const titleLines = pdf.splitTextToSize(section.element.title, contentWidth);
                            pdf.text(titleLines, (pageWidth - contentWidth) / 2, currentY + 5, { align: 'center' });
                            currentY += titleLines.length * 4 + 5;
                        }

                    } catch (e) { console.error("Error adding image:", e); }
                } else if (section.type === 'chart') {
                     try {
                        const canvas = section.element.querySelector('canvas');
                        if (canvas) {
                            const chartImageData = canvas.toDataURL('image/png', 1.0);
                            const imgWidth = contentWidth * 0.8;
                            const imgHeight = (canvas.height * imgWidth) / canvas.width;
                            addPageIfNeeded(imgHeight);
                            pdf.addImage(chartImageData, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight);
                            currentY += imgHeight + 10;
                        }
                    } catch (e) { console.error("Error adding chart:", e); }
                } else if (section.type === 'table') {
                    const tableData = extractTableData(section.element);
                    if (tableData) {
                        pdf.autoTable({
                            head: [tableData.headers],
                            body: tableData.rows,
                            startY: currentY,
                            theme: 'grid',
                            styles: {
                                font: 'NotoSans',
                                fillColor: [245, 245, 245]
                            },
                            headStyles: {
                                fillColor: [60, 70, 80],
                                textColor: 255,
                                font: 'NotoSans',
                                fontStyle: 'bold'
                            },
                            didDrawPage: (data) => {
                                currentY = data.cursor.y + 5;
                            }
                        });
                        currentY = pdf.autoTable.previous.finalY + 10;
                    }
                }
            }

            // --- ADD SOURCES ---
            const sourcesAdded = await addSourcesToPDF(pdf, currentY, margin, contentWidth, addPageIfNeeded);
            if (sourcesAdded.wasAdded) {
                currentY = sourcesAdded.newY;
            }

            addFooter(pdf);
            pdf.save('youtopia-search-results.pdf');

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. See console for details.');
        } finally {
            const pdfBtn = document.querySelector('.pdf-btn');
            if (pdfBtn) {
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
                pdfBtn.disabled = false;
            }
        }
    };

    async function getImageData(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function addSourcesToPDF(pdf, startY, margin, contentWidth, addPageIfNeeded) {
        let currentY = startY;
        const sourceCards = document.querySelectorAll('#sources-container .source-card');

        if (sourceCards.length === 0) {
            return { wasAdded: false, newY: currentY };
        }

        // Add a page break and a header for the sources section
        pdf.addPage();
        currentY = margin;
        // Don't add icon on the sources page header
        addHeader(pdf, 'Sources', false);
        
        pdf.setFont('NotoSans', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(40);
        pdf.text('Sources', margin, currentY);
        currentY += 10;

        for (const card of sourceCards) {
            const number = card.querySelector('.source-number')?.textContent || '';
            const title = card.querySelector('.source-title')?.textContent || 'No title';
            const url = card.querySelector('.source-url')?.textContent || 'No URL';
            const snippet = card.querySelector('.source-snippet')?.textContent || '';
            const favicon = card.querySelector('.source-favicon');

            const sectionHeight = 20 + (snippet ? 20 : 0); // Approximate height
            addPageIfNeeded(sectionHeight);

            // Draw Favicon (if available)
            if (favicon && favicon.src) {
                try {
                    const imgData = await getImageData(favicon.src);
                    pdf.addImage(imgData, 'PNG', margin, currentY - 3, 5, 5);
                } catch (e) {
                    console.error("Could not add favicon to PDF:", e);
                }
            }
            
            // Source Title
            pdf.setFont('NotoSans', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(40);
            pdf.textWithLink(`${number} ${title}`, margin + 7, currentY, { url: card.href });
            currentY += 6;

            // Source URL
            pdf.setFont('NotoSans', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(0, 80, 150);
            pdf.textWithLink(url, margin, currentY, { url: card.href });
            currentY += 8;

            // Source Snippet
            if (snippet) {
                pdf.setFont('NotoSans', 'italic');
                pdf.setFontSize(9);
                pdf.setTextColor(120);
                const snippetLines = pdf.splitTextToSize(`"${snippet}"`, contentWidth);
                pdf.text(snippetLines, margin, currentY);
                currentY += snippetLines.length * 4 + 5;
            }

            currentY += 5; // Spacing between entries
        }

        return { wasAdded: true, newY: currentY };
    }

    function parseInline(element) {
        const segments = [];
        const nodes = Array.from(element.childNodes);

        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.replace(/\u00A0/g, ' ');
                if (text) {
                     segments.push({ type: 'text', value: text });
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                const text = node.textContent.replace(/\u00A0/g, ' ');

                if (!text.trim() && tagName !== 'br') continue;

                switch (tagName) {
                    case 'strong':
                    case 'b':
                        segments.push({ type: 'strong', value: text });
                        break;
                    case 'em':
                    case 'i':
                        segments.push({ type: 'italic', value: text });
                        break;
                    case 'code':
                        segments.push({ type: 'inline-code', value: text });
                        break;
                    case 'a':
                        segments.push({ type: 'link', value: text, href: node.href });
                        break;
                    case 'br':
                        segments.push({ type: 'linebreak' });
                        break;
                    default:
                        segments.push({ type: 'text', value: text });
                }
            }
        }
        return segments;
    }

    function parseContentSections(element) {
        const sections = [];
        const traverse = (node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                
                if (tagName === 'script' || tagName === 'style' || node.classList.contains('export-panel')) {
                    return;
                }

                switch (tagName) {
                    case 'h1':
                    case 'h2':
                    case 'h3':
                    case 'h4':
                    case 'h5':
                    case 'h6':
                        sections.push({ type: 'heading', level: parseInt(tagName.charAt(1)), content: parseInline(node) });
                        break;
                    case 'p':
                        sections.push({ type: 'paragraph', content: parseInline(node) });
                        break;
                    case 'ul':
                    case 'ol':
                        sections.push({
                            type: 'list',
                            isOrdered: tagName === 'ol',
                            items: Array.from(node.children).map(li => parseInline(li))
                        });
                        break;
                    case 'blockquote':
                        Array.from(node.children).forEach(childNode => {
                            if (childNode.tagName.toLowerCase() === 'p') {
                                sections.push({ type: 'blockquote', content: parseInline(childNode) });
                            }
                        });
                        break;
                    case 'img':
                        sections.push({ type: 'image', element: node });
                        break;
                    case 'pre':
                        if (node.querySelector('code')) {
                            const codeContent = node.querySelector('code').innerText;
                            sections.push({ type: 'code', content: codeContent });
                        }
                        break;
                    case 'div':
                        if (node.classList.contains('chart-display') || node.classList.contains('chart-wrapper')) {
                            sections.push({ type: 'chart', element: node });
                        } else if (node.classList.contains('table-display') || node.classList.contains('gridjs-wrapper')) {
                            sections.push({ type: 'table', element: node });
                        } else {
                            Array.from(node.childNodes).forEach(traverse);
                        }
                        break;
                    default:
                        Array.from(node.childNodes).forEach(traverse);
                }
            }
        };

        Array.from(element.childNodes).forEach(traverse);
        return sections;
    }

    function extractTableData(tableElement) {
        try {
            const gridTable = tableElement.querySelector('.gridjs-table');
            if (gridTable) {
                const headers = Array.from(gridTable.querySelectorAll('.gridjs-th')).map(th => th.textContent.trim());
                const rows = Array.from(gridTable.querySelectorAll('.gridjs-tr')).map(tr =>
                    Array.from(tr.querySelectorAll('.gridjs-td')).map(td => td.textContent.trim())
                );
                return { headers, rows };
            }
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

    const loadPDFLibraries = async () => {
        const loadScript = (src) => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });

        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
             await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }
        if (typeof window.jspdf.autoTable === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
        }
        if (typeof window.noto_sans_regular_base64 === 'undefined') {
            const response = await fetch('/fonts/NotoSans-Regular.ttf');
            const blob = await response.blob();
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = (event) => {
                    window.noto_sans_regular_base64 = event.target.result.split(',')[1];
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        }
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

                // Render the raw markdown content as it streams
                aiResponseElement.innerHTML = marked.parse(aiResponseContent);

                // Auto-scroll if the user is near the bottom
                const isScrolledToBottom = resultsContainer.scrollHeight - resultsContainer.clientHeight <= resultsContainer.scrollTop + 1;
                if (isScrolledToBottom) {
                    resultsContainer.scrollTop = resultsContainer.scrollHeight;
                }

                // Check for the end-of-answer delimiter
                if (aiResponseContent.includes('---END_OF_ANSWER---')) {
                    // Stop the main "Answer" tab loading indicator here if needed
                    // This part is handled by the final processing step now
                }
            };

            const logCallback = (message) => {
                logStep(message);
            };

            try {
                const response = await orchestrateAgents(query, userName, userLocalTime, selectedModel, streamCallback, logCallback, isShortResponseEnabled);

                // --- Final Processing Step ---
                // This code runs after the entire stream is finished.
                processFinalResponse(aiResponseElement, aiResponseContent);

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

                // Handle 429 Rate Limit error specifically
                if (error instanceof Response && error.status === 429) {
                    const errorData = await error.json();
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
                    return; // Stop further processing
                }

                // Handle all other errors
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


    // This new function processes the complete response after streaming is done.
    const processFinalResponse = (aiResponseElement, fullContent) => {
        // Separate the main answer from the sources using the delimiter
        const delimiter = '---END_OF_ANSWER---';
        let mainAnswer = fullContent;
        let sourcesMarkdown = '';

        if (fullContent.includes(delimiter)) {
            const parts = fullContent.split(delimiter);
            mainAnswer = parts[0];
            sourcesMarkdown = parts[1] || '';
        }
        
        // Update the global content for export functions
        currentResponseContent = mainAnswer;

        // Render the final main answer content
        aiResponseElement.innerHTML = marked.parse(mainAnswer);

        // Now, find and render all charts and tables from the final content
        aiResponseElement.querySelectorAll('pre code.language-chart').forEach((codeBlock, index) => {
            const chartContainerId = `chart-container-${Date.now()}-${index}`;
            const chartDiv = document.createElement('div');
            chartDiv.id = chartContainerId;
            chartDiv.classList.add('chart-display');
            codeBlock.parentNode.parentNode.replaceChild(chartDiv, codeBlock.parentNode);

            try {
                const chartConfig = safeParseChartConfig(codeBlock.textContent.trim());
                renderChart(chartContainerId, chartConfig);
            } catch (e) {
                console.error("Error processing chart:", e);
                chartDiv.innerHTML = `<div class="render-error">Chart Processing Error: ${e.message}</div>`;
            }
        });

        aiResponseElement.querySelectorAll('pre code.language-table').forEach((codeBlock, index) => {
            const tableContainerId = `table-container-${Date.now()}-${index}`;
            const tableDiv = document.createElement('div');
            tableDiv.id = tableContainerId;
            tableDiv.classList.add('table-display');
            codeBlock.parentNode.parentNode.replaceChild(tableDiv, codeBlock.parentNode);

            try {
                const tableConfig = parseTableConfig(codeBlock.textContent.trim());
                renderTable(tableConfig, tableContainerId);
            } catch (e) {
                console.error("Error processing table:", e);
                tableDiv.innerHTML = `<div class="render-error">Table Processing Error: ${e.message}</div>`;
            }
        });

        // Highlight all code blocks
        renderCodeHighlighting(aiResponseElement);

        // Process and render the sources
        if (sourcesMarkdown) {
            const sourcesRegex = /## Sources\n([\s\S]*)/;
            const match = sourcesMarkdown.match(sourcesRegex);
            if (match) {
                const parsedSources = match[1].split('\n').map(line => {
                    const sourceRegex = /^(\d+)\.\s*\[([^\]]+)\]\((https?:\/\/[^\)]+)\)(?:\s*-\s*(.*))?$/;
                    const sourceMatch = line.match(sourceRegex);
                    if (sourceMatch) {
                        return { number: sourceMatch[1], title: sourceMatch[2], url: sourceMatch[3], snippet: sourceMatch[4] || '' };
                    }
                    return null;
                }).filter(Boolean);
                renderSourceCards(parsedSources, sourcesContainer);
            }
        }
        
        // Add the export panel at the very end
        addExportPanel(aiResponseElement, mainAnswer);
    };
 
 
 
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
