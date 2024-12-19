// background.js

// Store WebSocket connections
let connections = new Map();

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // On fresh install, set isEnabled true and syncEnabled false by default
    await chrome.storage.sync.set({ isEnabled: true, syncEnabled: false });
  }

  // Initialize badge text
  await chrome.action.setBadgeText({ text: "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#666666" });

  // Initialize extension state
  const { isEnabled = true } = await chrome.storage.sync.get('isEnabled');

  // If fresh install and no isEnabled, set it
  if (!await chrome.storage.sync.get('isEnabled').isEnabled) {
    await chrome.storage.sync.set({ isEnabled: true });
  }

  // Set initial badge state
  await chrome.action.setBadgeText({ text: isEnabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: isEnabled ? '#2196F3' : '#666666' });
});

// Enhanced message handling system
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    'GET_ENABLED_STATE': async () => {
      const { isEnabled = true } = await chrome.storage.sync.get('isEnabled');
      return { isEnabled };
    }
  };

  const handler = handlers[message.type || message.action];
  if (handler) {
    Promise.resolve(handler())
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Indicate async response
  }
});

// Handle port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'websocket-intercept') {
    port.onMessage.addListener(async (message) => {
      if (message.type === 'INIT') {
        connections.set(port.sender.tab.id, port);
      }
      if (message.type === 'UPDATE_PREFIX') {
        await chrome.storage.local.set({
          currentPrefix: message.prefix,
          tabId: port.sender.tab.id
        });
      }
    });

    port.onDisconnect.addListener(() => {
      connections.delete(port.sender.tab.id);
    });
  }
});

// Enhanced storage change handler
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.isEnabled) {
      const isEnabled = changes.isEnabled.newValue;
      updateBadgeState(isEnabled);
      notifyAllTabs('STORAGE_CHANGED', { key: 'isEnabled', value: isEnabled });
    }

    if (changes.currentStyle) {
      const newStyle = changes.currentStyle.newValue;
      notifyAllTabs('STORAGE_CHANGED', { key: 'currentStyle', value: newStyle });
    }

    if (changes.syncEnabled) {
      const syncEnabled = changes.syncEnabled.newValue;
      notifyAllTabs('STORAGE_CHANGED', { key: 'syncEnabled', value: syncEnabled });
    }
  }
});

// Helper function to update badge state
async function updateBadgeState(isEnabled) {
  await chrome.action.setBadgeText({ text: isEnabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({
    color: isEnabled ? '#2196F3' : '#666666'
  });
}

// Helper function to notify all tabs
async function notifyAllTabs(type, data) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type, ...data }).catch(() => {
        // Ignore errors for inactive tabs
      });
    }
  }
}

// Handle toolbar button click
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const { isEnabled = true } = await chrome.storage.sync.get('isEnabled');
    const newState = !isEnabled;

    // If turning off, force Normal style but suppress style message
    if (!newState) {
      await chrome.storage.sync.set({
        currentStyle: 'Normal',
        suppressStyleMessage: true
      });
    } else {
      // If turning on, switch to Normal style with message
      await chrome.storage.sync.set({
        currentStyle: 'Normal',
        suppressStyleMessage: false
      });
    }

    // Update enabled state
    await chrome.storage.sync.set({ isEnabled: newState });
    await updateBadgeState(newState);

    // Notify all tabs
    await notifyAllTabs('STORAGE_CHANGED', {
      key: 'isEnabled',
      value: newState
    });

    if (!newState) {
      await notifyAllTabs('STORAGE_CHANGED', {
        key: 'currentStyle',
        value: 'Normal'
      });
    }
  } catch (error) {
    console.error('Error handling toolbar click:', error);
  }
});
