let activeTabInfo = null;
let popoutWindow = null;

// Constants
const AUTOSAVE_DELAY = 500;
const NOTIFICATION_DURATION = 3000;
const MAX_QUEUE_SIZE = 10;

// Custom Error Classes
class NetworkError extends Error {
    constructor(message = 'Network operation failed') {
        super(message);
        this.name = 'NetworkError';
    }
}

class StorageError extends Error {
    constructor(message = 'Storage operation failed') {
        super(message);
        this.name = 'StorageError';
    }
}

// Utility Functions
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const escapeHtml = unsafe => 
    unsafe.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));

// Core Services
const ErrorHandler = {
    errors: new Map(),
    
    handle(error, context) {
        const errorId = Date.now();
        this.errors.set(errorId, { error, context, timestamp: new Date() });
        
        console.error(`[${context}]`, error);
        
        const errorMessage = this.getErrorMessage(error);
        this.showUserError(errorMessage);
        
        this.cleanup();
    },
    
    getErrorMessage(error) {
        if (error instanceof NetworkError) return 'Network connection issue. Please try again.';
        if (error instanceof StorageError) return 'Unable to save changes. Please check your storage.';
        return 'An unexpected error occurred.';
    },
    
    showUserError(message) {
        const status = document.getElementById('copyStatus');
        if (!status) return;
        
        status.textContent = message;
        status.style.color = 'red';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', NOTIFICATION_DURATION);
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
        const formData = {
            title: document.getElementById('title')?.value?.trim() || '',
            observed: document.getElementById('observed')?.value?.trim() || '',
            expected: document.getElementById('expected')?.value?.trim() || '',
            scope: document.getElementById('scope')?.value || '',
            reproduction: document.getElementById('reproduction')?.value || '',
            severity: document.getElementById('severity')?.value || '',
            version: document.getElementById('versionInput').value,
            steps: [],
            environments: []
        };

        // Collect steps - filter out empty ones
        document.querySelectorAll('.step-container').forEach((container, index) => {
            const description = container.querySelector('input')?.value?.trim();
            if (description) {  // Only add if description exists and isn't empty
                formData.steps.push({
                    number: `${index + 1}.`,
                    description: description
                });
            }
        });

        // Collect environments - filter out empty ones
        document.querySelectorAll('.environment-container input').forEach(input => {
            const value = input.value?.trim();
            if (value) {  // Only add if value exists and isn't empty
                formData.environments.push(value);
            }
        });

        return formData;
    },

    async saveForm() {
        try {
            const formData = this.getFormData();
            await chrome.storage.local.set({ formData });
            FormStateManager.markClean();
            this.showNotification('Changes saved', 'success');
        } catch (err) {
            ErrorHandler.handle(err, 'Save Form');
        }
    },

    async initializeForm() {
        try {
            const result = await chrome.storage.local.get('formData');
            if (result.formData) {
                const formData = result.formData;
                document.getElementById('title').value = formData.title || '';
                document.getElementById('observed').value = formData.observed || '';
                document.getElementById('expected').value = formData.expected || '';
                document.getElementById('scope').value = formData.scope || '';
                document.getElementById('reproduction').value = formData.reproduction || '';
                document.getElementById('severity').value = formData.severity || '';

                // Restore steps
                const stepsContainer = document.getElementById('steps-container');
                stepsContainer.innerHTML = '';
                formData.steps.forEach(step => {
                    this.addStep(step.description);
                });

                // Restore environments
                const environmentsContainer = document.getElementById('environments-container');
                environmentsContainer.innerHTML = '';
                formData.environments.forEach(env => {
                    this.addEnvironment();
                    const envInput = environmentsContainer.querySelector('.environment-container:last-child input');
                    if (envInput) {
                        envInput.value = env;
                    }
                });
            }
        } catch (err) {
            ErrorHandler.handle(err, 'Initialize Form');
        }
    },

    addStep(description = '') {
        const stepsContainer = document.getElementById('steps-container');
        const stepNumber = stepsContainer.children.length + 1;
        
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-container';
        
        const stepSpan = document.createElement('span');
        stepSpan.textContent = `${stepNumber}`;
        
        const stepInput = document.createElement('input');
        stepInput.type = 'text';
        stepInput.placeholder = 'Enter step description';
        stepInput.value = description;
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '×';
        deleteButton.className = 'delete-step';
        deleteButton.style.display = stepNumber === 1 ? 'none' : 'block';
        
        deleteButton.addEventListener('click', () => {
            if (stepsContainer.children.length > 1) {
                stepDiv.remove();
                this.renumberSteps();
                FormStateManager.markDirty();
                this.saveForm();
            }
        });
        
        stepDiv.appendChild(stepSpan);
        stepDiv.appendChild(stepInput);
        stepDiv.appendChild(deleteButton);
        stepsContainer.appendChild(stepDiv);
    },

    renumberSteps() {
        document.querySelectorAll('.step-container span').forEach((span, index) => {
            span.textContent = `${index + 1}`;
        });
    },

    clearForm() {
        document.getElementById('title').value = '';
        document.getElementById('observed').value = '';
        document.getElementById('expected').value = '';
        document.getElementById('steps-container').innerHTML = '';
        document.getElementById('environments-container').innerHTML = '';
        document.getElementById('scope').selectedIndex = 0;
        document.getElementById('reproduction').selectedIndex = 0;
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
    },

    addEnvironment(isInitial = false) {
        const container = document.getElementById('environments-container');
        const envDiv = document.createElement('div');
        envDiv.className = 'environment-container';
        
        const envInput = document.createElement('input');
        envInput.type = 'text';
        envInput.placeholder = 'Enter environment details';
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '×';
        deleteButton.className = 'delete-environment';
        
        // Only show delete button if it's not the first environment
        if (isInitial || container.children.length === 0) {
            deleteButton.style.display = 'none';
        } else {
            deleteButton.style.display = 'block';
        }
        
        deleteButton.addEventListener('click', () => {
            // Prevent deletion of first environment
            if (container.children.length > 1 && envDiv !== container.firstElementChild) {
                envDiv.remove();
                FormStateManager.markDirty();
                this.saveForm();
            }
        });
        
        envDiv.appendChild(envInput);
        envDiv.appendChild(deleteButton);
        container.appendChild(envDiv);
        
        return envInput; // Return the input element for chaining
    },

    getFormData() {
        const formData = {
            title: document.getElementById('title')?.value || '',
            observed: document.getElementById('observed')?.value || '',
            expected: document.getElementById('expected')?.value || '',
            scope: document.getElementById('scope')?.value || '',
            reproduction: document.getElementById('reproduction')?.value || '',
            severity: document.getElementById('severity')?.value || '',
            version: document.getElementById('versionInput').value,
            steps: [],
            environments: []
        };

        // Collect steps
        document.querySelectorAll('.step-container').forEach((container, index) => {
            formData.steps.push({
                number: `${index + 1}.`,
                description: container.querySelector('input')?.value || ''
            });
        });

        // Collect environments
        document.querySelectorAll('.environment-container input').forEach(input => {
            if (input.value.trim()) {
                formData.environments.push(input.value.trim());
            }
        });

        return formData;
    },

    showNotification(message, type = 'success') {
        const status = document.getElementById('copyStatus');
        if (!status) return;
        
        status.textContent = message;
        status.style.color = type === 'success' ? '#4CAF50' : 'red';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', NOTIFICATION_DURATION);
    }
};

