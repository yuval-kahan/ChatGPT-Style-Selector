// content.js

// Store the original WebSocket
const originalWebSocket = window.WebSocket;

// Global variables
let currentPrefix = '';
let syncEnabledState = false; // Will be set after we fetch from storage
let styles = [
  {
    name: 'Normal',
    get description() {
      return shouldShowNormalPrefix() ? 'Answer this in the default ChatGPT style:' : '';
    },
    selectedClass: 'selected-normal',
    pencilClass: 'pencil-normal',
    get prefix() {
      return shouldShowNormalPrefix() ? 'Default ChatGPT style' : '';
    },
    action: () => {
      switchStyle('Normal');
    }
  },
  {
    name: 'Concise',
    description: 'To the next question, answer concisely and focus only on the main points:',
    selectedClass: 'selected-concise',
    pencilClass: 'pencil-concise',
    prefix: 'Shorter, more direct responses',
    action: () => {
      switchStyle('Concise');
    }
  },
  {
    name: 'In-depth Info',
    description: 'Please provide detailed, comprehensive responses:',
    selectedClass: 'selected-indepth',
    pencilClass: 'pencil-indepth',
    prefix: 'Detailed and comprehensive explanations ',
    action: () => {
      switchStyle('In-depth Info');
    }
  }
];

// Helper functions to handle storage depending on syncEnabledState
function getCurrentStyle() {
  return sessionStorage.getItem('currentStyle') || 'Normal';
}

function setCurrentStyle(styleName) {
  sessionStorage.setItem('currentStyle', styleName);
  if (syncEnabledState) {
    chrome.storage.sync.set({ currentStyle: styleName });
  }
}

function getHasUsedOtherStyles() {
  return sessionStorage.getItem('hasUsedOtherStyles') === 'true';
}

function setHasUsedOtherStyles(value) {
  sessionStorage.setItem('hasUsedOtherStyles', value ? 'true' : 'false');
  if (syncEnabledState) {
    chrome.storage.sync.set({ hasUsedOtherStyles: value ? 'true' : 'false' });
  }
}

// This function sets up initial style state based on syncEnabled
function initializeStyleState() {
  if (syncEnabledState) {
    chrome.storage.sync.get(['currentStyle', 'hasUsedOtherStyles'], ({ currentStyle = 'Normal', hasUsedOtherStyles = 'false' }) => {
      sessionStorage.setItem('currentStyle', currentStyle);
      sessionStorage.setItem('hasUsedOtherStyles', hasUsedOtherStyles);
      updateSelectedStyle(currentStyle);
    });
  } else {
    // If sync is off, rely on sessionStorage or default values
    if (!sessionStorage.getItem('currentStyle')) {
      sessionStorage.setItem('currentStyle', 'Normal');
    }
    if (!sessionStorage.getItem('hasUsedOtherStyles')) {
      sessionStorage.setItem('hasUsedOtherStyles', 'false');
    }
    updateSelectedStyle(getCurrentStyle());
  }
}

// Setup syncEnabledState
chrome.storage.sync.get(['syncEnabled'], ({ syncEnabled = false }) => {
  syncEnabledState = syncEnabled;
  initializeStyleState();
});

// Message interceptor
const messageInterceptor = {
  currentMessage: '',
  isProcessingMessage: false,
  originalMessageEvent: null,
  realMessage: '',
  interceptMessage(event) {
    try {
      if (typeof event.data === 'string' && event.data.trim().startsWith('{')) {
        const data = JSON.parse(event.data);
        if (data && data.message && data.message.content && data.message.content.parts) {
          const self = this;
          return new Promise((resolve) => {
            chrome.storage.sync.get(['isEnabled', 'suppressStyleMessage'], function (state) {
              const isEnabled = state.isEnabled ?? true;
              const suppressStyleMessage = state.suppressStyleMessage ?? false;
              if (isEnabled && !suppressStyleMessage) {
                const currentStyle = getCurrentStyle();
                const style = styles.find(s => s.name === currentStyle);
                const hasUsedOthers = getHasUsedOtherStyles();

                if (style) {
                  if (style.name === 'Normal' && !hasUsedOthers) {
                    self.realMessage = data.message.content.parts[0];
                  } else {
                    if (style.description && (style.name !== 'Normal' || hasUsedOthers)) {
                      self.realMessage = style.description + ' ' + data.message.content.parts[0];
                    } else {
                      self.realMessage = data.message.content.parts[0];
                    }
                  }
                } else {
                  self.realMessage = data.message.content.parts[0];
                }
              } else {
                self.realMessage = data.message.content.parts[0];
              }
              resolve(true);
            });
          });
        }
      }
      return Promise.resolve(false);
    } catch (e) {
      if (event.data.trim().startsWith('{')) {
        console.debug('Error parsing message:', e);
      }
      return Promise.resolve(false);
    }
  }
};

