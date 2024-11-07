// 1. Error Classes
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
            reproductionPercent: document.getElementById('reproductionPercent')?.value || '',
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
            FormStateManager.markDirty();
        } catch (err) {
            ErrorHandler.handle(err instanceof Error ? err : new StorageError('Failed to save form data'));
        }
    },

    addStep() {
        const container = document.createElement('div');
        container.className = 'step-container';
        const stepNumber = document.querySelectorAll('.step-container').length + 1;
        
        container.innerHTML = `
            <span>${stepNumber}.</span>
            <input type="text" placeholder="Enter step description">
            <button class="remove-btn">X</button>
        `;

        const removeButton = container.querySelector('.remove-btn');
        removeButton.addEventListener('click', () => {
            container.remove();
            this.renumberSteps();
            this.saveForm();
        });

        document.getElementById('steps-container').appendChild(container);
        container.querySelector('input').focus();
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
                        container.innerHTML = `
                            <span>${step.number}</span>
                            <input type="text" value="${step.description}" placeholder="Enter step description">
                            <button class="remove-btn">X</button>
                        `;
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

        const bugReport = `Title: ${formData.title}\n\n` +
            `Observed: ${observed}\n\n` +
            `Expected: ${expected}\n\n` +
            `Steps to Reproduce:\n${steps}\n\n` +
            `Environment:\n${environments}\n\n` +
            `Scope: ${formData.scope}\n` +
            `Reproduction: ${formData.reproductionPercent}%\n` +
            `Reproduction Description: ${formData.reproductionDesc}\n` +
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
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            const envInfo = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
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
                
                // Clear existing content
                container.innerHTML = '';
                
                // Format current date
                const currentDate = new Date().toLocaleDateString('en-GB', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                
                // Add single environment input with new format
                const envInput = document.createElement('div');
                envInput.className = 'environment-container';
                envInput.innerHTML = `
                    <input type="text" value="${os} - ${browserVersion}">
                    <button class="remove-btn">X</button>
                `;
                container.appendChild(envInput);

                // Set version with new format
                if (versionElement) {
                    versionElement.textContent = `${url} - ${currentDate}`;
                }
            }
        } catch (err) {
            console.error('Environment detection error:', err);
            // Fallback for edge:// pages or other restricted URLs
            const container = document.getElementById('environments-container');
            const versionElement = document.getElementById('version');
            
            if (container) {
                container.innerHTML = '';
                const envInput = document.createElement('div');
                envInput.className = 'environment-container';
                envInput.innerHTML = `
                    <input type="text" value="Unable to detect environment">
                    <button class="remove-btn">X</button>
                `;
                container.appendChild(envInput);
            }
            
            if (versionElement) {
                versionElement.textContent = 'Unable to detect version';
            }
        }
    }
};


// 4. Screenshot Functions
async function captureVisibleArea() {
    const screenshotStatus = document.getElementById('screenshotStatus');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
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
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab?.id) {
            throw new Error('No active tab found');
        }

        progressBar.style.display = 'block';
        progressBarFill.style.width = '0%';
        
        const dimensions = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
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
            target: { tabId: tab.id },
            func: () => ({ x: window.scrollX, y: window.scrollY })
        });

        // Capture viewports with rate limiting
        for (let i = 0; i < totalSteps; i++) {
            progressBarFill.style.width = `${(i / totalSteps) * 100}%`;
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (top) => window.scrollTo(0, top),
                args: [i * viewportHeight]
            });
            
            await new Promise(resolve => setTimeout(resolve, 250));
            
            const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            const img = await createImageBitmap(await (await fetch(screenshot)).blob());
            
            ctx.drawImage(img, 0, i * viewportHeight * devicePixelRatio);
            
            // Add delay between captures
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Restore original scroll position
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
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
    copyButton.addEventListener('click', () => CopyManager.copyToClipboard());
    screenshotButton.addEventListener('click', () => captureVisibleArea());
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

    dropdownToggle.addEventListener('click', () => {
        dropdown.classList.toggle('show');
    });
    dropdown.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            const type = button.dataset.type;
            if (type === 'visible') {
                captureVisibleArea();
            } else if (type === 'full') {
                captureFullPage();
            }
            dropdown.classList.remove('show');
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
});

// Create debounced version of form save
const debouncedSaveForm = debounce(() => FormManager.saveForm(), 500);