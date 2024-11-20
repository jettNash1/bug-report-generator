let activeTabInfo = null;

class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

class StorageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StorageError';
    }
}


// 2. Utility Functions
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

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// 3. Core Services
const ErrorHandler = {
    errors: new Map(),
    
    handle(error, context) {
        const errorId = Date.now();
        this.errors.set(errorId, { error, context, timestamp: new Date() });
        
        console.error(`[${context}]`, error);
        
        if (error instanceof NetworkError) {
            this.showUserError('Network connection issue. Please try again.');
        } else if (error instanceof StorageError) {
            this.showUserError('Unable to save changes. Please check your storage.');
        } else {
            this.showUserError('An unexpected error occurred.');
        }
        
        this.cleanup();
    },
    
    showUserError(message) {
        const status = document.getElementById('copyStatus');
        status.textContent = message;
        status.style.color = 'red';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', 3000);
    },
    
    cleanup() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [id, {timestamp}] of this.errors) {
            if (timestamp < oneHourAgo) {
                this.errors.delete(id);
            }
        }
    }
};

const FormManager = {
    getFormData() {
        return {
            title: document.getElementById('title')?.value || '',
            observed: document.getElementById('observed')?.value || '',
            expected: document.getElementById('expected')?.value || '',
            scope: document.getElementById('scope')?.value || '',
            reproductionPercent: document.getElementById('reproductionPercent')?.value || '', // Updated to get value from dropdown
            reproductionDesc: document.getElementById('reproductionDesc')?.value || '',
            severity: document.getElementById('severity')?.value || '',
            steps: Array.from(document.getElementById('steps-container').querySelectorAll('.step-container'))
                .map(container => ({
                    number: container.querySelector('span').textContent,
                    description: container.querySelector('input').value
                })),
            environments: Array.from(document.getElementById('environments-container').querySelectorAll('input'))
                .map(input => input.value)
        };
    },

    async saveForm() {
        try {
            const formData = this.getFormData();
            await PerformanceMonitor.measure('save-form', async () => {
                await AutoSaveManager.add(formData);
            });
            FormStateManager.markClean();
        } catch (err) {
            ErrorHandler.handle(err instanceof Error ? err : new StorageError('Failed to save form data'));
        }
    },

    addStep() {
        const container = document.createElement('div');
        container.className = 'step-container';
        const stepNumber = document.querySelectorAll('.step-container').length + 1;
        
        const span = document.createElement('span');
        span.textContent = `${stepNumber}.`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter step description';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'X';
        
        removeBtn.addEventListener('click', () => {
            container.remove();
            this.renumberSteps();
            this.saveForm();
        });
    
        container.appendChild(span);
        container.appendChild(input);
        container.appendChild(removeBtn);
        
        document.getElementById('steps-container').appendChild(container);
        input.focus();
    },

    renumberSteps() {
        document.querySelectorAll('.step-container span').forEach((span, index) => {
            span.textContent = `${index + 1}.`;
        });
    },

    clearForm() {
        document.getElementById('title').value = '';
        document.getElementById('observed').value = '';
        document.getElementById('expected').value = '';
        document.getElementById('steps-container').innerHTML = '';
        document.getElementById('environments-container').innerHTML = '';
        document.getElementById('scope').selectedIndex = 0;
        document.getElementById('reproductionDesc').selectedIndex = 0;
        document.getElementById('severity').selectedIndex = 0;
        
        // Add initial step after clearing
        FormManager.addStep();
        
        // Re-detect environment
        EnvironmentManager.detectEnvironment();
        
        // Note: We're no longer clearing reproductionPercent
    },

    async loadSavedForm() {
        try {
            const result = await chrome.storage.local.get('formData');
            if (result.formData) {
                const formData = result.formData;
                Object.keys(formData).forEach(key => {
                    const element = document.getElementById(key);
                    if (element && !Array.isArray(formData[key])) {
                        element.value = formData[key];
                    }
                });

                // Handle steps
                const stepsContainer = document.getElementById('steps-container');
                stepsContainer.innerHTML = '';
                if (formData.steps && formData.steps.length > 0) {
                    formData.steps.forEach(step => {
                        const container = document.createElement('div');
                        container.className = 'step-container';
                        
                        const span = document.createElement('span');
                        span.textContent = step.number;
                        
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = step.description;
                        input.placeholder = 'Enter step description';
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-btn';
                        removeBtn.textContent = 'X';
                        
                        container.appendChild(span);
                        container.appendChild(input);
                        container.appendChild(removeBtn);
                        stepsContainer.appendChild(container);
                    });
                } else {
                    this.addStep();
                }

                // Handle environments
                const environmentsContainer = document.getElementById('environments-container');
                environmentsContainer.innerHTML = '';
                if (formData.environments && formData.environments.length > 0) {
                    formData.environments.forEach(env => {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = env;
                        environmentsContainer.appendChild(input);
                    });
                }
            }
        } catch (err) {
            ErrorHandler.handle(err, 'Load Form');
        }
    }
};