const FormStateManager = {
    state: {
        isDirty: false,
        lastSaved: null,
        errors: [],
        lastError: null
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
    markError(error) {
        this.state.lastError = error;
        this.updateUI();
    },
    updateUI() {
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            if (this.state.lastError) {
                saveIndicator.textContent = 'Save failed - Retrying...';
                saveIndicator.style.color = '#e74c3c';
            } else {
                saveIndicator.textContent = this.state.isDirty ? 
                    'Unsaved changes' : 
                    `Last saved: ${this.state.lastSaved?.toLocaleTimeString()}`;
                saveIndicator.style.color = '';
            }
        }
    }
};

const KeyboardManager = {
    init() {
        document.addEventListener('keydown', async (e) => {
            // Save functionality (keep existing)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                await this.saveReportToFile();
            }
            
            // Updated copy functionality
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const selectedText = window.getSelection().toString();
                if (!selectedText) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        await CopyManager.copyToClipboard();
                        
                        // Add visual feedback
                        const status = document.getElementById('copyStatus');
                        if (status) {
                            status.textContent = 'Copied to clipboard!';
                            status.style.color = '#4CAF50';
                            status.style.display = 'block';
                            setTimeout(() => status.style.display = 'none', 3000);
                        }
                    } catch (error) {
                        ErrorHandler.handle(error, 'Copy to Clipboard');
                    }
                }
            }
            
            // Escape key handling (keep existing)
            if (e.key === 'Escape') {
                document.querySelectorAll('.show').forEach(el => el.classList.remove('show'));
            }
        });
    },

    async saveReportToFile() {
        try {
            const bugReport = await ReportGenerator.generateReport();
            const blob = new Blob([bugReport], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `bug-report-${timestamp}.txt`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);

            const status = document.getElementById('copyStatus');
            status.textContent = 'Report saved as text file!';
            status.style.color = '#4CAF50';
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 3000);
        } catch (err) {
            ErrorHandler.handle(err, 'Save Report');
        }
    }
};