// Functions
function updateButtonVisibility(isEnabled) {
  const buttonWrapper = document.querySelector('.style-button-wrapper');
  if (buttonWrapper) {
    buttonWrapper.style.display = isEnabled ? 'flex' : 'none';
  }
}

async function waitForElement(selector, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Element ${selector} not found after ${timeout}ms`);
}

function shouldShowNormalPrefix() {
  return getHasUsedOtherStyles();
}

function isNewConversation() {
  return window.location.pathname === '/';
}

function ensureFreshConversationState() {
  const currentStyle = getCurrentStyle();
  if (currentStyle === 'Normal' && isNewConversation()) {
    setHasUsedOtherStyles(false);
    sessionStorage.setItem('currentPrefix', '');
    console.log('Reset conversation state:', {
      hasUsedOtherStyles: getHasUsedOtherStyles(),
      currentStyle: currentStyle,
      currentPrefix: sessionStorage.getItem('currentPrefix'),
      isNew: isNewConversation()
    });
  }
}

// Listen to messages from background or popup changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORAGE_CHANGED') {
    if (message.key === 'isEnabled') {
      const buttonWrapper = document.querySelector('.style-button-wrapper');
      if (buttonWrapper) {
        buttonWrapper.style.display = message.value ? 'flex' : 'none';
      }

      // If disabled, force Normal style
      if (!message.value) {
        switchStyle('Normal');
      }
    } else if (message.key === 'currentStyle') {
      // Only update if syncEnabledState is true
      if (syncEnabledState) {
        sessionStorage.setItem('currentStyle', message.value);
        updateSelectedStyle(message.value);
      }
    } else if (message.key === 'syncEnabled') {
      const newSyncEnabled = message.value;
      handleSyncModeChange(newSyncEnabled);
    }
  } else if (message.type === 'TEXT_DIRECTION_CHANGED') {
    console.log('Content script received direction change:', message.direction);
    if (window.textDirectionHandler) {
      window.textDirectionHandler.setDirection(message.direction);
      
      // Handle text direction changes without breaking formatting
      const promptDiv = document.querySelector('#prompt-textarea');
      if (promptDiv) {
        const text = promptDiv.value || promptDiv.innerText;
        if (text) {
          window.textDirectionHandler.applyDirectionToElement(promptDiv);
        }
      }
      
      sendResponse({ success: true });
    } else {
      console.error('TextDirectionHandler not initialized');
      sendResponse({ success: false });
    }
    return true;
  }
});

// Add handler for GET_ENABLED_STATE separately
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ENABLED_STATE') {
    chrome.storage.sync.get('isEnabled', function(data) {
      sendResponse({ isEnabled: data.isEnabled ?? true });
    });
    return true;
  }
});

// Separate storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.textDirection) {
    console.log('Storage change detected for text direction:', changes.textDirection.newValue);
    if (window.textDirectionHandler) {
      window.textDirectionHandler.setDirection(changes.textDirection.newValue);
    }
  }
});



function handleSyncModeChange(newSyncEnabled) {
  if (newSyncEnabled === syncEnabledState) return;
  syncEnabledState = newSyncEnabled;

  if (syncEnabledState) {
    // Sync just turned ON: read from sync storage
    chrome.storage.sync.get(['currentStyle', 'hasUsedOtherStyles'], ({ currentStyle = 'Normal', hasUsedOtherStyles = 'false' }) => {
      sessionStorage.setItem('currentStyle', currentStyle);
      sessionStorage.setItem('hasUsedOtherStyles', hasUsedOtherStyles);
      updateSelectedStyle(currentStyle);
      console.log('Sync turned ON, using global style:', currentStyle);
    });
  } else {
    // Sync turned OFF: We now rely solely on sessionStorage for this tab
    // sessionStorage already has the latest style from before. Just continue.
    console.log('Sync turned OFF, this tab will now use independent style:', getCurrentStyle());
  }
}

chrome.runtime.sendMessage({ type: 'GET_ENABLED_STATE' }, (response) => {
  if (response && response.isEnabled !== undefined) {
    updateButtonVisibility(response.isEnabled);
  }
});

function switchStyle(styleName) {
  const style = styles.find(s => s.name === styleName);
  if (!style) return;

  chrome.storage.sync.get('isEnabled', function (data) {
    const isEnabled = data.isEnabled ?? true;
    if (isEnabled || (!isEnabled && styleName === 'Normal')) {
      if (styleName !== 'Normal') {
        setHasUsedOtherStyles(true);
      } else if (!getHasUsedOtherStyles()) {
        sessionStorage.setItem('currentPrefix', '');
      }

      setCurrentStyle(styleName);
      updateSelectedStyle(styleName);
      console.log(`Switched to style: ${styleName}, prefix: ${sessionStorage.getItem('currentPrefix') || ''}`);
    }
  });
}

function removeExistingPrefixes(message) {
  const allPrefixes = styles.map(s => s.prefix).filter(Boolean);
  allPrefixes.sort((a, b) => b.length - a.length);

  let cleanMessage = message;
  allPrefixes.forEach(prefix => {
    const escapedPrefix = prefix
      .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    const prefixRegex = new RegExp(`^${escapedPrefix}`, 'i');
    cleanMessage = cleanMessage.replace(prefixRegex, '');
  });

  return cleanMessage.trim();
}

function injectStyles() {
  if (!document.head) return;

  if (document.querySelector('#hide-prompt-styles')) return;

  const style = document.createElement('style');
  style.id = 'hide-prompt-styles';
  style.textContent = `
    [data-hidden-prompt="true"] {
      position: absolute !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

const textsToHide = [
  "To the next question, answer concisely and focus only on the main points:",
  "Please provide detailed, comprehensive responses:",
  "Answer this in the default ChatGPT style:"
];

function hidePromptTexts() {
  const walker = document.createTreeWalker(
    document.querySelector('main') || document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (node.parentElement?.hasAttribute('data-hidden-prompt')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement?.tagName === 'SCRIPT' || node.parentElement?.tagName === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent;
    for (const hideText of textsToHide) {
      if (text.includes(hideText)) {
        const parent = node.parentElement;
        if (!parent || parent.hasAttribute('data-hidden-prompt')) continue;

        const index = text.indexOf(hideText);
        const before = document.createTextNode(text.substring(0, index));
        const after = document.createTextNode(text.substring(index + hideText.length));

        const hiddenSpan = document.createElement('span');
        hiddenSpan.style.cssText = 'position: absolute !important; height: 0 !important; width: 0 !important; overflow: hidden !important; clip: rect(0,0,0,0) !important;';
        hiddenSpan.textContent = hideText;
        hiddenSpan.setAttribute('data-hidden-prompt', 'true');

        parent.insertBefore(before, node);
        parent.insertBefore(hiddenSpan, node);
        parent.insertBefore(after, node);
        parent.removeChild(node);
        break;
      }
    }
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedHidePromptTexts = debounce(hidePromptTexts, 100);

function setupObserver() {
  const targetNode = document.querySelector('main') || document.body;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutation => mutation.target.classList && !mutation.target.classList.contains('hidden-prompt'))) {
      debouncedHidePromptTexts();
    }
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function setupMessageObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const hasNewMessage = Array.from(mutation.addedNodes).some(node =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.classList?.contains('markdown') || node.querySelector('.markdown'))
        );
        if (hasNewMessage) {
          setTimeout(hidePromptTexts, 100);
        }
      }
    }
  });

  const chatContainer = document.querySelector('main');
  if (chatContainer) {
    observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });
  }
}