const FormStateManager = {
    state: {
        isDirty: false,
        lastSaved: null,
        errors: []
    },
    markDirty() {
        this.state.isDirty = true;
        this.updateUI();
    },
    markClean() {
        this.state.isDirty = false;
        this.state.lastSaved = new Date();
        this.updateUI();
    },
    updateUI() {
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            saveIndicator.textContent = this.state.isDirty ? 
                'Unsaved changes' : 
                `Last saved: ${this.state.lastSaved?.toLocaleTimeString()}`;
        }
    }
};

const KeyboardManager = {
    init() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                FormManager.saveForm();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection().toString()) {
                e.preventDefault();
                document.getElementById('copyButton').click();
            }
            if (e.key === 'Escape') {
                document.querySelectorAll('.show').forEach(el => el.classList.remove('show'));
                const infoOverlay = document.getElementById('infoOverlay');
                if (infoOverlay.classList.contains('show')) {
                    infoOverlay.classList.remove('show');
                }
            }
        });
    }
};

const AutoSaveManager = {
    queue: [],
    isProcessing: false,
    
    async add(data) {
        this.queue.push(data);
        if (!this.isProcessing) {
            await this.process();
        }
    },
    
    async process() {
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const data = this.queue.shift();
            try {
                await chrome.storage.local.set({ formData: data });
                FormStateManager.markClean();
            } catch (error) {
                ErrorHandler.handle(error, 'AutoSave');
                this.queue.unshift(data);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        this.isProcessing = false;
    }
};

const PerformanceMonitor = {
    metrics: new Map(),
    
    startTimer(label) {
        this.metrics.set(label, performance.now());
    },
    
    endTimer(label) {
        const start = this.metrics.get(label);
        if (start) {
            const duration = performance.now() - start;
            console.debug(`${label} took ${duration.toFixed(2)}ms`);
            this.metrics.delete(label);
            return duration;
        }
    },
    
    async measure(label, fn) {
        this.startTimer(label);
        const result = await fn();
        this.endTimer(label);
        return result;
    }
};

const CopyManager = {
    async generateReport() {
        const formData = FormManager.getFormData();
        const severity = document.getElementById('severity');
        const severityText = severity.options[severity.selectedIndex].text;

        let observed = formData.observed.replace(/^Tester has observed that:\s*/, '');
        let expected = formData.expected.replace(/^It is expected:\s*/, '');

        const steps = Array.from(document.getElementById('steps-container').querySelectorAll('.step-container'))
            .map(container => {
                const number = container.querySelector('span').textContent;
                const description = container.querySelector('input').value;
                return `${number} ${description}`;
            })
            .join('\n');

        const environments = formData.environments.filter(value => value.trim() !== '').join('\n');

        const bugReport = `${formData.title}\n\n` +
            `${observed}\n\n` +
            `${expected}\n\n` +
            `Steps to Reproduce:\n${steps}\n\n` +
            `Environment:\n${environments}\n\n` +
            `Scope: ${formData.scope}\n\n` +
            `Reproduction Rate:\n ${formData.reproductionPercent}` + ' ' +
            `${formData.reproductionDesc}\n\n` +
            `Severity: ${severityText}`;

        return bugReport;
    },

    async copyToClipboard() {
        try {
            const bugReport = await this.generateReport();
            await navigator.clipboard.writeText(bugReport);
            const copyStatus = document.getElementById('copyStatus');
            copyStatus.textContent = 'Copied to clipboard!';
            copyStatus.style.color = '#4CAF50';
            copyStatus.style.display = 'block';
            setTimeout(() => copyStatus.style.display = 'none', 3000);
        } catch (err) {
            ErrorHandler.handle(err, 'Copy');
        }
    }
};

const EnvironmentManager = {
    async detectEnvironment() {
        try {
            const permissions = await chrome.permissions.getAll();
            const hasRequired = permissions.permissions.includes('scripting') && 
                              permissions.permissions.includes('activeTab');
            
            if (!hasRequired) {
                throw new Error('Required permissions not granted');
            }

            // Check if this is a pop-out window
            const isPopout = new URLSearchParams(window.location.search).get('popout');
            let tabId;

            if (isPopout) {
                // Get the stored tab info for pop-out
                const result = await chrome.storage.local.get('activeTabInfo');
                console.log('Retrieved stored tab info:', result.activeTabInfo); // Debug log
                tabId = result.activeTabInfo?.id;
                if (!tabId) {
                    throw new Error('No stored tab information found');
                }
            } else {
                // Get current tab for regular popup
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                tabId = tab?.id;
            }

            if (!tabId) {
                throw new Error('No active tab found');
            }

            const envInfo = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const getOS = () => {
                        const userAgent = window.navigator.userAgent;
                        if (userAgent.includes('Windows NT 10.0')) return 'Windows 11';
                        if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1';
                        if (userAgent.includes('Windows NT 6.2')) return 'Windows 8';
                        if (userAgent.includes('Windows NT 6.1')) return 'Windows 7';
                        if (userAgent.includes('Windows')) return 'Windows';
                        if (userAgent.includes('Mac')) return 'MacOS';
                        if (userAgent.includes('Linux')) return 'Linux';
                        return 'Unknown OS';
                    };

                    const getBrowserVersion = () => {
                        const match = navigator.userAgent.match(/(chrome|firefox|safari|edge|opera(?=\/))\/?\s*(\d+)/i);
                        if (match) {
                            const browser = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                            return `${browser} ${match[2]}.0.0`;
                        }
                        return 'Unknown Browser';
                    };

                    return {
                        os: getOS(),
                        browserVersion: getBrowserVersion(),
                        url: window.location.href
                    };
                }
            });

            if (envInfo?.[0]?.result) {
                const { os, browserVersion, url } = envInfo[0].result;
                const container = document.getElementById('environments-container');
                const versionElement = document.getElementById('version');
                
                container.innerHTML = '';
                
                const currentDate = new Date().toLocaleDateString('en-GB', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                
                const envInput = document.createElement('div');
                envInput.className = 'environment-container';
                const input = document.createElement('input');
                input.type = 'text';
                input.value = `${os} - ${browserVersion}`;
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-btn';
                removeBtn.textContent = 'X';
                
                envInput.appendChild(input);
                envInput.appendChild(removeBtn);
                container.appendChild(envInput);
                
                if (versionElement) {
                    versionElement.textContent = `${url} - ${currentDate}`;
                }
            }
        } catch (err) {
            console.error('Environment detection error:', err);
            const container = document.getElementById('environments-container');
            const versionElement = document.getElementById('version');
            
            if (container) {
                container.innerHTML = '';
                const envInput = document.createElement('div');
                envInput.className = 'environment-container';
                envInput.innerHTML = `
                    <input type="text" value="Click ⚙️ to grant environment detection permissions">
                    <button class="remove-btn">X</button>
                `;
                container.appendChild(envInput);
            }
            
            if (versionElement) {
                versionElement.textContent = 'Environment detection requires permissions';
            }
        }
    }
};