const AutoSaveManager = {
    queue: [],
    maxQueueSize: 10,
    isProcessing: false,
    
    async add(data) {
        if (this.queue.length >= this.maxQueueSize) {
            this.queue.shift(); // Remove oldest entry
        }
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
                const status = document.getElementById('copyStatus');
                status.textContent = 'Changes saved';
                status.style.color = '#4CAF50';
                status.style.display = 'block';
                setTimeout(() => status.style.display = 'none', 1500);
            } catch (error) {
                ErrorHandler.handle(error, 'AutoSave');
                FormStateManager.markError(error);
                this.queue.unshift(data);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        this.isProcessing = false;
    },
    
    updateSaveIndicator(status) {
        const indicator = document.getElementById('saveIndicator');
        if (!indicator) return;
        
        const messages = {
            saving: 'Saving...',
            saved: 'All changes saved',
            error: 'Save failed - Retrying...'
        };
        
        indicator.textContent = messages[status];
        indicator.className = `save-indicator ${status}`;
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

        // Modified steps handling
        const steps = Array.from(document.getElementById('steps-container').querySelectorAll('.step-container'))
            .map(container => {
                const number = container.querySelector('span').textContent;
                const description = container.querySelector('input').value.trim();
                return description ? `${number} ${description}` : null;
            })
            .filter(step => step !== null)
            .join('\n');

        const environments = formData.environments.filter(value => value.trim() !== '').join('\n');

        const versionElement = document.getElementById('version');
        const versionText = versionElement ? versionElement.textContent : 'Version not available';

        const bugReport = `${formData.title}\n\n` +
            `${observed}\n\n` +
            `${expected}\n\n` +
            `Steps to Reproduce:\n${steps}\n\n` +
            `Environment:\n${environments}\n\n` +
            `Version: \n${versionText}\n\n` +
            `${formData.scope}\n\n` +
            `Reproduction Rate:\n${formData.reproduction}\n\n` +
            `Severity: \n${severityText}`;

        return bugReport;
    },

    async copyToClipboard() {
        try {
            const bugReport = await this.generateReport();
            console.log('Generated Bug Report:', bugReport); // Debug log
            await navigator.clipboard.writeText(bugReport);
            console.log('Copied to clipboard successfully'); // Debug log
            const copyStatus = document.getElementById('copyStatus');
            copyStatus.textContent = 'Copied to clipboard!';
            copyStatus.style.color = '#4CAF50';
            copyStatus.style.display = 'block';
            setTimeout(() => copyStatus.style.display = 'none', 3000);
        } catch (err) {
            console.error('Error copying to clipboard:', err); // Debug log
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
                const result = await chrome.storage.local.get('activeTabInfo');
                console.log('Retrieved stored tab info:', result.activeTabInfo);
                tabId = result.activeTabInfo?.id;
                if (!tabId) {
                    throw new Error('No stored tab information found');
                }
            } else {
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
                        const userAgent = window.navigator.userAgent;
                        let match;
                        if ((match = userAgent.match(/Chrome\/(\d+)/))) {
                            const browser = userAgent.includes('Edg') ? 'Edge' : 'Chrome';
                            const majorVersion = match[1];
                            return `${browser} ${majorVersion}`;
                        }
                        if ((match = userAgent.match(/Firefox\/(\d+)/))) {
                            const majorVersion = match[1];
                            return `Firefox ${majorVersion}`;
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
                
                // Only auto-detect if no environments exist
                if (container.children.length === 0) {
                    // Create first environment without delete button
                    FormManager.addEnvironment(true);
                    const envInput = container.querySelector('.environment-container:last-child input');
                    if (envInput) {
                        envInput.value = `${os} - ${browserVersion}`;
                    }
                }
                
                // Update version element
                const versionElement = document.getElementById('version');
                if (versionElement) {
                    const currentDate = new Date().toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });
                    versionElement.textContent = `${url} - ${currentDate}`;
                }
            }
        } catch (err) {
            ErrorHandler.handle(err, 'Environment Detection');
        }
    }
};


