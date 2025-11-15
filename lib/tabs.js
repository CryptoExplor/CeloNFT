/**
 * Tab Manager - FIXED VERSION
 * Fixed ID references to match HTML structure
 */

class TabManager {
  constructor() {
    this.currentTab = 'mint';
  }

  switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
    });

    // Show the selected tab content - FIX: Use correct IDs
    const activeTab = document.getElementById(`${tabName}Tab`); // Changed from `${tabName}-tab`
    if (activeTab) {
      activeTab.classList.add('active');
      console.log('✅ Tab shown:', tabName);
    } else {
      console.error('❌ Tab not found:', `${tabName}Tab`);
    }

    // Add active class to the clicked tab button
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Update current tab
    this.currentTab = tabName;

    // Store the current tab in localStorage
    try {
      localStorage.setItem('currentTab', tabName);
    } catch (e) {
      console.warn('Failed to save tab to localStorage:', e);
    }
    
    // Trigger gallery load if switching to gallery
    if (tabName === 'gallery') {
      const event = new CustomEvent('galleryTabOpened');
      window.dispatchEvent(event);
    }
  }

  setupTabListeners() {
    // Set up tab event listeners
    const tabButtons = document.querySelectorAll('.tab-button');
    console.log('Setting up tab listeners for', tabButtons.length, 'buttons');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        console.log('Tab button clicked:', tabName);
        this.switchTab(tabName);
      });
    });

    // Load the last opened tab or default to 'mint'
    let savedTab = 'mint';
    try {
      savedTab = localStorage.getItem('currentTab') || 'mint';
    } catch (e) {
      console.warn('Failed to load saved tab:', e);
    }
    
    console.log('Loading saved tab:', savedTab);
    this.switchTab(savedTab);
  }

  initializeTabs() {
    console.log('Initializing tabs...');
    this.setupTabListeners();
    console.log('✅ Tabs initialized');
  }

  getCurrentTab() {
    return this.currentTab;
  }
}

export default TabManager;