// 4. Screenshot Functions
async function captureVisibleArea() {
    const screenshotStatus = document.getElementById('screenshotStatus');
    try {
        // Check if this is a pop-out window
        const isPopout = new URLSearchParams(window.location.search).get('popout');
        let windowId;

        if (isPopout) {
            // Get the stored tab info for pop-out
            const result = await chrome.storage.local.get('activeTabInfo');
            if (!result.activeTabInfo) {
                throw new Error('No stored tab information found');
            }
            windowId = result.activeTabInfo.windowId;
        } else {
            // Get current tab for regular popup
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            windowId = tab.windowId;
        }

        const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        await chrome.downloads.download({
            url: screenshot,
            filename: `bug-report-screenshot-${timestamp}.png`,
            saveAs: true
        });

        screenshotStatus.textContent = 'Screenshot saved!';
        screenshotStatus.style.color = '#4CAF50';
        screenshotStatus.style.display = 'block';
        setTimeout(() => {
            screenshotStatus.style.display = 'none';
        }, 3000);
    } catch (err) {
        ErrorHandler.handle(err, 'Screenshot');
    }
}

async function captureFullPage() {
    const progressBar = document.getElementById('screenshotProgress');
    const progressBarFill = document.getElementById('screenshotProgressFill');
    const screenshotStatus = document.getElementById('screenshotStatus');

    try {
        // Check if this is a pop-out window
        const isPopout = new URLSearchParams(window.location.search).get('popout');
        let tabId, windowId;

        if (isPopout) {
            // Get the stored tab info for pop-out
            const result = await chrome.storage.local.get('activeTabInfo');
            if (!result.activeTabInfo) {
                throw new Error('No stored tab information found');
            }
            tabId = result.activeTabInfo.id;
            windowId = result.activeTabInfo.windowId;
        } else {
            // Get current tab for regular popup
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = currentTab?.id;
            windowId = currentTab?.windowId;
        }

        if (!tabId) {
            throw new Error('No active tab found');
        }

        progressBar.style.display = 'block';
        progressBarFill.style.width = '0%';
        
        const dimensions = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({
                scrollHeight: Math.max(
                    document.documentElement.scrollHeight,
                    document.documentElement.offsetHeight,
                    document.documentElement.clientHeight
                ),
                scrollWidth: Math.max(
                    document.documentElement.scrollWidth,
                    document.documentElement.offsetWidth,
                    document.documentElement.clientWidth
                ),
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                devicePixelRatio: window.devicePixelRatio || 1
            })
        });

        if (!dimensions?.[0]?.result) {
            throw new Error('Failed to get page dimensions');
        }

        const { scrollHeight, scrollWidth, viewportHeight, devicePixelRatio } = dimensions[0].result;
        const canvas = new OffscreenCanvas(scrollWidth * devicePixelRatio, scrollHeight * devicePixelRatio);
        const ctx = canvas.getContext('2d');
        
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);
        
        // Store original scroll position
        const originalScroll = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({ x: window.scrollX, y: window.scrollY })
        });

        // Capture viewports with rate limiting
        for (let i = 0; i < totalSteps; i++) {
            progressBarFill.style.width = `${(i / totalSteps) * 100}%`;
            
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (top) => window.scrollTo(0, top),
                args: [i * viewportHeight]
            });
            
            await new Promise(resolve => setTimeout(resolve, 250));
            
            const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
            const img = await createImageBitmap(await (await fetch(screenshot)).blob());
            
            ctx.drawImage(img, 0, i * viewportHeight * devicePixelRatio);
            
            // Add delay between captures
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Restore original scroll position
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (scroll) => window.scrollTo(scroll.x, scroll.y),
            args: [originalScroll[0].result]
        });
        
        progressBarFill.style.width = '100%';
        
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        await chrome.downloads.download({
            url: url,
            filename: `bug-report-full-screenshot-${timestamp}.png`,
            saveAs: true
        });
        
        URL.revokeObjectURL(url);
        progressBar.style.display = 'none';
        
        screenshotStatus.textContent = 'Full page screenshot saved!';
        screenshotStatus.style.color = '#4CAF50';
        screenshotStatus.style.display = 'block';
        setTimeout(() => {
            screenshotStatus.style.display = 'none';
        }, 3000);
    } catch (err) {
        ErrorHandler.handle(err, 'Screenshot');
        if (progressBar) progressBar.style.display = 'none';
    }
}


