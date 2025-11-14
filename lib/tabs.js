class TabManager {
  constructor() {
    this.currentTab = 'mint';
  }

  switchTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      content.style.display = 'none';
    });

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
    });

    // Show the selected tab content
    const activeTab = document.getElementById(`${tabName}-tab`);
    if (activeTab) {
      activeTab.style.display = 'block';
    }

    // Add active class to the clicked tab button
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Update current tab
    this.currentTab = tabName;

    // Store the current tab in localStorage
    localStorage.setItem('currentTab', tabName);
  }

  setupTabListeners() {
    // Set up tab event listeners
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });

    // Load the last opened tab or default to 'mint'
    const savedTab = localStorage.getItem('currentTab') || 'mint';
    this.switchTab(savedTab);
  }

  initializeTabs() {
    this.setupTabListeners();
  }

  getCurrentTab() {
    return this.currentTab;
  }
}

export default TabManager;