async function sendMessage(text, shouldSend = false) {
  const promptDiv = document.querySelector('#prompt-textarea');
  let userMessage = text || '';

  // If you have logic to extract newlines from promptDiv, do it here.
  // For now, we assume userMessage already contains '\n' where line breaks should be.

  const { isEnabled, suppressStyleMessage } = await new Promise(resolve => {
    chrome.storage.sync.get(['isEnabled', 'suppressStyleMessage'], (state) => {
      resolve({
        isEnabled: state.isEnabled ?? true,
        suppressStyleMessage: state.suppressStyleMessage ?? false
      });
    });
  });

  let prefix = '';
  let finalMessage = userMessage;

  if (isEnabled && !suppressStyleMessage) {
    const savedStyle = getCurrentStyle();
    const hasUsedOthers = getHasUsedOtherStyles();
    const currentStyle = styles.find(s => s.name === savedStyle) || styles.find(s => s.name === 'Normal');
    if (currentStyle && currentStyle.description && (currentStyle.name !== 'Normal' || hasUsedOthers)) {
      prefix = currentStyle.description + ' ';
      // Integrate prefix with userMessage logically (for finalMessage):
      finalMessage = prefix + userMessage;
    }
  }

  if (shouldSend && promptDiv) {
    // Split userMessage by '\n' to create multiple paragraphs
    const lines = userMessage.split('\n').filter(line => line.trim() !== '');

    // Create paragraphs for each line
    let paragraphs = lines.map((line, i) => {
      let content = line;
      // If this is the first line and we have a prefix, prepend it
      if (i === 0 && prefix) {
        content = prefix + content;
      } else if (i > 0 && prefix) {
        // Add a space at the start of all lines after the first one when we have a prefix
        content = ' ' + content;
      }
      // Only create a paragraph if there's content
      return content ? `<p>${content}</p>` : '';
    }).join('');

    // If userMessage had no lines (empty), create at least one paragraph
    if (!paragraphs) {
      paragraphs = `<p>${prefix || ''}<br></p>`;
    }

    // Set the prompt's innerHTML
    promptDiv.innerHTML = paragraphs;

    // Give ProseMirror time to parse the inserted content
    await new Promise(resolve => setTimeout(resolve, 50));

    // Dispatch input event so ProseMirror recognizes the update
    promptDiv.dispatchEvent(new Event('input', { bubbles: true }));

    // Update interceptor with the final message
    messageInterceptor.currentMessage = finalMessage;
  }

  return finalMessage;
}