// 5. Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Extension initialized - Starting setup...');

    const copyButton = document.getElementById('copyButton');
    const screenshotButton = document.getElementById('screenshotButton');
    const dropdownToggle = document.getElementById('screenshotDropdownToggle');
    const dropdown = document.getElementById('screenshotDropdown');
    const copyStatus = document.getElementById('copyStatus');
    const screenshotStatus = document.getElementById('screenshotStatus');
    const stepsContainer = document.getElementById('steps-container');
    const environmentsContainer = document.getElementById('environments-container');
    const clearButton = document.getElementById('clearButton');
    const addStepButton = document.getElementById('addStepButton');
    const addEnvironmentButton = document.getElementById('addEnvironmentButton');
    const reproductionPercentElement = document.getElementById('reproductionPercent');

    // Initialize managers
    KeyboardManager.init();
    FormStateManager.markClean();
    PerformanceMonitor.startTimer('popup-init');

    // Setup error handling
    window.onerror = (msg, source, line, col, error) => {
        ErrorHandler.handle(error || new Error(msg), 'window');
    };

    // Load saved form data
    await FormManager.loadSavedForm();

    // Event listeners

    async function requestPermissions() {
        try {
            const permissions = {
                permissions: [
                    'activeTab',
                    'downloads',
                    'scripting',
                    'clipboardWrite'
                ],
                origins: ['<all_urls>']
            };
    
            const granted = await chrome.permissions.request(permissions);
            if (granted) {
                console.log('Permissions granted');
                return true;
            } else {
                console.log('Permissions denied');
                return false;
            }
        } catch (err) {
            console.error('Error requesting permissions:', err);
            return false;
        }
    }
    
    copyButton.addEventListener('click', async () => {
        const hasPermissions = await requestPermissions();
        if (hasPermissions) {
            CopyManager.copyToClipboard();
        } else {
            ErrorHandler.showUserError('Required permissions not granted. Some features may not work.');
        }
    });
    screenshotButton.addEventListener('click', async () => {
        const hasPermissions = await requestPermissions();
        if (hasPermissions) {
            captureVisibleArea();
        } else {
            ErrorHandler.showUserError('Required permissions not granted. Some features may not work.');
        }
    });
    clearButton.addEventListener('click', () => FormManager.clearForm());
    if (addStepButton) {
        addStepButton.addEventListener('click', () => FormManager.addStep());
    }
    
    if (addEnvironmentButton) {
        addEnvironmentButton.addEventListener('click', () => {
            const container = document.getElementById('environments-container');
            const envInput = document.createElement('div');
            envInput.className = 'environment-container';
            envInput.innerHTML = `
                <input type="text" placeholder="Enter environment detail">
                <button class="remove-btn">X</button>
            `;
            container.appendChild(envInput);
            envInput.querySelector('input').focus();
            debouncedSaveForm();
        });
    }

    if (reproductionPercentElement) {
        reproductionPercentElement.innerHTML = `
            <option value="0%">0%</option>
            <option value="25%">25%</option>
            <option value="50%">50%</option>
            <option value="75%">75%</option>
            <option value="100%">100%</option>
        `;
    }

    dropdownToggle.addEventListener('click', () => {
        dropdown.classList.toggle('show');
    });
    dropdown.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', async () => {
            const hasPermissions = await requestPermissions();
            if (hasPermissions) {
                const type = button.dataset.type;
                if (type === 'visible') {
                    captureVisibleArea();
                } else if (type === 'full') {
                    captureFullPage();
                }
                dropdown.classList.remove('show');
            } else {
                ErrorHandler.showUserError('Required permissions not granted. Some features may not work.');
            }
        });
    });

    document.addEventListener('click', (event) => {
        if (!event.target.matches('#screenshotDropdownToggle')) {
            dropdown.classList.remove('show');
        }
    });

    // Add form input event listeners
    const formInputs = document.querySelectorAll('input, textarea, select');
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            debouncedSaveForm();
            FormStateManager.markDirty();
        });
    });

    // Add step container event delegation
    stepsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const container = e.target.closest('.step-container');
            if (container) {
                container.remove();
                FormManager.renumberSteps();
                debouncedSaveForm();
            }
        }
    });

    // Add environment container event delegation
    environmentsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const container = e.target.closest('.environment-container');
            if (container) {
                container.remove();
                debouncedSaveForm();
            }
        }
    });

    // Initialize form
    if (document.querySelectorAll('.step-container').length === 0) {
        FormManager.addStep();
    }
    
    // Remove this conditional check to ensure environment detection always runs
    await EnvironmentManager.detectEnvironment();

    // Add near the other event listeners
    const infoButton = document.getElementById('infoButton');
    const popoutButton = document.getElementById('popoutButton');
    const futureButton = document.getElementById('futureButton');
    const infoOverlay = document.getElementById('infoOverlay');
    const permissionOverlay = document.getElementById('permissionOverlay');

    infoButton.addEventListener('click', () => {
        infoOverlay.classList.add('show');
    });

    futureButton.title = "Manage Permissions";
    futureButton.textContent = "⚙️";
    futureButton.addEventListener('click', async () => {
        permissionOverlay.classList.add('show');
        
        // Check current permissions and update checkboxes
        const permissions = await chrome.permissions.getAll();
        document.getElementById('activeTabPermission').checked = permissions.permissions.includes('activeTab');
        document.getElementById('downloadsPermission').checked = permissions.permissions.includes('downloads');
        document.getElementById('scriptingPermission').checked = permissions.permissions.includes('scripting');
        document.getElementById('clipboardPermission').checked = permissions.permissions.includes('clipboardWrite');
    });

    document.querySelector('.save-permissions').addEventListener('click', async () => {
        const requestedPermissions = {
            permissions: [],
            origins: ['<all_urls>']
        };

        if (document.getElementById('activeTabPermission').checked) 
            requestedPermissions.permissions.push('activeTab');
        if (document.getElementById('downloadsPermission').checked)
            requestedPermissions.permissions.push('downloads');
        if (document.getElementById('scriptingPermission').checked)
            requestedPermissions.permissions.push('scripting');
        if (document.getElementById('clipboardPermission').checked)
            requestedPermissions.permissions.push('clipboardWrite');

        try {
            await chrome.permissions.request(requestedPermissions);
            ErrorHandler.showUserError('Permissions updated successfully');
            permissionOverlay.classList.remove('show');
        } catch (error) {
            ErrorHandler.showUserError('Failed to update permissions');
        }
    });

    document.querySelectorAll('.close-overlay').forEach(button => {
        button.addEventListener('click', () => {
            infoOverlay.classList.remove('show');
            permissionOverlay.classList.remove('show');
        });
    });

    popoutButton.addEventListener('click', async () => {
        try {
            if (!activeTabInfo) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                activeTabInfo = {
                    id: tab.id,
                    url: tab.url,
                    windowId: tab.windowId
                };
            }
            
            await chrome.storage.local.set({ activeTabInfo });
            
            // Get screen dimensions
            const screenWidth = window.screen.availWidth;
            const screenHeight = window.screen.availHeight;
            
            // Calculate dimensions (80% of screen height, fixed width)
            const width = 660;  // Fixed width for readability
            const height = Math.min(800, Math.floor(screenHeight * 0.8));  // 80% of screen height, max 800px
            
            // Calculate position to center the window
            const left = Math.floor((screenWidth - width) / 2);
            const top = Math.floor((screenHeight - height) / 10);  // Position at 10% from top
            
            // Create window with calculated dimensions
            const win = await chrome.windows.create({
                url: chrome.runtime.getURL('popup.html?popout=true'),
                type: 'popup',
                width,
                height,
                left,
                top
            });

            // After content loads, adjust height if needed
            setTimeout(async () => {
                const contentHeight = document.documentElement.scrollHeight + 40; // Add padding for window chrome
                const adjustedHeight = Math.min(contentHeight, screenHeight * 0.8); // Don't exceed 80% of screen height
                
                if (adjustedHeight !== height) {
                    await chrome.windows.update(win.id, {
                        height: adjustedHeight
                    });
                }
            }, 250);
            
            window.close();
        } catch (err) {
            console.error('Error creating pop-out window:', err);
            ErrorHandler.handle(err, 'Pop-out Creation');
        }
    });

    // Add this function to handle permission checks and refreshes
    async function checkAndRefreshPermissions() {
        const permissions = await chrome.permissions.getAll();
        const hasAllPermissions = [
            'activeTab',
            'downloads',
            'scripting',
            'clipboardWrite'
        ].every(permission => permissions.permissions.includes(permission));

        if (hasAllPermissions) {
            // Refresh environment detection
            await EnvironmentManager.detectEnvironment();
            
            // Re-enable buttons
            document.getElementById('screenshotButton').disabled = false;
            document.getElementById('screenshotDropdownToggle').disabled = false;
            document.getElementById('copyButton').disabled = false;
            
            ErrorHandler.showUserError('Permissions verified and features refreshed');
        } else {
            ErrorHandler.showUserError('Some permissions are still missing. Check the gear icon to manage permissions.');
        }
    }

    // Update the existing futureButton click handler to refresh after permissions are saved
    document.querySelector('.save-permissions').addEventListener('click', async () => {
        const requestedPermissions = {
            permissions: [],
            origins: ['<all_urls>']
        };

        if (document.getElementById('activeTabPermission').checked) 
            requestedPermissions.permissions.push('activeTab');
        if (document.getElementById('downloadsPermission').checked)
            requestedPermissions.permissions.push('downloads');
        if (document.getElementById('scriptingPermission').checked)
            requestedPermissions.permissions.push('scripting');
        if (document.getElementById('clipboardPermission').checked)
            requestedPermissions.permissions.push('clipboardWrite');

        try {
            await chrome.permissions.request(requestedPermissions);
            await checkAndRefreshPermissions(); // Add this line to refresh after saving
            permissionOverlay.classList.remove('show');
        } catch (error) {
            ErrorHandler.showUserError('Failed to update permissions');
        }
    });

    // Add near your other event listeners (around line 870)
    refreshButton.addEventListener('click', async () => {
        const permissions = await chrome.permissions.getAll();
        const hasAllPermissions = [
            'activeTab',
            'downloads',
            'scripting',
            'clipboardWrite'
        ].every(permission => permissions.permissions.includes(permission));

        if (hasAllPermissions) {
            await EnvironmentManager.detectEnvironment();
            document.getElementById('screenshotButton').disabled = false;
            document.getElementById('screenshotDropdownToggle').disabled = false;
            document.getElementById('copyButton').disabled = false;
            ErrorHandler.showUserError('Features refreshed successfully');
        } else {
            ErrorHandler.showUserError('Some permissions are missing. Click ⚙️ to manage permissions.');
        }
    });

    // Request environment details from the background script
    chrome.runtime.sendMessage({ type: 'detectEnvironment' }, (response) => {
        if (response) {
            const { os, browserVersion, url } = response;
            const container = document.getElementById('environments-container');
            const versionElement = document.getElementById('version');
            
            container.innerHTML = '';
            
            const currentDate = new Date().toLocaleDateString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const envInput = document.createElement('div');
            envInput.className = 'environment-container';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = `${os} - ${browserVersion}`;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = 'X';
            
            envInput.appendChild(input);
            envInput.appendChild(removeBtn);
            container.appendChild(envInput);
            
            if (versionElement) {
                versionElement.textContent = `${url} - ${currentDate}`;
            }
        } else {
            console.error('Failed to detect environment');
        }
    });
});
// Create debounced version of form save
const debouncedSaveForm = debounce(() => FormManager.saveForm(), 500);

document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ type: 'detectEnvironment' }, (response) => {
        if (response) {
            const { os, browserVersion, url } = response;
            const container = document.getElementById('environments-container');
            const versionElement = document.getElementById('version');
            
            container.innerHTML = '';
            
            const currentDate = new Date().toLocaleDateString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const envInput = document.createElement('div');
            envInput.className = 'environment-container';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = `${os} - ${browserVersion}`;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = 'X';
            
            envInput.appendChild(input);
            envInput.appendChild(removeBtn);
            container.appendChild(envInput);
            
            if (versionElement) {
                versionElement.textContent = `${url} - ${currentDate}`;
            }
        } else {
            console.error('Failed to detect environment');
        }
    });
});