// 4. Screenshot Functions
const ScreenshotManager = {
    async captureVisible() {
        const screenshotStatus = document.getElementById('screenshotStatus');
        try {
            const isPopout = new URLSearchParams(window.location.search).get('popout');
            let windowId;

            if (isPopout) {
                const result = await chrome.storage.local.get('activeTabInfo');
                if (!result.activeTabInfo) {
                    throw new Error('No stored tab information found');
                }
                windowId = result.activeTabInfo.windowId;
            } else {
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
            setTimeout(() => screenshotStatus.style.display = 'none', 3000);
        } catch (err) {
            ErrorHandler.handle(err, 'Screenshot');
        }
    },

    async captureFull() {
        const progressBar = document.getElementById('screenshotProgress');
        const progressBarFill = document.getElementById('screenshotProgressFill');
        const screenshotStatus = document.getElementById('screenshotStatus');

        try {
            const isPopout = new URLSearchParams(window.location.search).get('popout');
            let tabId, windowId;

            if (isPopout) {
                const result = await chrome.storage.local.get('activeTabInfo');
                if (!result.activeTabInfo) {
                    throw new Error('No stored tab information found');
                }
                tabId = result.activeTabInfo.id;
                windowId = result.activeTabInfo.windowId;
            } else {
                const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                tabId = currentTab?.id;
                windowId = currentTab?.windowId;
            }

            if (!tabId) throw new Error('No active tab found');

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
            const originalScroll = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => ({ x: window.scrollX, y: window.scrollY })
            });

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
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }

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
            setTimeout(() => screenshotStatus.style.display = 'none', 3000);
        } catch (err) {
            ErrorHandler.handle(err, 'Screenshot');
            if (progressBar) progressBar.style.display = 'none';
        }
    }
};


// 5. Event Listeners
async function updatePopoutButtonState() {
    try {
        const popoutButton = document.getElementById('popoutButton');
        if (!popoutButton) return;

        const { popoutWindowId } = await chrome.storage.local.get('popoutWindowId');
        
        if (popoutWindowId) {
            try {
                await chrome.windows.get(popoutWindowId);
                popoutButton.disabled = true;
            } catch {
                await chrome.storage.local.remove('popoutWindowId');
                popoutButton.disabled = false;
            }
        } else {
            popoutButton.disabled = false;
        }
    } catch (error) {
        console.error('Error updating popout button state:', error);
    }
}

// Event Listeners
const initializeEventListeners = () => {
    const addFormChangeListener = (element) => {
        element.addEventListener('input', debounce(async () => {
            FormStateManager.markDirty();
            await FormManager.saveForm();
        }, AUTOSAVE_DELAY));
    };

    document.querySelectorAll('input, textarea, select').forEach(addFormChangeListener);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    node.querySelectorAll('input, textarea').forEach(addFormChangeListener);
                }
            });
        });
    });

    const config = { childList: true, subtree: true };
    observer.observe(document.getElementById('steps-container'), config);
    observer.observe(document.getElementById('environments-container'), config);

    // Prevent form submission on enter key
    document.getElementById('bugReportForm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    });
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize KeyboardManager first
        KeyboardManager.init();
        
        // Rest of the existing initializations
        await Promise.all([
            PopoutManager.initializePopout(),
            updatePopoutButtonState(),
            FormManager.initializeForm(),
            EnvironmentManager.detectEnvironment(),
            TabManager.populateUrlDropdown()
        ]);

        initializeEventListeners();
        initializeButtonHandlers();
        
        const stepsContainer = document.getElementById('steps-container');
        if (stepsContainer?.children.length === 0) {
            FormManager.addStep();
        }

        // Restore URL parameters handling
        const urlParams = new URLSearchParams(window.location.search);
        const sourceTabId = parseInt(urlParams.get('tabId'));
        if (sourceTabId) {
            await TabManager.trackTab(sourceTabId);
        }
    } catch (err) {
        ErrorHandler.handle(err, 'Initialization');
    }
});