// Update the existing keydown event listener in content.js
document.addEventListener('keydown', async (event) => {
  // Skip if it's NumpadEnter and newline is enabled
  if (event.code === 'NumpadEnter' && window.isNumpadEnterNewLineEnabled?.()) {
    return;
  }

  // Original Enter key handling
  if (event.key === 'Enter' && !event.shiftKey) {
    const promptDiv = document.querySelector('#prompt-textarea');
    if (promptDiv) {
      event.preventDefault();
      event.stopPropagation();

      const text = promptDiv.innerText.trim();
      if (text) {
        promptDiv.style.opacity = '0';
        await sendMessage(text, true);
        promptDiv.style.opacity = '1';

        const sendButton = document.querySelector('button[data-testid="send-button"]');
        if (sendButton && !sendButton.disabled) {
          sendButton.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }));
        }
      }
    }
  }
}, true);

document.addEventListener('click', async (event) => {
  const sendButton = event.target.closest('button[data-testid="send-button"]');
  if (!sendButton || sendButton.disabled) return;

  const promptDiv = document.querySelector('#prompt-textarea');
  if (!promptDiv) return;

  const text = promptDiv.innerText.trim();
  if (!text) return;

  const originalEvent = event;
  if (originalEvent.isTrusted) {
    originalEvent.preventDefault();
    originalEvent.stopPropagation();

    await sendMessage(text, true);
    sendButton.click();
  }
}, true);

document.addEventListener('input', (event) => {
  messageInterceptor.interceptMessage(event);
}, true);

