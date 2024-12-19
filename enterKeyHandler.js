// Initialize state
let isEnterKeyNewLineEnabled = false;

// Function to insert a new line at the cursor position
function insertNewLine(promptDiv) {
    // Get the current selection
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    // Create and insert a line break
    const lineBreak = document.createElement('br');
    range.insertNode(lineBreak);
    
    // Move cursor after the new line
    range.setStartAfter(lineBreak);
    range.setEndAfter(lineBreak);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Ensure the textarea updates
    promptDiv.dispatchEvent(new Event('input', { bubbles: true }));
}

// Initialize state from storage
chrome.storage.sync.get(['enterKeyNewLine'], ({ enterKeyNewLine = false }) => {
    isEnterKeyNewLineEnabled = enterKeyNewLine;
    console.log('Enter key handler initialized:', { isEnterKeyNewLineEnabled });
});

// Listen for state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.enterKeyNewLine) {
        isEnterKeyNewLineEnabled = changes.enterKeyNewLine.newValue;
        console.log('Enter key handler state updated:', { isEnterKeyNewLineEnabled });
    }
});

// Make the state checker available globally
window.isNumpadEnterNewLineEnabled = () => isEnterKeyNewLineEnabled;

// Capture keydown events early with high priority
document.addEventListener('keydown', (event) => {
    // Only handle NumpadEnter
    if (event.code !== 'NumpadEnter') return;
    
    const promptDiv = document.querySelector('#prompt-textarea');
    if (!promptDiv) return;

    if (isEnterKeyNewLineEnabled) {
        // Prevent default behavior and stop event propagation
        event.preventDefault();
        event.stopImmediatePropagation();
        
        insertNewLine(promptDiv);
        
        // Prevent the message from being sent
        return false;
    }
}, {
    capture: true,    // Handle event in capture phase
    passive: false    // Allow preventDefault
});

// Capture keyup events to prevent any delayed effects
document.addEventListener('keyup', (event) => {
    if (event.code === 'NumpadEnter' && isEnterKeyNewLineEnabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return false;
    }
}, {
    capture: true,
    passive: false
});

// Handle any click events that might be triggered by NumpadEnter
document.addEventListener('click', (event) => {
    if (isEnterKeyNewLineEnabled && 
        event.isTrusted && 
        event.target?.closest('button[data-testid="send-button"]') &&
        event._fromNumpadEnter) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return false;
    }
}, {
    capture: true,
    passive: false
});

// Override the document.addEventListener to patch Enter key handling
const originalAddEventListener = document.addEventListener;
document.addEventListener = function(type, listener, options) {
    if (type === 'keydown') {
        const wrappedListener = function(event) {
            // If it's NumpadEnter and newline is enabled, don't execute other handlers
            if (event.code === 'NumpadEnter' && isEnterKeyNewLineEnabled) {
                return;
            }
            return listener.apply(this, arguments);
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.apply(this, arguments);
};

// Log that the script has loaded
console.log('Enter key handler script loaded and initialized');