// Separate function for button handlers
const initializeButtonHandlers = () => {
    // Add Step Button Handler
    const addStepButton = document.getElementById('addStepButton');
    if (addStepButton) {
        addStepButton.addEventListener('click', (e) => {
            e.preventDefault();
            const lastStepInput = document.querySelector('.step-container:last-child input');
            if (lastStepInput && lastStepInput.value.trim() === '') {
                alert('Please fill in the current step before adding a new one.');
                lastStepInput.focus();
                return;
            }
            FormManager.addStep();
        });
    }

    // Add Environment Button Handler
    const addEnvironmentButton = document.getElementById('addEnvironmentButton');
    if (addEnvironmentButton) {
        addEnvironmentButton.addEventListener('click', (e) => {
            e.preventDefault();
            const lastEnvInput = document.querySelector('.environment-container:last-child input');
            if (lastEnvInput && lastEnvInput.value.trim() === '') {
                alert('Please fill in the current environment before adding a new one.');
                lastEnvInput.focus();
                return;
            }
            FormManager.addEnvironment(false);
        });
    }

    // URL Select Handler
    const urlSelect = document.getElementById('urlSelect');
    if (urlSelect) {
        urlSelect.addEventListener('change', (e) => {
            TabManager.updateVersionText(e.target.value);
        });
    }

    // Clear Button Handler
    const clearButton = document.getElementById('clearButton');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all fields?')) {
                FormManager.clearForm();
            }
        });
    }

    // Copy Button Handler
    const copyButton = document.getElementById('copyButton');
    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            try {
                await CopyManager.copyToClipboard();
            } catch (error) {
                ErrorHandler.handle(error, 'Copy to Clipboard');
            }
        });
    }
};

document.getElementById('popoutButton')?.addEventListener('click', async () => {
    try {
        const popoutButton = document.getElementById('popoutButton');
        popoutButton.disabled = true;

        // Get current tab info before creating popout
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Store the active tab information
        await chrome.storage.local.set({
            'activeTabInfo': {
                id: tab.id,
                windowId: tab.windowId,
                url: tab.url,
                title: tab.title
            }
        });

        const screenWidth = window.screen.availWidth;
        const screenHeight = window.screen.availHeight;
        const width = Math.floor(600);
        const height = Math.floor(Math.min(800, screenHeight * 0.8));
        const left = Math.floor((screenWidth - width) / 2);
        const top = Math.floor((screenHeight - height) / 2);

        popoutWindow = await chrome.windows.create({
            url: 'popup.html?popout=true',
            type: 'popup',
            width: width,
            height: height,
            left: left,
            top: top
        });

        await chrome.storage.local.set({ popoutWindowId: popoutWindow.id });

        chrome.windows.onRemoved.addListener(async function windowCloseHandler(windowId) {
            if (windowId === popoutWindow.id) {
                await chrome.storage.local.remove(['popoutWindowId', 'activeTabInfo']);
                popoutButton.disabled = false;
                popoutWindow = null;
                chrome.windows.onRemoved.removeListener(windowCloseHandler);
            }
        });

        setTimeout(async () => {
            if (popoutWindow) {
                const contentHeight = document.documentElement.scrollHeight + 40;
                const adjustedHeight = Math.min(contentHeight, screenHeight * 0.8);

                if (adjustedHeight !== height) {
                    await chrome.windows.update(popoutWindow.id, {
                        height: adjustedHeight
                    });
                }
            }
        }, 250);

        window.close();
    } catch (err) {
        const popoutButton = document.getElementById('popoutButton');
        popoutButton.disabled = false;
        await chrome.storage.local.remove(['popoutWindowId', 'activeTabInfo']);
        console.error('Error creating pop-out window:', err);
        ErrorHandler.handle(err, 'Pop-out Creation');
    }
});

// Add event listeners for form changes
document.querySelectorAll('input, textarea, select').forEach(element => {
    element.addEventListener('input', debounce(() => {
        FormManager.saveForm();
        FormStateManager.markDirty();
    }, 500));
});

