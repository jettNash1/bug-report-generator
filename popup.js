// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Constants
    const ELEMENTS = {
        copyButton: document.getElementById('copyButton'),
        screenshotButton: document.getElementById('screenshotButton'),
        dropdownToggle: document.getElementById('screenshotDropdownToggle'),
        dropdown: document.getElementById('screenshotDropdown'),
        copyStatus: document.getElementById('copyStatus'),
        screenshotStatus: document.getElementById('screenshotStatus'),
        stepsContainer: document.getElementById('steps-container'),
        environmentsContainer: document.getElementById('environments-container'),
        versionDisplay: document.getElementById('version'),
        progressBar: document.getElementById('screenshotProgress'),
        progressBarFill: document.getElementById('screenshotProgressFill')
    };

    // Utility Functions
    const utils = {
        showStatus: (element, message, isSuccess = true, duration = 2000) => {
            element.textContent = message;
            element.style.color = isSuccess ? '#4CAF50' : 'red';
            element.style.display = 'block';
            setTimeout(() => {
                element.style.display = 'none';
            }, duration);
        },

        loadImage: (dataUrl) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = dataUrl;
            });
        },

        getCurrentTab: async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab;
        },

        getTimestamp: () => {
            return new Date().toISOString().replace(/[:.]/g, '-');
        }
    };

    // Version Setup
    async function setupVersion() {
        try {
            const tab = await utils.getCurrentTab();
            const today = new Date();
            const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
            
            if (!tab.url) {
                throw new Error('URL not found');
            }

            ELEMENTS.versionDisplay.textContent = `${tab.url} - ${dateStr}`;
        } catch (err) {
            console.error('Failed to set version display:', err);
            ELEMENTS.versionDisplay.textContent = 'Error loading version';
        }
    }

    // Steps Management
    const stepsManager = {
        addStep: () => {
            if (!ELEMENTS.stepsContainer) return;

            const stepNumber = ELEMENTS.stepsContainer.children.length + 1;
            const stepContainer = document.createElement('div');
            stepContainer.className = 'step-container';
            
            stepContainer.innerHTML = `
                <span>${stepNumber}.</span>
                <input type="text" class="step-input" placeholder="Enter step description">
                <button class="remove-btn">X</button>
            `;

            const removeButton = stepContainer.querySelector('.remove-btn');
            removeButton?.addEventListener('click', () => {
                stepContainer.remove();
                stepsManager.renumberSteps();
            });

            ELEMENTS.stepsContainer.appendChild(stepContainer);
        },

        renumberSteps: () => {
            const stepContainers = ELEMENTS.stepsContainer.querySelectorAll('.step-container');
            stepContainers.forEach((container, index) => {
                const stepNumber = container.querySelector('span');
                if (stepNumber) {
                    stepNumber.textContent = `${index + 1}.`;
                }
            });
        }
    };

    // Environment Management
    const environmentManager = {
        addEnvironment: () => {
            if (!ELEMENTS.environmentsContainer) return;

            const envContainer = document.createElement('div');
            envContainer.className = 'environment-container';
            
            envContainer.innerHTML = `
                <input type="text" placeholder="OS - Browser - Device" style="flex: 1">
                <button class="remove-btn">X</button>
            `;

            const removeButton = envContainer.querySelector('.remove-btn');
            removeButton?.addEventListener('click', () => envContainer.remove());

            ELEMENTS.environmentsContainer.appendChild(envContainer);
        }
    };

    // Screenshot Functionality
    async function takeScreenshot(type) {
        try {
            const tab = await utils.getCurrentTab();
            
            if (type === 'full') {
                await takeFullPageScreenshot(tab);
            } else {
                await takeVisibleAreaScreenshot(tab);
            }
        } catch (err) {
            console.error('Screenshot failed:', err);
            utils.showStatus(ELEMENTS.screenshotStatus, `Screenshot failed: ${err.message}`, false);
            ELEMENTS.progressBar.style.display = 'none';
        }
    }

    async function takeFullPageScreenshot(tab) {
        ELEMENTS.progressBar.style.display = 'block';
        ELEMENTS.progressBarFill.style.width = '0%';

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
                devicePixelRatio: window.devicePixelRatio || 1
            })
        });

        if (!dimensions?.[0]?.result) {
            throw new Error('Failed to get page dimensions');
        }

        const { scrollHeight, scrollWidth, viewportHeight, devicePixelRatio } = dimensions[0].result;
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);

        const canvas = new OffscreenCanvas(
            scrollWidth * devicePixelRatio,
            scrollHeight * devicePixelRatio
        );
        const ctx = canvas.getContext('2d');

        const originalScroll = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ x: window.scrollX, y: window.scrollY })
        });

        for (let i = 0; i < totalSteps; i++) {
            ELEMENTS.progressBarFill.style.width = `${(i / totalSteps) * 100}%`;
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (scrollTo) => window.scrollTo(0, scrollTo),
                args: [i * viewportHeight]
            });

            await new Promise(resolve => setTimeout(resolve, 150));

            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            const img = await utils.loadImage(dataUrl);
            ctx.drawImage(img, 0, i * viewportHeight * devicePixelRatio);
        }

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (scroll) => window.scrollTo(scroll.x, scroll.y),
            args: [originalScroll[0].result]
        });

        ELEMENTS.progressBarFill.style.width = '100%';

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const url = URL.createObjectURL(blob);
        
        await chrome.downloads.download({
            url: url,
            filename: `bug-report-full-screenshot-${utils.getTimestamp()}.png`,
            saveAs: true
        });

        URL.revokeObjectURL(url);
        ELEMENTS.progressBar.style.display = 'none';
        utils.showStatus(ELEMENTS.screenshotStatus, 'Full page screenshot saved!');
    }

    async function takeVisibleAreaScreenshot(tab) {
        const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        await chrome.downloads.download({
            url: screenshot,
            filename: `bug-report-screenshot-${utils.getTimestamp()}.png`,
            saveAs: true
        });
        utils.showStatus(ELEMENTS.screenshotStatus, 'Screenshot saved!');
    }

    // Clipboard Functionality
    async function copyToClipboard() {
        const formElements = {
            title: document.getElementById('title').value,
            observed: document.getElementById('observed').value.replace(/^Tester has observed that:\s*/, ''),
            expected: document.getElementById('expected').value.replace(/^It is expected:\s*/, ''),
            scope: document.getElementById('scope').value,
            reproductionPercent: document.getElementById('reproductionPercent').value,
            reproductionDesc: document.getElementById('reproductionDesc').value,
            severity: document.getElementById('severity')
        };

        const steps = Array.from(ELEMENTS.stepsContainer.querySelectorAll('.step-container'))
            .map(container => {
                const number = container.querySelector('span').textContent;
                const description = container.querySelector('input').value;
                return `${number} ${description}`;
            })
            .join('\n');

        const environments = Array.from(ELEMENTS.environmentsContainer.querySelectorAll('input'))
            .map(input => input.value.trim())
            .filter(Boolean)
            .join('\n');

        const severityText = formElements.severity.options[formElements.severity.selectedIndex].text;

        const bugReport = `${formElements.title}

${formElements.observed}
${formElements.expected}

Steps to recreate:
${steps}

Environment: 
${environments}
${formElements.scope}

Reproduction rate: ${formElements.reproductionPercent}% - ${formElements.reproductionDesc}

Version: ${ELEMENTS.versionDisplay.textContent}

Severity: ${severityText}`;

        try {
            await navigator.clipboard.writeText(bugReport);
            utils.showStatus(ELEMENTS.copyStatus, 'Copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            utils.showStatus(ELEMENTS.copyStatus, 'Failed to copy!', false);
        }
    }

    // Event Listeners
    function setupEventListeners() {
        ELEMENTS.screenshotButton.addEventListener('click', () => takeScreenshot('visible'));
        ELEMENTS.dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            ELEMENTS.dropdown.classList.toggle('show');
        });

        ELEMENTS.dropdown.addEventListener('click', (e) => {
            const button = e.target.closest
		}
	}
}
