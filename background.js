// Function to get active tab info
function getActiveTabInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length > 0) {
        // Send the active tab data to the side panel
        chrome.runtime.sendMessage({
          action: "setActiveTabInfo",
          url: tabs[0].url
        });
      }
    });
  }
  
  // Listen for messages from the popup/side panel
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "getActiveTabInfo") {
      getActiveTabInfo();
    }
  });
  
  // Track tab/page navigation
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // Only send message when page is completely loaded and it's the active tab
    if (changeInfo.status === 'complete' && tab.active) {
      chrome.runtime.sendMessage({
        action: "pageNavigation",
        url: tab.url,
        timestamp: new Date().toISOString(),
        title: tab.title
      });
    }
  });
  
  // Track when user switches between tabs
  chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
      chrome.runtime.sendMessage({
        action: "pageNavigation",
        url: tab.url,
        timestamp: new Date().toISOString(),
        title: tab.title,
        type: "tab_switch"
      });
    });
  });
  
  // Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
  });