// Screenshot functionality
document.getElementById('screenshotButton')?.addEventListener('click', async () => {
    await ScreenshotManager.captureVisible();
});

document.getElementById('screenshotDropdownToggle')?.addEventListener('click', () => {
    const dropdown = document.getElementById('screenshotDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('#screenshotDropdown button').forEach(button => {
    button.addEventListener('click', async () => {
        const type = button.dataset.type;
        if (type === 'visible') {
            await ScreenshotManager.captureVisible();
        } else if (type === 'full') {
            await ScreenshotManager.captureFull();
        }
        document.getElementById('screenshotDropdown').style.display = 'none';
    });
});

// Add these after the DOMContentLoaded event listener
document.getElementById('infoButton')?.addEventListener('click', () => {
    const infoOverlay = document.getElementById('infoOverlay');
    infoOverlay.classList.add('show');
});

document.getElementById('futureButton')?.addEventListener('click', async () => {
    const permissionOverlay = document.getElementById('permissionOverlay');
    permissionOverlay.classList.add('show');

    try {
        // Check each permission individually
        const permissionChecks = {
            'activeTabPermission': await chrome.permissions.contains({ permissions: ['activeTab'] }),
            'downloadsPermission': await chrome.permissions.contains({ permissions: ['downloads'] }),
            'scriptingPermission': await chrome.permissions.contains({ permissions: ['scripting'] }),
            'clipboardPermission': await chrome.permissions.contains({ permissions: ['clipboardWrite'] }),
            'tabsPermission': await chrome.permissions.contains({ permissions: ['tabs'] }) // windows access is included
        };

        // Update checkbox states and disable granted permissions
        Object.entries(permissionChecks).forEach(([id, hasPermission]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = hasPermission;
                if (hasPermission) {
                    checkbox.disabled = true;
                    // Add helper text to explain why it's disabled
                    const label = checkbox.closest('label');
                    const small = label?.nextElementSibling;
                    if (small) {
                        small.textContent += ' (Granted permissions cannot be revoked)';
                    }
                }
            }
        });

        // Add explanation text at the top of the permissions list
        const permissionList = document.querySelector('.permission-list');
        if (permissionList) {
            const notice = document.createElement('div');
            notice.className = 'permission-notice';
            notice.textContent = 'Note: Once granted, permissions can only be revoked by uninstalling the extension.';
            notice.style.color = '#666';
            notice.style.marginBottom = '10px';
            notice.style.fontSize = '0.9em';
            permissionList.insertBefore(notice, permissionList.firstChild);
        }
    } catch (err) {
        ErrorHandler.handle(err, 'Check Permissions');
    }
});

document.getElementById('refreshButton')?.addEventListener('click', async () => {
    try {
        // Refresh permissions
        await chrome.permissions.getAll();
        // Re-detect environment
        await EnvironmentManager.detectEnvironment();
        // Show success message
        const status = document.getElementById('copyStatus');
        status.textContent = 'Permissions refreshed!';
        status.style.color = '#4CAF50';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', 3000);
    } catch (err) {
        ErrorHandler.handle(err, 'Refresh Permissions');
    }
});