function injectButton() {
  const container = document.querySelector('div.flex.gap-x-1') ||
    document.querySelector('div.flex.items-center') ||
    document.querySelector('div[class*="flex gap"]');

  if (!container) {
    console.log('Container not found');
    return false;
  }

  if (document.querySelector('.style-button-wrapper')) return true;

  const wrapper = document.createElement('div');
  wrapper.className = 'style-button-wrapper';
  wrapper.style.display = 'none';
  wrapper.style.alignItems = 'center';
  wrapper.style.marginLeft = '4px';
  wrapper.style.position = 'relative';

  const button = document.createElement('button');
  button.className = 'relative flex h-8 min-w-8 items-center justify-center p-1 text-xs font-semibold';
  button.setAttribute('data-tooltip', 'Choose style');
  button.style.cssText = 'position: relative; cursor: pointer; background: transparent;';

  if (!document.querySelector('#tooltip-styles')) {
    const style = document.createElement('style');
    style.id = 'tooltip-styles';
    style.textContent = `
      [data-tooltip] {
        position: relative;
        border-radius: 8px;
        transition: background-color 0.2s;
      }
      [data-tooltip]:hover {
        background-color: rgba(210, 210, 210, 0.95) !important;
      }
      [data-tooltip]:before {
        content: attr(data-tooltip);
        position: absolute;
        top: 50%;
        right: 100%;
        transform: translateY(-50%);
        background-color: rgb(0, 0, 0);
        color: white;
        font-size: 14px;
        font-weight: 400;
        white-space: nowrap;
        padding: 8px 12px;
        border-radius: 6px;
        margin-right: 4px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.15s ease-in-out;
        pointer-events: none;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      [data-tooltip]:after {
        content: '';
        position: absolute;
        top: 50%;
        right: calc(100% + 0px);
        transform: translateY(-50%);
        width: 0;
        height: 0;
        border-left: 4px solid rgb(0, 0, 0);
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.15s ease-in-out;
        pointer-events: none;
        z-index: 10000;
      }
      [data-tooltip]:hover:before,
      [data-tooltip]:hover:after {
        opacity: 1;
        visibility: visible;
      }
      [data-tooltip]:hover {
        background-color: rgba(210, 210, 210, 0.95) !important;
      }
    `;
    document.head.appendChild(style);
  }

  button.style.cursor = 'pointer';

  const descriptionPanel = document.createElement('div');
  descriptionPanel.className = 'description-panel';
  descriptionPanel.textContent = 'Choose an action';

  const menu = document.createElement('div');
  menu.className = 'style-menu';
  menu.style.position = 'absolute';
  menu.style.bottom = '100%';
  menu.style.left = '0';
  menu.style.marginBottom = '10px';
  menu.style.backgroundColor = 'white';
  menu.style.borderRadius = '8px';
  menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  menu.style.zIndex = '1000';
  menu.style.display = 'none';
  menu.style.width = '400px';
  menu.style.border = '1px solid rgba(0,0,0,0.1)';

  const menuContent = document.createElement('div');
  menuContent.style.display = 'flex';

  const buttonList = document.createElement('div');
  buttonList.style.width = '200px';
  buttonList.style.borderRight = '1px solid rgba(0,0,0,0.1)';
  buttonList.style.padding = '4px 0';

  styles.forEach(style => {
    const styleButton = document.createElement('button');
    styleButton.className = 'style-option';
    styleButton.style.width = '100%';
    styleButton.style.padding = '6px 16px';
    styleButton.style.textAlign = 'left';
    styleButton.style.border = 'none';
    styleButton.style.background = 'none';
    styleButton.style.cursor = 'pointer';
    styleButton.textContent = style.name;

    if (getCurrentStyle() === style.name) {
      styleButton.classList.add(style.selectedClass);
    }

    styleButton.addEventListener('mouseover', () => {
      descriptionPanel.textContent = style.prefix || 'Default ChatGPT response';
      styleButton.style.backgroundColor = '#f3f4f6';
    });

    styleButton.addEventListener('mouseout', () => {
      styleButton.style.backgroundColor = 'transparent';
    });

    styleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (style.action) {
        style.action();
        menu.style.display = 'none';
      }
    });

    buttonList.appendChild(styleButton);
  });

  menuContent.appendChild(buttonList);
  menuContent.appendChild(descriptionPanel);
  menu.appendChild(menuContent);
  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  `;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  container.insertBefore(wrapper, container.firstChild);

  chrome.storage.sync.get('isEnabled', function (data) {
    const isEnabled = data.isEnabled ?? true;
    updateButtonVisibility(isEnabled);
  });

  console.log('Button injected successfully');
  return true;
}

function updateSelectedStyle(selectedName) {
  const buttons = document.querySelectorAll('.style-option');
  const pencilButton = document.querySelector('.style-button-wrapper button');

  if (pencilButton) {
    pencilButton.classList.remove('pencil-normal', 'pencil-concise', 'pencil-indepth');

    buttons.forEach(button => {
      button.classList.remove('selected-normal', 'selected-concise', 'selected-indepth');
      const style = styles.find(s => s.name === button.textContent);
      if (style && button.textContent === selectedName) {
        button.classList.add(style.selectedClass);
        pencilButton.classList.add(style.pencilClass);
        sessionStorage.setItem('currentPencilClass', style.pencilClass);
      }
    });
  }
}

function setupPencilObserver() {
  const observer = new MutationObserver(async () => {
    const pencilButton = document.querySelector('.style-button-wrapper button');
    if (pencilButton) {
      const savedStyle = getCurrentStyle();
      const style = styles.find(s => s.name === savedStyle);
      if (style) {
        pencilButton.classList.remove('pencil-normal', 'pencil-concise', 'pencil-indepth');
        pencilButton.classList.add(style.pencilClass);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function setupConversationObserver() {
  const main = document.querySelector('main');
  if (!main) return;
  const conversationObserver = new MutationObserver(() => {
    setTimeout(() => {
      hidePromptTexts();
    }, 300);
  });
  conversationObserver.observe(main, { childList: true, subtree: true });
}

function setupNavigationObserver() {
  if (!document.body) {
    setTimeout(setupNavigationObserver, 100);
    return;
  }

  const observer = new MutationObserver(() => {
    if (isNewConversation()) {
      ensureFreshConversationState();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('Navigation observer setup complete');
}

function initializeWebSocket() {
  window.WebSocket = function(url, protocols) {
    const socket = new originalWebSocket(url, protocols);
    const originalSend = socket.send;
    const originalAddEventListener = socket.addEventListener;

    socket.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const wrappedListener = async function(event) {
          const shouldProcess = await messageInterceptor.interceptMessage(event);
          if (shouldProcess) {
            const modifiedEvent = new MessageEvent('message', {
              data: JSON.stringify({
                message: {
                  content: {
                    parts: [messageInterceptor.realMessage]
                  }
                }
              }),
              origin: event.origin,
              lastEventId: event.lastEventId,
              source: event.source,
              ports: event.ports,
            });
            listener.call(this, modifiedEvent);
            setTimeout(hidePromptTexts, 100);
          } else {
            listener.call(this, event);
          }
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    socket.send = async function(data) {
      try {
        if (typeof data === 'string' && data.trim().startsWith('{')) {
          const parsedData = JSON.parse(data);
          if (parsedData.messages && parsedData.messages[0].content.parts) {
            const { isEnabled, suppressStyleMessage } = await new Promise(resolve => {
              chrome.storage.sync.get(['isEnabled', 'suppressStyleMessage'], (state) => {
                resolve({
                  isEnabled: state.isEnabled ?? true,
                  suppressStyleMessage: state.suppressStyleMessage ?? false
                });
              });
            });

            if (isEnabled && !suppressStyleMessage) {
              const currentStyle = getCurrentStyle();
              const style = styles.find(s => s.name === currentStyle);
              if (style && style.description) {
                parsedData.messages[0].content.parts[0] =
                  style.description + ' ' + parsedData.messages[0].content.parts[0];
                data = JSON.stringify(parsedData);
              }
            }
          }
        }
      } catch (e) {
        console.debug('Non-JSON message, sending as is');
      }

      const result = originalSend.call(this, data);
      setTimeout(hidePromptTexts, 100);
      return result;
    };

    return socket;
  };
}

async function initialize() {
  ensureFreshConversationState();

  injectStyles();
  hidePromptTexts();
  setupObserver();
  setupMessageObserver();
  setupPencilObserver();
  setupConversationObserver();
  setupNavigationObserver();

  const savedStyle = getCurrentStyle();
  await waitForElement('.style-button-wrapper button');
  updateSelectedStyle(savedStyle);
}

function setupMainObserver() {
  if (document.body) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.style-button-wrapper') && isChatGPTReady()) {
        injectButton();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    setTimeout(setupMainObserver, 100);
  }
}

function isChatGPTReady() {
  const textarea = document.querySelector('#prompt-textarea');
  const mainContainer = document.querySelector('main');
  return textarea && mainContainer;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensureFreshConversationState();
    initialize();
  });
} else {
  ensureFreshConversationState();
  initialize();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('hasUsedOtherStyles') === null) {
      sessionStorage.setItem('hasUsedOtherStyles', 'false');
    }
    setupMainObserver();
    const savedStyle = getCurrentStyle();
    if (savedStyle) {
      switchStyle(savedStyle);
    }
    initializeWebSocket();
  });
} else {
  if (sessionStorage.getItem('hasUsedOtherStyles') === null) {
    sessionStorage.setItem('hasUsedOtherStyles', 'false');
  }
  setupMainObserver();
  const savedStyle = getCurrentStyle();
  if (savedStyle) {
    switchStyle(savedStyle);
  }
  initializeWebSocket();
}

window.addEventListener('unload', () => {});
