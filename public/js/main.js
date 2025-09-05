import { orchestrateAgents } from '../agents/agent_orchestrator.js';
import { renderTable, renderChart, parseChartConfig } from './render_tools.js';
import { updateChartsTheme } from './chart_utils.js';
import { parseChartConfig as safeParseChartConfig, parseTableConfig } from './json_utils.js';
// import ConversationManager from './conversation_manager.js'; // History disabled

const WORKER_BASE_URL = 'https://youtopia-worker.youtopialabs.workers.dev/';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize conversation manager
    // const conversationManager = new ConversationManager(); // History disabled

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
    const historyButton = document.getElementById('history-button'); // History button
    const historyModal = document.getElementById('history-modal'); // History modal
    const closeHistoryModal = document.getElementById('close-history-modal'); // Close history modal button
    const historyList = document.getElementById('history-list'); // History list container

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


    // Function to add show more/less functionality to query text
    const addShowMoreFunctionality = (element) => {
        // Remove any existing show more button
        const existingButton = element.parentNode.querySelector('.show-more-btn');
        if (existingButton) {
            existingButton.remove();
        }

        // Check if text content exceeds 4 lines (approximately 6rem)
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
        const maxHeight = lineHeight * 4; // 4 lines
        const actualHeight = element.scrollHeight;

        if (actualHeight > maxHeight) {
            // Add collapsed class and set max height
            element.classList.add('query-text-collapsed');
            element.style.maxHeight = `${lineHeight * 4}px`;
            
            // Create show more button
            const showMoreBtn = document.createElement('button');
            showMoreBtn.className = 'show-more-btn';
            showMoreBtn.textContent = 'Show more';
            showMoreBtn.setAttribute('aria-expanded', 'false');
            
            // Add click event
            showMoreBtn.addEventListener('click', function() {
                const isExpanded = element.classList.contains('query-text-collapsed');
                if (isExpanded) {
                    element.classList.remove('query-text-collapsed');
                    element.style.maxHeight = 'none';
                    showMoreBtn.textContent = 'Show less';
                    showMoreBtn.setAttribute('aria-expanded', 'true');
                } else {
                    element.classList.add('query-text-collapsed');
                    element.style.maxHeight = `${lineHeight * 4}px`;
                    showMoreBtn.textContent = 'Show more';
                    showMoreBtn.setAttribute('aria-expanded', 'false');
                }
            });
            
            // Insert button after the text content
            element.parentNode.appendChild(showMoreBtn);
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
            historyButton.style.display = 'block'; // Show history button when signed in
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

                // // Fetch and load conversation history (DISABLED)
                // try {
                //     const historyResponse = await fetch(`${WORKER_BASE_URL}api/conversation-history?id_token=${idToken}`);
                //     if (historyResponse.ok) {
                //         const historyData = await historyResponse.json();
                //         if (historyData.success && historyData.history) {
                //             // conversationManager.loadHistory(historyData.history); // History disabled
                //             // console.log('Conversation history loaded.');
                //         }
                //     } else {
                //         console.error('Failed to fetch conversation history:', await historyResponse.text());
                //     }
                // } catch (error) {
                //     console.error('Error fetching conversation history:', error);
                // }

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
            historyButton.style.display = 'none'; // Hide history button when signed out
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

   // --- Toast Function ---
   const showToast = (message, duration = 3000) => {
       // Create toast element
       const toast = document.createElement('div');
       toast.className = 'toast';
       toast.textContent = message;
       
       // Add to document
       document.body.appendChild(toast);
       
       // Show toast
       setTimeout(() => {
           toast.classList.add('show');
       }, 100);
       
       // Hide and remove toast after duration
       setTimeout(() => {
           toast.classList.remove('show');
           setTimeout(() => {
               if (toast.parentNode) {
                   toast.parentNode.removeChild(toast);
               }
           }, 300);
       }, duration);
   };

   // --- History Modal Functions ---
   const showHistoryModal = () => {
       // Get conversation history from the conversation manager (DISABLED)
       const history = []; // History disabled
       
       // Clear the history list
       historyList.innerHTML = '';
       
       // Check if there's any history
       if (history.length === 0) {
           // Show empty state
           const emptyState = document.getElementById('history-empty-state');
           if (emptyState) {
               emptyState.style.display = 'block';
           }
       } else {
           // Hide empty state
           const emptyState = document.getElementById('history-empty-state');
           if (emptyState) {
               emptyState.style.display = 'none';
           }
           
           // Add history items to the list
           history.forEach((item, index) => {
               const historyItem = document.createElement('div');
               historyItem.classList.add('history-item');
               
               // Format timestamp
               const date = new Date(item.timestamp);
               const formattedDate = date.toLocaleString();
               
               // Get a preview of the response (first 100 characters)
               const responsePreview = item.response ? item.response.substring(0, 100) + (item.response.length > 100 ? '...' : '') : 'No response yet';
               
               historyItem.innerHTML = `
                   <div class="history-item-title">${item.query}</div>
                   <div class="history-item-preview">${responsePreview}</div>
                   <div class="history-item-date">${formattedDate}</div>
               `;
               
               // Add click event to load this conversation
               historyItem.addEventListener('click', () => {
                   // Hide the modal
                   hidePopup(historyModal);
                   
                   // Load the conversation into the UI
                   loadConversation(item);
               });
               
               historyList.appendChild(historyItem);
           });
       }
       
       // Show the modal
       showPopup(historyModal);
   };

   const loadConversation = (item) => {
       // Clear current results
       resultsContainer.innerHTML = '';
       sourcesContainer.innerHTML = '';
       
       // Set the query in the heading
       queryTextContent.textContent = item.query;
       addShowMoreFunctionality(queryTextContent);
       
       // Process and display the response
       if (item.response) {
           // Create AI response element
           const aiResponseElement = document.createElement('div');
           aiResponseElement.classList.add('ai-response');
           aiResponseElement.innerHTML = marked.parse(item.response);
           
           // Add to results container
           resultsContainer.appendChild(aiResponseElement);
           
           // Process any charts or tables in the response
           processFinalResponse(aiResponseElement, item.response, item.sources || []);
       }
       
       // Show the results view
       if (!body.classList.contains('search-active')) {
           initialViewContent.style.display = 'none';
           bottomSearchWrapper.style.display = 'flex';
           body.classList.add('search-active');
       }
       
       // Update the conversation manager with this item (DISABLED)
       // conversationManager.addInteraction(item.query, item.response, item.sources || []);
   };

   // Initial UI update on page load
   
   // Initially hide the history button
   if (historyButton) {
       historyButton.style.display = 'none';
   }

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

   // Event listeners for history modal
   if (historyButton) {
       historyButton.addEventListener('click', (e) => {
           e.stopPropagation(); // Prevent closing the dropdown
           showHistoryModal();
       });
   }

   if (closeHistoryModal) {
       closeHistoryModal.addEventListener('click', () => {
           hidePopup(historyModal);
       });
   }

   // Close modal when clicking outside
   if (historyModal) {
       historyModal.addEventListener('click', (e) => {
           if (e.target === historyModal) {
               hidePopup(historyModal);
           }
       });
   }


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
            // Add custom fonts (ensure these are loaded or available)
            // For this example, we'll assume they are loaded and just define them.
            // In a real app, you'd load the .ttf files.
            try {
                const fontResponse = await fetch('/Avenir/Avenir Regular/Avenir Regular.ttf');
                const font = await fontResponse.arrayBuffer();
                const fontStr = new TextDecoder('latin1').decode(new Uint8Array(font));
                pdf.addFileToVFS('Avenir-Regular.ttf', fontStr);
                pdf.addFont('Avenir-Regular.ttf', 'Avenir', 'normal');
                pdf.setFont('Avenir');
            } catch (e) {
                console.error("Failed to load font, falling back to helvetica", e);
                pdf.setFont('helvetica');
            }
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (2 * margin);
            let currentY = margin;
            
            const addPageIfNeeded = (height) => {
                if (currentY + height > pageHeight - margin) {
                    pdf.addPage();
                    currentY = margin;
                    addHeader(pdf, 'YouTopia Search Results');
                    return true;
                }
                return false;
            };

            const addHeader = (doc, title) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18); /* Slightly larger header for main title */
                doc.setTextColor(40);
                doc.text(title, margin, currentY + 10); /* Add more space from top of page */
                currentY += 20; /* Increased space after header */
            };

            const addFooter = (doc) => {
                const pageCount = doc.internal.getNumberOfPages();
                const generationDate = new Date().toLocaleDateString();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    
                    // Footer content
                    const firstLine = `Page ${i} of ${pageCount} | Crafted by YouTopia Search`;
                    const secondLine = `youtopia.co.in | ${generationDate}`;
                    
                    // Calculate text widths
                    const firstLineWidth = doc.getTextWidth(firstLine);
                    const secondLineWidth = doc.getTextWidth(secondLine);
                    
                    // Add text to footer
                    doc.text(firstLine, (pageWidth - firstLineWidth) / 2, pageHeight - 12);
                    doc.text(secondLine, (pageWidth - secondLineWidth) / 2, pageHeight - 7);
                }
            };

            addHeader(pdf, 'YouTopia Search Results');
            
            const sections = parseContentSections(element);

            for (const section of sections) {
                addPageIfNeeded(20); // Generic check

                if (section.type === 'html') {
                    currentY = await addHtmlElement(pdf, section.element, currentY, { margin, contentWidth, pageHeight });
                } else if (section.type === 'image') {
                    try {
                        const imgData = await getImageData(section.element.src);
                        const imgProps = pdf.getImageProperties(imgData);
                        
                        const isPortrait = imgProps.height > imgProps.width;
                        const fixedWidthLandscape = contentWidth;
                        const fixedWidthPortrait = contentWidth * 0.7; // 70% for portrait
                        
                        let imgWidth, imgHeight;

                        if (isPortrait) {
                            imgWidth = fixedWidthPortrait;
                            imgHeight = (imgProps.height * imgWidth) / imgProps.width;
                        } else {
                            imgWidth = fixedWidthLandscape;
                            imgHeight = (imgProps.height * imgWidth) / imgProps.width;
                        }

                        const maxImgHeight = pageHeight * 0.75;
                        if (imgHeight > maxImgHeight) {
                            imgHeight = maxImgHeight;
                            imgWidth = (imgProps.width * imgHeight) / imgProps.height;
                        }

                        addPageIfNeeded(imgHeight);
                        const xPos = (pageWidth - imgWidth) / 2;
                        pdf.addImage(imgData, 'PNG', xPos, currentY, imgWidth, imgHeight, undefined, 'NONE');
                        currentY += imgHeight + 10;

                    } catch (e) { console.error("Error adding image:", e); }
                } else if (section.type === 'chart') {
                     try {
                        const canvas = section.element.querySelector('canvas');
                        if (canvas) {
                            const chartImageData = canvas.toDataURL('image/png', 1.0);
                            const imgWidth = contentWidth * 0.9;
                            const imgHeight = (canvas.height * imgWidth) / canvas.width;
                            addPageIfNeeded(imgHeight);
                            pdf.addImage(chartImageData, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight, undefined, 'NONE');
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
                                font: 'helvetica',
                                fillColor: [245, 245, 245]
                            },
                            headStyles: {
                                fillColor: [60, 70, 80],
                                textColor: 255
                            },
                            didDrawPage: (data) => {
                                currentY = data.cursor.y + 5;
                            }
                        });
                        // autoTable sets currentY via the callback
                    }
                }
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

    // This function remains largely the same but simplified
    function parseContentSections(element) {
        const sections = [];
        const children = Array.from(element.children);
        for (const child of children) {
            if (child.classList.contains('export-panel')) continue;
            if (child.classList.contains('chart-display') || child.classList.contains('chart-wrapper')) {
                sections.push({ type: 'chart', element: child });
            } else if (child.classList.contains('table-display') || child.classList.contains('gridjs-wrapper')) {
                sections.push({ type: 'table', element: child });
            } else if (child.tagName === 'IMG') {
                sections.push({ type: 'image', element: child });
            } else if (child.querySelector('img')) {
                const images = Array.from(child.querySelectorAll('img'));
                images.forEach(img => sections.push({ type: 'image', element: img }));
            } else {
                if (child.textContent.trim()) {
                    sections.push({ type: 'html', element: child });
                }
            }
        }
        return sections;
    }
