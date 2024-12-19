// Storage keys for info bubble state
const STORAGE_KEYS = {
  PENCIL_INFO_SEEN: 'pencilInfoSeen',
  SYNC_INFO_SEEN: 'syncInfoSeen',
  ENTER_KEY_INFO_SEEN: 'enterKeyInfoSeen',
  TEXT_DIRECTION_INFO_SEEN: 'textDirectionInfoSeen'
};

console.clear(); // Clear previous logs

// Initialize and handle toggle functionality
document.addEventListener('DOMContentLoaded', async () => {
  const toggleButton = document.getElementById('toggle-button');
  const syncToggleButton = document.getElementById('sync-toggle-button');
  const enterKeyToggleButton = document.getElementById('enter-key-toggle-button');
  const textDirectionSelect = document.getElementById('text-direction-select');
  const toggleText = document.querySelector('.toggle-text');
  const syncToggleText = syncToggleButton.parentElement.querySelector('.toggle-text');
  const enterKeyToggleText = enterKeyToggleButton.parentElement.querySelector('.toggle-text');
  
  console.log('DOM Content Loaded, initializing...');
  
  // Get initial states with proper error handling
  try {
    const { 
      isEnabled = true, 
      syncEnabled = false, 
      enterKeyNewLine = false,
      textDirection = 'dynamic'
    } = await chrome.storage.sync.get(['isEnabled', 'syncEnabled', 'enterKeyNewLine', 'textDirection']);
    
    updateButtonState(isEnabled);
    updateSyncButtonState(syncEnabled);
    updateEnterKeyButtonState(enterKeyNewLine);
    textDirectionSelect.value = textDirection;
    
    console.log('Initial states loaded:', { 
      isEnabled, 
      syncEnabled, 
      enterKeyNewLine,
      textDirection 
    });
  } catch (error) {
    console.error('Error getting initial states:', error);
    updateButtonState(true); // Default to enabled if error
    updateSyncButtonState(false); // Default to disabled if error
    updateEnterKeyButtonState(false); // Default to disabled if error
    textDirectionSelect.value = 'dynamic'; // Default to dynamic if error
  }
  
  // Main toggle button listener
  toggleButton.addEventListener('change', async () => {
    const isEnabled = toggleButton.checked;
    try {
      await chrome.storage.sync.set({ isEnabled });
      updateButtonState(isEnabled);
      await chrome.action.setBadgeText({ text: isEnabled ? 'ON' : 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ 
        color: isEnabled ? '#2196F3' : '#666666' 
      });
      console.log('Main toggle state updated:', isEnabled);
    } catch (error) {
      console.error('Error updating state:', error);
      toggleButton.checked = !isEnabled;
      updateButtonState(!isEnabled);
    }
  });

  // Sync toggle button listener
  syncToggleButton.addEventListener('change', async () => {
    const syncEnabled = syncToggleButton.checked;
    try {
      await chrome.storage.sync.set({ syncEnabled });
      updateSyncButtonState(syncEnabled);
      console.log('Sync toggle state updated:', syncEnabled);
    } catch (error) {
      console.error('Error updating sync state:', error);
      syncToggleButton.checked = !syncEnabled;
      updateSyncButtonState(!syncEnabled);
    }
  });

  // Enter key toggle button listener
  enterKeyToggleButton.addEventListener('change', async () => {
    const enterKeyNewLine = enterKeyToggleButton.checked;
    try {
      await chrome.storage.sync.set({ enterKeyNewLine });
      updateEnterKeyButtonState(enterKeyNewLine);
      console.log('Enter key state updated:', enterKeyNewLine);
    } catch (error) {
      console.error('Error updating enter key state:', error);
      enterKeyToggleButton.checked = !enterKeyNewLine;
      updateEnterKeyButtonState(!enterKeyNewLine);
    }
  });

// Text direction select listener
textDirectionSelect.addEventListener('change', async () => {
  const direction = textDirectionSelect.value;
  try {
    await chrome.storage.sync.set({ textDirection: direction });
    console.log('Text direction setting updated:', direction);
    
    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'TEXT_DIRECTION_CHANGED',
        direction: direction 
      });
      console.log('Direction change message sent to tab:', tab.id);
    }
  } catch (error) {
    console.error('Error updating text direction:', error);
    textDirectionSelect.value = await chrome.storage.sync.get('textDirection').textDirection || 'dynamic';
  }
});


  // Initialize speech bubbles
  initializeSpeechBubbles();
});

function updateButtonState(isEnabled) {
  const toggleButton = document.getElementById('toggle-button');
  const toggleText = document.querySelector('.toggle-text');
  
  if (toggleButton && toggleText) {
    toggleButton.checked = isEnabled;
    toggleText.textContent = isEnabled ? 'ON' : 'OFF';
  }
}

function updateSyncButtonState(syncEnabled) {
  const syncToggleButton = document.getElementById('sync-toggle-button');
  const syncToggleText = syncToggleButton.parentElement.querySelector('.toggle-text');
  
  if (syncToggleButton && syncToggleText) {
    syncToggleButton.checked = syncEnabled;
    syncToggleText.textContent = syncEnabled ? 'ON' : 'OFF';
  }
}

