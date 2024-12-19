// First, create a stub TextDirectionHandler to prevent errors
window.textDirectionHandler = {
    setDirection: function(direction) {
      // Forward the call to our LanguagePositionHandler once it's initialized
      if (window.languagePositionHandler) {
        window.languagePositionHandler.forceState(direction);
      }
    },
    initialized: true
};
  
(function() {
    window.__languageHandlerInitialized = false;

    class LanguagePositionHandler {
        constructor() {
            this.currentState = 'dynamic';
            this.initialized = false;
            this.messageCache = new Map();
            this.initializationAttempts = 0;
            this.maxInitializationAttempts = 10;
            
            // Define RTL scripts regex pattern
            this.rtlPattern = new RegExp([
                '[\u0600-\u06FF]',   // Arabic
                '[\u0590-\u05FF]',   // Hebrew
                '[\u0700-\u074F]',   // Syriac
                '[\u0780-\u07BF]',   // Dhivehi/Thaana
                '[\u07C0-\u07FF]',   // N'Ko
                '[\uFB50-\uFDFF]',   // Arabic Presentation Forms-A
                '[\uFE70-\uFEFF]'    // Arabic Presentation Forms-B
            ].join('|'));

            // Start initialization when DOM is ready
            if (document.readyState !== 'loading') {
                this.init();
            } else {
                document.addEventListener('DOMContentLoaded', () => this.init());
            }
        }

        async init() {
            // Get stored direction before initialization
            const { textDirection } = await chrome.storage.sync.get('textDirection');
            this.currentState = textDirection || 'dynamic';
            await this.forceInitialization();
            this.setupInputHandler();
        }

        isRTLText(text) {
            return this.rtlPattern.test(text);
        }

        async forceInitialization() {
            console.log('Starting initialization with state:', this.currentState);
            
            this.setupMessageListener();
            this.setupStorageListener();
            this.setupMessageObserver();
            
            this.startInitializationLoop();
            
            setInterval(() => this.validateState(), 1000);
            
            // Apply current state instead of forcing dynamic
            await this.forceState(this.currentState);
        }

        setupInputHandler() {
            const handleInput = (event) => {
                const inputField = event.target;
                const text = inputField.value || inputField.textContent;
                const isRTL = this.isRTLText(text);

                // Apply styles based on current state and text content
                if (this.currentState === 'dynamic') {
                    Object.assign(inputField.style, {
                        direction: isRTL ? 'rtl' : 'ltr',
                        textAlign: isRTL ? 'right' : 'left',
                        unicodeBidi: 'plaintext'
                    });

                    const container = inputField.closest('.flex');
                    if (container) {
                        container.style.direction = isRTL ? 'rtl' : 'ltr';
                    }
                } else {
                    const isStaticRTL = this.currentState === 'rtl';
                    Object.assign(inputField.style, {
                        direction: isStaticRTL ? 'rtl' : 'ltr',
                        textAlign: isStaticRTL ? 'right' : 'left',
                        unicodeBidi: 'plaintext'
                    });

                    const container = inputField.closest('.flex');
                    if (container) {
                        container.style.direction = isStaticRTL ? 'rtl' : 'ltr';
                    }
                }
            };

            const initializeInput = (inputField) => {
                if (!inputField) return;
                inputField.removeEventListener('input', handleInput);
                inputField.addEventListener('input', handleInput);
                handleInput({ target: inputField });
            };

            const setupObserver = () => {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                const inputField = node.matches('#prompt-textarea') ? 
                                    node : node.querySelector('#prompt-textarea');
                                if (inputField) {
                                    initializeInput(inputField);
                                }
                            }
                        });
                    });
                });

                if (document.body) {
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    
                    const existingInput = document.querySelector('#prompt-textarea');
                    if (existingInput) {
                        initializeInput(existingInput);
                    }
                }

                return observer;
            };

            let observer = setupObserver();

            if (!document.body) {
                const bodyObserver = new MutationObserver(() => {
                    if (document.body) {
                        observer = setupObserver();
                        bodyObserver.disconnect();
                    }
                });

                bodyObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }
        }

        async forceState(state) {
            console.log('Forcing state:', state);
            this.currentState = state;
            await chrome.storage.sync.set({ textDirection: state });
            await this.applyStateToAllMessages(true);
            
            // Update input field if exists
            const inputField = document.querySelector('#prompt-textarea');
            if (inputField) {
                // Create a synthetic input event
                const event = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                });
                inputField.dispatchEvent(event);
            }
        }

        startInitializationLoop() {
            const attemptInitialization = () => {
                if (this.initializationAttempts >= this.maxInitializationAttempts) return;
                
                this.initializationAttempts++;
                console.log(`Initialization attempt ${this.initializationAttempts}`);
                
                this.applyStateToAllMessages(true);
                
                if (!this.initialized) {
                    setTimeout(attemptInitialization, 500);
                }
            };

            attemptInitialization();
        }

        validateState() {
            const messages = document.querySelectorAll('.relative.max-w-\\[var\\(--user-chat-width\\,70\\%\\)\\]');
            let needsReapplication = false;

            messages.forEach(container => {
                const textElement = container.querySelector('.whitespace-pre-wrap');
                if (textElement && !this.isMessageProperlyFormatted(container, textElement)) {
                    needsReapplication = true;
                }
            });

            if (needsReapplication) {
                console.log('State validation failed, reapplying...');
                this.applyStateToAllMessages(true);
            }
        }

        isMessageProperlyFormatted(container, textElement) {
            if (this.currentState !== 'dynamic') {
                const isRTL = this.currentState === 'rtl';
                const currentDirection = textElement.style.direction;
                const currentAlign = textElement.style.textAlign;
                return isRTL ? 
                    (currentDirection === 'rtl' && currentAlign === 'right') :
                    (currentDirection === 'ltr' && currentAlign === 'left');
            }

            const isRTL = this.isRTLText(textElement.textContent);
            const currentDirection = textElement.style.direction;
            const currentAlign = textElement.style.textAlign;

            return isRTL ? 
                (currentDirection === 'rtl' && currentAlign === 'right') :
                (currentDirection === 'ltr' && currentAlign === 'left');
        }

        setupStorageListener() {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'sync' && changes.textDirection) {
                    this.forceState(changes.textDirection.newValue);
                }
            });
        }

        setupMessageListener() {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'TEXT_DIRECTION_CHANGED') {
                    this.forceState(message.direction);
                    sendResponse({ success: true });
                }
            });
        }

        applyStateToAllMessages(force = false) {
            console.log('Applying state to all messages:', this.currentState);
            const messages = document.querySelectorAll('.relative.max-w-\\[var\\(--user-chat-width\\,70\\%\\)\\]');

            messages.forEach(container => {
                const textElement = container.querySelector('.whitespace-pre-wrap');
                if (!textElement) return;

                if (this.currentState === 'dynamic') {
                    const isRTL = this.isRTLText(textElement.textContent);
                    this.applyDynamicStyling(container, textElement, isRTL);
                } else {
                    this.applyStaticStyling(container, textElement, this.currentState === 'rtl');
                }
            });

            this.initialized = true;
        }

        applyDynamicStyling(container, textElement, isRTL) {
            Object.assign(container.style, {
                marginLeft: isRTL ? 'auto' : '0',
                marginRight: isRTL ? '0' : 'auto',
                direction: isRTL ? 'rtl' : 'ltr'
            });

            Object.assign(textElement.style, {
                direction: isRTL ? 'rtl' : 'ltr',
                textAlign: isRTL ? 'right' : 'left'
            });
        }

        applyStaticStyling(container, textElement, isRTL) {
            Object.assign(container.style, {
                marginLeft: isRTL ? 'auto' : '0',
                marginRight: isRTL ? '0' : 'auto',
                direction: isRTL ? 'rtl' : 'ltr'
            });

            Object.assign(textElement.style, {
                direction: isRTL ? 'rtl' : 'ltr',
                textAlign: isRTL ? 'right' : 'left'
            });
        }

        setupMessageObserver() {
            const observer = new MutationObserver((mutations) => {
                let hasNewMessages = false;

                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.matches('.relative.max-w-\\[var\\(--user-chat-width\\,70\\%\\)\\]') ||
                                node.querySelector('.relative.max-w-\\[var\\(--user-chat-width\\,70\\%\\)\\]')) {
                                hasNewMessages = true;
                            }
                        }
                    });
                });

                if (hasNewMessages) {
                    setTimeout(() => this.applyStateToAllMessages(true), 0);
                    setTimeout(() => this.applyStateToAllMessages(true), 100);
                }
            });

            const chatContainer = document.querySelector('main');
            if (chatContainer) {
                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }
    }

    // Create handler instance immediately
    window.languagePositionHandler = new LanguagePositionHandler();

    // Add multiple initialization points with state restoration
    ['load', 'DOMContentLoaded', 'readystatechange'].forEach(event => {
        document.addEventListener(event, async () => {
            if (window.languagePositionHandler) {
                const { textDirection } = await chrome.storage.sync.get('textDirection');
                if (textDirection) {
                    window.languagePositionHandler.currentState = textDirection;
                }
                window.languagePositionHandler.applyStateToAllMessages(true);
            }
        });
    });

    // Force immediate execution with stored state
    if (document.readyState !== 'loading') {
        chrome.storage.sync.get('textDirection').then(({ textDirection }) => {
            if (window.languagePositionHandler && textDirection) {
                window.languagePositionHandler.currentState = textDirection;
                window.languagePositionHandler.applyStateToAllMessages(true);
            }
        });
    }
})();