async function addHtmlElement(pdf, element, startY, options) {
    let currentY = startY;
    const { margin, contentWidth, pageHeight } = options;

    const addPageIfNeeded = (height) => {
        if (currentY + height > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
            // Optionally add header to new pages: addHeader(pdf, '...');
            return true;
        }
        return false;
    };

    const renderNode = async (node) => {
        const tagName = node.tagName.toLowerCase();
        let text = node.textContent;
        // Check if node is a block element and trim leading/trailing whitespace
        const blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'li'];
        if (blockElements.includes(tagName)) {
            text = text.trim();
        }


        if (!text) return;

        let fontSize = 11;
        let fontStyle = 'normal';
        let spaceAfter = 4;

        switch (tagName) {
            case 'h1':
                fontSize = 24;
                fontStyle = 'bold';
                spaceAfter = 10;
                break;
            case 'h2':
                fontSize = 20;
                fontStyle = 'bold';
                spaceAfter = 8;
                break;
            case 'h3':
                fontSize = 16;
                fontStyle = 'bold';
                spaceAfter = 4;
                break;
            case 'p':
                spaceAfter = 2;
                break;
            case 'b':
            case 'strong':
                fontStyle = 'bold';
                break;
            case 'i':
            case 'em':
                fontStyle = 'italic';
                break;
            case 'li':
                const liLines = pdf.splitTextToSize(`• ${text}`, contentWidth - 5);
                addPageIfNeeded(liLines.length * 6);
                pdf.setFont('Avenir', 'normal');
                pdf.setFontSize(11);
                pdf.text(liLines, margin + 5, currentY);
                currentY += (liLines.length * 6);
                return;
        }

        pdf.setFont('Avenir', fontStyle);
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, contentWidth);
        const textHeight = lines.length * (fontSize * 0.352778);

        addPageIfNeeded(textHeight + spaceAfter);
        pdf.text(lines, margin, currentY);
        currentY += textHeight + spaceAfter;
    };

    // Process the text nodes of the current element first
    for (const childNode of Array.from(element.childNodes)) {
        if (childNode.nodeType === Node.TEXT_NODE) {
            const text = childNode.textContent;
            if (text.trim()) {
                pdf.setFont('Avenir', 'normal');
                pdf.setFontSize(11);
                const lines = pdf.splitTextToSize(text, contentWidth);
                const textHeight = lines.length * (11 * 0.352778);
                addPageIfNeeded(textHeight);
                pdf.text(lines, margin, currentY);
                currentY += textHeight;
            }
        } else if (childNode.nodeType === Node.ELEMENT_NODE) {
            // If it's an element node, recursively process it
            currentY = await addHtmlElement(pdf, childNode, currentY, options);
        }
    }

    return currentY;
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

    // --- Debounce Function ---
    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
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

        // Add query to conversation history (DISABLED)
        // conversationManager.addUserQuery(query);
        
        // Get conversation history (chat context only) (DISABLED)
        const condensedHistory = null; // History disabled

        // Clear previous results for every query to treat it as a new one
        resultsContainer.innerHTML = '';
        sourcesContainer.innerHTML = '';

        if (!body.classList.contains('search-active')) {
            initialViewContent.style.display = 'none';
            bottomSearchWrapper.style.display = 'flex';
            body.classList.add('search-active');

            // Change placeholder for follow-up questions
            const bottomPlaceholderSpan = document.querySelector('#bottom-search-wrapper .placeholder-text-span');
            if (bottomPlaceholderSpan) {
                bottomPlaceholderSpan.textContent = 'Ask a follow up question';
            }
        }

        // For every query (initial or follow-up), create a new log container
        let existingLogContainer = document.getElementById('live-log-container');
        if (existingLogContainer) {
            existingLogContainer.remove();
        }
        
        const logHTML = `
            <div id="live-log-container" class="is-active">
                <div class="log-header" id="log-header-toggle">
                    <h4>Live Execution Log</h4>
                    <button id="log-toggle-btn" title="Toggle Log"><i class="fas fa-chevron-up"></i></button>
                </div>
                <ul id="log-list"></ul>
            </div>`;

        const tabsDiv = document.querySelector('.tabs');
        let logList;
        if (tabsDiv) {
            tabsDiv.insertAdjacentHTML('afterend', logHTML);
            logList = document.getElementById('log-list');
        }

        // Initialize the log for the current query
        if (logList) {
            const li = document.createElement('li');
            li.innerHTML = '<i class="fas fa-search"></i> Orchestrating a search...';
            logList.appendChild(li);
        }
        
        // Display the query as a Markdown heading
        queryTextContent.textContent = query.trim();
        addShowMoreFunctionality(queryTextContent);
        queryHeading.style.display = 'flex';
        
        // Set button state to loading
        setSendButtonState(true);
        try {
            if (logList) {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas fa-brain"></i> Generating response for: "<b>${query.trim()}</b>"`;
                logList.appendChild(li);
                logList.scrollTo({
                    top: logList.scrollHeight,
                    behavior: 'smooth'
                });
            }

            const aiResponseElement = document.createElement('div');
            aiResponseElement.classList.add('ai-response');
            resultsContainer.appendChild(aiResponseElement);

            // Scroll to the top of the results container
            resultsContainer.scrollTo({ top: 0, behavior: 'smooth' });

            // --- Direct-to-DOM Stream Rendering ---
            let accumulatedContent = '';
            let lastUpdateTime = 0;
            const MIN_UPDATE_INTERVAL = 16; // ~60fps
            
            const streamCallback = (chunk) => {
                // Add new chunk to accumulated content
                accumulatedContent += chunk;
                currentResponseContent = accumulatedContent;
                
                // No-buffer, character-by-character rendering
                const parsedChunk = marked.parse(chunk); // Parse only the new chunk
                aiResponseElement.innerHTML += parsedChunk;
                
                // Auto-scroll to keep the latest content in view
                resultsContainer.scrollTo({
                    top: resultsContainer.scrollHeight,
                    behavior: 'smooth'
                });
            };

            const logCallback = (message) => {
                if (logList) {
                    const li = document.createElement('li');
                    li.innerHTML = message; // Use innerHTML to allow icons
                    logList.appendChild(li);
                    logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                }
            };

            try {
                const { finalResponse, sources } = await orchestrateAgents(query, userName, userLocalTime, selectedModel, streamCallback, logCallback, isShortResponseEnabled, condensedHistory);

                // Add interaction to conversation history (DISABLED)
                // conversationManager.addInteraction(query, finalResponse, sources);

                // --- Final Processing Step ---
                // This code runs after the entire stream is finished to ensure everything is perfect.
                // The stream processing now handles live updates, so we just do a final cleanup.
                processFinalResponse(aiResponseElement, finalResponse, sources);
                
                // For follow-up queries, scroll to the new content when response is complete
                if (body.classList.contains('search-active')) {
                    resultsContainer.scrollTo({
                        top: resultsContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }

                if (logList) {
                    const li = document.createElement('li');
                    li.innerHTML = '<i class="fas fa-check-circle" style="color: #10B981;"></i> Response completed successfully.';
                    logList.appendChild(li);
                    logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                }
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
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = '<i class="fas fa-hourglass-half" style="color: #FBBF24;"></i> Query limit exceeded.';
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
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
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="${errorIcon}" style="color: #EF4444;"></i> JSON parsing error in AI response`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
                } else if (errorMessage.includes('Network Error') || errorMessage.includes('Load failed') || errorMessage.includes('Failed to fetch')) {
                    errorIcon = 'fas fa-wifi';
                    userFriendlyMessage = 'Network connection issue. Please check your internet connection and try again.';
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="${errorIcon}" style="color: #EF4444;"></i> Network connectivity issue`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
                } else if (errorMessage.includes('Mistral API error') || errorMessage.includes('Serper API error') || errorMessage.includes('Coingecko API error')) {
                    errorIcon = 'fas fa-server';
                    userFriendlyMessage = 'The AI service is currently experiencing issues. Please try again in a moment.';
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="${errorIcon}" style="color: #EF4444;"></i> AI service error`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
                } else if (errorMessage.includes('Empty response') || errorMessage.includes('No content received')) {
                    errorIcon = 'fas fa-inbox';
                    userFriendlyMessage = 'The AI service returned an empty response. Please try rephrasing your query.';
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="${errorIcon}" style="color: #EF4444;"></i> Empty response from AI service`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
                } else {
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="${errorIcon}" style="color: #EF4444;"></i> Error: ${errorMessage}`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
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
                if (logList) {
                    const li = document.createElement('li');
                    li.innerHTML = '<i class="fas fa-pause-circle" style="color: #FBBF24;"></i> Response paused.';
                    logList.appendChild(li);
                    logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                }
            } else {
                // This catch block handles any other errors not caught by the orchestration try-catch
                console.error('Search failed:', error);
                if (!error.message.includes('JSON.parse') && !error.message.includes('Mistral API')) {
                    // Only log if it's not already handled above
                    if (logList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i> Unexpected error: ${error.message}`;
                        logList.appendChild(li);
                        logList.scrollTop = logList.scrollHeight; // Scroll to bottom
                    }
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
    const processFinalResponse = (aiResponseElement, fullContent, sources) => {
       let mainAnswer = fullContent;
       
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

        // Process and render the sources from the parsed JSON data
        if (sources) {
            renderSourceCards(sources, sourcesContainer);
            const sourcesTab = document.querySelector('.tab[data-tab="sources"]');
            if (sourcesTab) {
                const counter = sourcesTab.querySelector('.source-count') || document.createElement('span');
                counter.className = 'source-count';
                counter.textContent = sources.length;
                sourcesTab.appendChild(counter);
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
       if (sendBtnTop.classList.contains('loading') || sendBtnBottom.classList.contains('loading')) {
           // If loading, the button click should pause
           // Note: Implement pause functionality in orchestrateAgents if desired
           console.log('Request to pause search');
           // For now, we can just log it. To fully implement, you'd need an abort controller.
       } else if (query) {
           handleSearch(query, sourceElement);
           sourceElement.value = ''; // Clear input after sending
           autoResizeTextarea(sourceElement); // Resize to default
           updatePlaceholderForInput(sourceElement); // Update placeholder
       }
   };

   sendBtnTop.addEventListener('click', () => triggerSearchOrPause(queryInputTop));
   sendBtnBottom.addEventListener('click', () => triggerSearchOrPause(queryInputBottom));

   queryInputTop.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' && !e.shiftKey) {
           e.preventDefault();
           triggerSearchOrPause(queryInputTop);
       }
   });

   queryInputBottom.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' && !e.shiftKey) {
           e.preventDefault();
           triggerSearchOrPause(queryInputBottom);
       }
   });

   // Log container toggle
   document.addEventListener('click', (e) => {
       const logHeader = e.target.closest('#log-header-toggle');
       if (logHeader) {
           const logContainer = logHeader.closest('#live-log-container');
           if (logContainer) {
               logContainer.classList.toggle('collapsed');
           }
       }
   });

   // Tab functionality
   const tabs = document.querySelectorAll('.tab');
   const tabContents = document.querySelectorAll('.tab-content');

   tabs.forEach(tab => {
       tab.addEventListener('click', () => {
           const tabName = tab.dataset.tab;

           tabs.forEach(t => t.classList.remove('active'));
           tab.classList.add('active');

           tabContents.forEach(content => {
               if (content.id === `${tabName}-content`) {
                   content.classList.add('active');
               } else {
                   content.classList.remove('active');
               }
           });
       });
   });
   

   // --- Elastic Scroll ---
   let isScrolling = false;
   let scrollTimeout;

   resultsContainer.addEventListener('scroll', () => {
       if (!isScrolling) {
           window.requestAnimationFrame(() => {
               const queryHeadings = resultsContainer.querySelectorAll('.query-heading');
               queryHeadings.forEach(heading => {
                   const rect = heading.getBoundingClientRect();
                   if (rect.top < 10 && rect.top > -10) {
                       heading.classList.add('rubber-band-effect');
                   } else {
                       heading.classList.remove('rubber-band-effect');
                   }
               });
               isScrolling = false;
           });
       }
       isScrolling = true;

       clearTimeout(scrollTimeout);
       scrollTimeout = setTimeout(() => {
           const queryHeadings = resultsContainer.querySelectorAll('.query-heading');
           queryHeadings.forEach(heading => {
               heading.classList.remove('rubber-band-effect');
           });
       }, 150);
   });
});