// Add click listeners for the close buttons in overlays
document.querySelectorAll('.close-overlay').forEach(button => {
    button.addEventListener('click', () => {
        const overlay = button.closest('.overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    });
});

document.querySelector('.save-permissions')?.addEventListener('click', async () => {
    try {
        const permissions = [];

        // Only collect permissions that are checked but not yet granted
        const checkboxes = document.querySelectorAll('.permission-item input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            if (checkbox.checked && !checkbox.disabled) {
                const permission = checkbox.id.replace('Permission', '');
                // Special handling for clipboard permission
                if (permission === 'clipboard') {
                    permissions.push('clipboardWrite');
                } else {
                    permissions.push(permission);
                }
            }
        }

        if (permissions.length === 0) {
            const overlay = document.getElementById('permissionOverlay');
            overlay.classList.remove('show');
            return;
        }

        // Request only new permissions
        const granted = await chrome.permissions.request({
            permissions: permissions,
            origins: ['<all_urls>']
        });

        if (granted) {
            // Close the overlay
            const overlay = document.getElementById('permissionOverlay');
            overlay.classList.remove('show');
            
            // Show success message
            const status = document.getElementById('copyStatus');
            status.textContent = 'New permissions granted successfully!';
            status.style.color = '#4CAF50';
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 3000);

            // Refresh environment detection
            await EnvironmentManager.detectEnvironment();
        } else {
            throw new Error('New permissions were not granted');
        }
    } catch (err) {
        ErrorHandler.handle(err, 'Permission Update');
        
        // Show error message
        const status = document.getElementById('copyStatus');
        status.textContent = 'Failed to update permissions. Please try again.';
        status.style.color = '#e74c3c';
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', 3000);
    }
});

const ReportGenerator = {
    generateReport() {
        const formData = FormManager.getFormData();
        const severity = document.getElementById('severity');
        const severityText = severity.options[severity.selectedIndex].text;
        const versionElement = document.getElementById('version');
        const versionText = versionElement ? versionElement.textContent : 'Version not available';

        // Get steps and filter out empty ones before joining, with proper numbering
        const nonEmptySteps = Array.from(document.querySelectorAll('.step-container'))
            .map(container => ({
                description: container.querySelector('input').value.trim()
            }))
            .filter(step => step.description)  // Only keep steps with content
            .map((step, index) => `${index + 1} ${step.description}`)  // Number only the non-empty steps
            .join('\n');

        // Filter out empty environments (existing logic)
        const environments = formData.environments
            .filter(env => env.trim())
            .join(' - ');

        return `
Title: ${formData.title}

Description:
${formData.observed}

${formData.expected}

Steps to recreate:
${nonEmptySteps}

Environment:
${environments}

Version:
${versionText}

${formData.scope}

Reproduction Rate: ${formData.reproduction}

Severity: ${severityText}
`;
    }
};

document.getElementById('appendTimeCheckbox').addEventListener('change', function() {
    const versionElement = document.getElementById('version');
    const currentUrl = versionElement.textContent.split(' - ')[0];
    const currentDate = new Date().toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    if (this.checked) {
        const currentTime = new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        versionElement.textContent = `${currentUrl} - ${currentDate} - ${currentTime}`;
    } else {
        versionElement.textContent = `${currentUrl} - ${currentDate}`;
    }
});

// Add this event listener to handle Ctrl+S
document.addEventListener('keydown', async function(e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault(); // Prevent default browser save
        try {
            const bugReport = await ReportGenerator.generateReport();
            const blob = new Blob([bugReport], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `bug-report-${timestamp}.txt`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);

            const status = document.getElementById('copyStatus');
            status.textContent = 'Report saved as text file!';
            status.style.color = '#4CAF50';
            status.style.display = 'block';
            setTimeout(() => status.style.display = 'none', 3000);
        } catch (err) {
            ErrorHandler.handle(err, 'Save Report');
        }
    }
});

const TabManager = {
    async getAllTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            return tabs.map(tab => ({
                id: tab.id,
                url: tab.url || 'unknown',
                active: tab.active,
                title: tab.title || 'Untitled'
            }));
        } catch (err) {
            ErrorHandler.handle(err, 'Get Tabs');
            return [];
        }
    },

    async populateUrlDropdown() {
        try {
            const select = document.getElementById('urlSelect');
            if (!select) return;

            const tabs = await this.getAllTabs();
            
            select.innerHTML = '';
            tabs.forEach(tab => {
                const option = document.createElement('option');
                option.value = tab.url;
                option.textContent = tab.title;
                option.selected = tab.active;
                select.appendChild(option);
            });

            // Initialize version input with the selected URL
            const versionInput = document.getElementById('versionInput');
            if (versionInput) {
                const selectedUrl = select.value;
                const currentDate = new Date().toLocaleDateString();
                let versionText = `${selectedUrl} - ${currentDate}`;
                
                const appendTimeCheckbox = document.getElementById('appendTimeCheckbox');
                if (appendTimeCheckbox?.checked) {
                    const currentTime = new Date().toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    versionText = `${versionText} - ${currentTime}`;
                }
                
                versionInput.value = versionText;
            }
        } catch (err) {
            ErrorHandler.handle(err, 'Populate URL Dropdown');
        }
    },

    updateVersionText(url) {
        const versionElement = document.getElementById('version');
        if (!versionElement) return;

        const currentDate = new Date().toLocaleDateString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        const appendTime = document.getElementById('appendTimeCheckbox')?.checked;
        let versionText = `${url} - ${currentDate}`;
        
        if (appendTime) {
            const currentTime = new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            versionText = `${versionText} - ${currentTime}`;
        }
        
        versionElement.textContent = versionText;
    },

    async trackTab(tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);
            await chrome.storage.local.set({
                activeTabInfo: {
                    id: tab.id,
                    url: tab.url,
                    title: tab.title
                }
            });
        } catch (err) {
            ErrorHandler.handle(err, 'Track Tab');
        }
    }
};