function updateEnterKeyButtonState(enterKeyNewLine) {
  const enterKeyToggleButton = document.getElementById('enter-key-toggle-button');
  const enterKeyToggleText = enterKeyToggleButton.parentElement.querySelector('.toggle-text');
  
  if (enterKeyToggleButton && enterKeyToggleText) {
    enterKeyToggleButton.checked = enterKeyNewLine;
    enterKeyToggleText.textContent = enterKeyNewLine ? 'ON' : 'OFF';
  }
}

function initializeSpeechBubbles() {
  console.log('Initializing speech bubbles...');
  
  const pencilIcon = document.querySelector('.pencil-icon');
  const syncIcon = document.querySelector('.sync-icon');
  const enterKeyIcon = document.querySelector('.enter-key-icon');
  const textDirectionIcon = document.querySelector('.text-direction-icon');
  
  const pencilBubble = document.querySelector('.pencil-info');
  const syncBubble = document.querySelector('.sync-info');
  const enterKeyBubble = document.querySelector('.enter-key-info');
  const textDirectionBubble = document.querySelector('.text-direction-info');

  if (!pencilIcon || !syncIcon || !enterKeyIcon || !textDirectionIcon || 
      !pencilBubble || !syncBubble || !enterKeyBubble || !textDirectionBubble) {
    console.error('Failed to find required elements:', {
      pencilIcon: !!pencilIcon,
      syncIcon: !!syncIcon,
      enterKeyIcon: !!enterKeyIcon,
      textDirectionIcon: !!textDirectionIcon,
      pencilBubble: !!pencilBubble,
      syncBubble: !!syncBubble,
      enterKeyBubble: !!enterKeyBubble,
      textDirectionBubble: !!textDirectionBubble
    });
    return;
  }

  // Ensure bubbles are hidden by default
  hideAllBubbles();

  // Icon click handlers
  pencilIcon.addEventListener('click', (e) => {
    console.log('Pencil icon clicked');
    e.stopPropagation();
    toggleBubbleDirectly(pencilBubble);
  });

  syncIcon.addEventListener('click', (e) => {
    console.log('Sync icon clicked');
    e.stopPropagation();
    toggleBubbleDirectly(syncBubble);
  });

  enterKeyIcon.addEventListener('click', (e) => {
    console.log('Enter key icon clicked');
    e.stopPropagation();
    toggleBubbleDirectly(enterKeyBubble);
  });

  textDirectionIcon.addEventListener('click', (e) => {
    console.log('Text direction icon clicked');
    e.stopPropagation();
    toggleBubbleDirectly(textDirectionBubble);
  });

  // Acknowledge button handlers
  document.querySelectorAll('.info-acknowledge').forEach(button => {
    button.addEventListener('click', (e) => {
      console.log('Acknowledge button clicked');
      const bubble = e.target.closest('.speech-bubble');
      hideBubble(bubble);
      
      let storageKey;
      if (bubble.classList.contains('pencil-info')) {
        storageKey = STORAGE_KEYS.PENCIL_INFO_SEEN;
      } else if (bubble.classList.contains('sync-info')) {
        storageKey = STORAGE_KEYS.SYNC_INFO_SEEN;
      } else if (bubble.classList.contains('enter-key-info')) {
        storageKey = STORAGE_KEYS.ENTER_KEY_INFO_SEEN;
      } else if (bubble.classList.contains('text-direction-info')) {
        storageKey = STORAGE_KEYS.TEXT_DIRECTION_INFO_SEEN;
      }
      
      if (storageKey) {
        chrome.storage.sync.set({ [storageKey]: true });
      }
    });
  });

  // Close bubbles when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.speech-bubble') && 
        !e.target.closest('.pencil-icon') && 
        !e.target.closest('.sync-icon') &&
        !e.target.closest('.enter-key-icon') &&
        !e.target.closest('.text-direction-icon')) {
      console.log('Clicking outside, hiding all bubbles');
      hideAllBubbles();
    }
  });
}

function toggleBubbleDirectly(bubble) {
  console.log('Toggling bubble directly');
  if (bubble.classList.contains('hidden')) {
    hideAllBubbles();
    showBubble(bubble);
  } else {
    hideBubble(bubble);
  }
}

function showBubble(bubble) {
  console.log('Showing bubble');
  bubble.classList.remove('hidden');
  // Force repaint
  bubble.offsetHeight;
}

function hideBubble(bubble) {
  console.log('Hiding bubble');
  bubble.classList.add('hidden');
}

function hideAllBubbles() {
  console.log('Hiding all bubbles');
  document.querySelectorAll('.speech-bubble').forEach(bubble => {
    hideBubble(bubble);
  });
}

// Handle popup closure
window.addEventListener('unload', () => {
  // No cleanup needed as we're using chrome.storage.sync
});