const PopoutManager = {
    async createPopout() {
        try {
            // Get current tab info before creating popout
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Store the tab info
            await chrome.storage.local.set({ 
                'storedTabInfo': {
                    id: tab.id,
                    url: tab.url,
                    title: tab.title
                }
            });

            const popout = await chrome.windows.create({
                url: 'popup.html?popout=true',
                type: 'popup',
                width: 600,
                height: 800
            });

            await chrome.storage.local.set({ 'popoutWindowId': popout.id });
            return popout;
        } catch (err) {
            throw err;
        }
    },

    async initializePopout() {
        if (window.location.search.includes('popout=true')) {
            const result = await chrome.storage.local.get('storedTabInfo');
            if (result.storedTabInfo) {
                activeTabInfo = result.storedTabInfo;
                await EnvironmentManager.detectEnvironment();
            }
        }
    }
};

const WindowManager = {
    async createResizableWindow() {
        try {
            // Get the current window to position the new one relative to it
            const currentWindow = await chrome.windows.getCurrent();
            
            // Create a new window with specific properties
            const newWindow = await chrome.windows.create({
                url: 'popup.html',
                type: 'popup',
                width: 500,
                height: 800,
                left: currentWindow.left + 50,
                top: currentWindow.top + 50,
                focused: true
            });

            // Close the popup
            window.close();
        } catch (err) {
            ErrorHandler.handle(err, 'Create Resizable Window');
        }
    }
};

// Add event listener to the pop-out button
document.getElementById('popoutButton').addEventListener('click', async () => {
    // Check for required permissions first
    const hasPermission = await PermissionManager.checkPermission('windows');
    if (!hasPermission) {
        await PermissionManager.requestPermission('windows');
    }
    await WindowManager.createResizableWindow();
});

const FormValidation = {
    validateTitle(title) {
        return title.length >= 5 && title.length <= 200;
    },
    validateSteps(steps) {
        return steps.length >= 1 && steps.every(step => step.description.length > 0);
    },
    showValidationError(fieldId, message) {
        const field = document.getElementById(fieldId);
        field.setCustomValidity(message);
        field.reportValidity();
    }
};

// Replace the existing version span handling with this new input handling
function updateVersionInformation(preserveExisting = false) {
    const urlSelect = document.getElementById('urlSelect');
    const versionInput = document.getElementById('versionInput');
    const appendTimeCheckbox = document.getElementById('appendTimeCheckbox');
    
    // If preserving existing content, extract the URL part from the current input
    let selectedUrl = preserveExisting ? 
        versionInput.value.split(' - ')[0] : 
        urlSelect.value;
    
    const currentDate = new Date().toLocaleDateString();
    let versionText = `${selectedUrl} - ${currentDate}`;
    
    if (appendTimeCheckbox.checked) {
        const currentTime = new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        versionText = `${versionText} - ${currentTime}`;
    }
    
    versionInput.value = versionText;
}

// Update event listeners
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    
    const urlSelect = document.getElementById('urlSelect');
    const appendTimeCheckbox = document.getElementById('appendTimeCheckbox');
    
    urlSelect.addEventListener('change', () => updateVersionInformation(false));
    appendTimeCheckbox.addEventListener('change', () => updateVersionInformation(true));
    
    // Initial update
    updateVersionInformation(false);
});

// Update the save/restore functionality to use the input value
function saveFormData() {
    // ... existing code ...
    const formData = {
        // ... other form fields ...
        version: document.getElementById('versionInput').value,
        appendTime: document.getElementById('appendTimeCheckbox').checked
    };
    // ... rest of save logic ...
}

function restoreFormData(data) {
    // ... existing code ...
    if (data.version) {
        document.getElementById('versionInput').value = data.version;
    }
    if (data.appendTime !== undefined) {
        document.getElementById('appendTimeCheckbox').checked = data.appendTime;
    }
    // ... rest of restore logic ...
}

