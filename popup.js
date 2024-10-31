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
    const versionDisplay = document.getElementById('version');
    const progressBar = document.getElementById('screenshotProgress');
    const progressBarFill = document.getElementById('screenshotProgressFill');
    
    // Set up version display with current URL and date
    async function setupVersion() {
        console.log('Setting up version display...');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const today = new Date();
            const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
            const versionStr = `${tab.url} - ${dateStr}`;
            
            console.log('Version components:', {
                url: tab.url,
                date: dateStr
            });

            if (!tab.url) {
                console.error('URL not found in current tab');
                throw new Error('URL not found');
            }

            versionDisplay.textContent = versionStr;
            console.log('Version display successfully set:', versionStr);
        } catch (err) {
            console.error('Failed to set version display:', err);
            versionDisplay.textContent = 'Error loading version';
        }
    }

    // Initialize version display
    await setupVersion();

    function addStep() {
        console.log('Add Step button clicked');
        
        if (!stepsContainer) {
            console.error('Steps container not found!');
            return;
        }

        const stepNumber = stepsContainer.children.length + 1;
        console.log('Creating step number:', stepNumber);

        const stepContainer = document.createElement('div');
        stepContainer.className = 'step-container';
        
        stepContainer.innerHTML = `
            <span>${stepNumber}.</span>
            <input type="text" class="step-input" placeholder="Enter step description">
            <button class="remove-btn">X</button>
        `;

        const removeButton = stepContainer.querySelector('.remove-btn');
        if (!removeButton) {
            console.error('Failed to create remove button');
            return;
        }

        removeButton.addEventListener('click', () => {
            console.log('Removing step:', stepNumber);
            stepContainer.remove();
            renumberSteps();
        });

        stepsContainer.appendChild(stepContainer);
        console.log('Step added successfully');
    }

    function addEnvironment() {
        console.log('Add Environment button clicked');
        
        if (!environmentsContainer) {
            console.error('Environments container not found!');
            return;
        }

        const envContainer = document.createElement('div');
        envContainer.className = 'environment-container';
        
        envContainer.innerHTML = `
            <input type="text" placeholder="OS - Browser - Device" style="flex: 1">
            <button class="remove-btn">X</button>
        `;

        const removeButton = envContainer.querySelector('.remove-btn');
        if (!removeButton) {
            console.error('Failed to create remove button');
            return;
        }

        removeButton.addEventListener('click', () => {
            console.log('Removing environment');
            envContainer.remove();
        });

        environmentsContainer.appendChild(envContainer);
        console.log('Environment added successfully');
    }

    function renumberSteps() {
        console.log('Renumbering steps...');
        const stepContainers = stepsContainer.querySelectorAll('.step-container');
        stepContainers.forEach((container, index) => {
            const stepNumber = container.querySelector('span');
            if (stepNumber) {
                stepNumber.textContent = `${index + 1}.`;
            }
        });
        console.log('Steps renumbered. New count:', stepContainers.length);
    }

    // Screenshot functionality
    screenshotButton.addEventListener('click', () => {
        takeScreenshot('visible');
    });

    dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    dropdown.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) {
            takeScreenshot(button.dataset.type);
            dropdown.classList.remove('show');
        }
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('show');
    });

    // Helper function to load image from data URL
    function loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

async function takeScreenshot(type) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (type === 'full') {
            progressBar.style.display = 'block';
            progressBarFill.style.width = '0%';
            
            // Execute script to get full page dimensions
            const dimensions = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    return {
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
                    };
                }
            });

            if (!dimensions || !dimensions[0]?.result) {
                throw new Error('Failed to get page dimensions');
            }

            const { scrollHeight, scrollWidth, viewportHeight, viewportWidth, devicePixelRatio } = dimensions[0].result;
            const totalSteps = Math.ceil(scrollHeight / viewportHeight);

            // Create canvas with proper dimensions
            const canvas = new OffscreenCanvas(
                scrollWidth * devicePixelRatio,  // Use full document width instead of viewport width
                scrollHeight * devicePixelRatio
            );
            const ctx = canvas.getContext('2d');

            // Get original scroll position
            const originalScroll = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({ x: window.scrollX, y: window.scrollY })
            });

            // Capture each section
            for (let i = 0; i < totalSteps; i++) {
                progressBarFill.style.width = `${(i / totalSteps) * 100}%`;
                
                // Scroll to position
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (scrollTo) => window.scrollTo(0, scrollTo),
                    args: [i * viewportHeight]
                });

                // Wait for any reflow/repaint
                await new Promise(resolve => setTimeout(resolve, 150));

                // Capture the viewport
                const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
                const img = await loadImage(dataUrl);
                
                // Draw it on the canvas at the correct position
                ctx.drawImage(img, 0, i * viewportHeight * devicePixelRatio);
            }

            // Restore original scroll position
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (scroll) => window.scrollTo(scroll.x, scroll.y),
                args: [originalScroll[0].result]
            });

            // Complete the progress bar
            progressBarFill.style.width = '100%';

            // Convert to blob and download
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
        } else {
            // Regular screenshot (visible area)
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
        }
    } catch (err) {
        console.error('Screenshot failed:', err);
        screenshotStatus.textContent = `Screenshot failed: ${err.message}`;
        screenshotStatus.style.color = 'red';
        screenshotStatus.style.display = 'block';
        progressBar.style.display = 'none';
    }

    setTimeout(() => {
        screenshotStatus.style.display = 'none';
    }, 2000);
}

	// Helper function to load image
	function loadImage(dataUrl) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = dataUrl;
		});
	}

    // Set up button click handlers
    const addStepBtn = document.querySelector('#addStep');
    const addEnvironmentBtn = document.querySelector('#addEnvironment');

    if (addStepBtn) {
        console.log('Add Step button found, adding event listener');
        addStepBtn.addEventListener('click', addStep);
    } else {
        console.error('Add Step button not found in DOM');
    }

    if (addEnvironmentBtn) {
        console.log('Add Environment button found, adding event listener');
        addEnvironmentBtn.addEventListener('click', addEnvironment);
    } else {
        console.error('Add Environment button not found in DOM');
    }

    // Initialize with one step and one environment
    console.log('Initializing first step and environment');
    addStep();
    addEnvironment();

    // Clipboard functionality
    copyButton.addEventListener('click', async () => {
        const title = document.getElementById('title').value;
        let observed = document.getElementById('observed').value;
        let expected = document.getElementById('expected').value;
        const scope = document.getElementById('scope').value;
        const reproductionPercent = document.getElementById('reproductionPercent').value;
        const reproductionDesc = document.getElementById('reproductionDesc').value;
        const severity = document.getElementById('severity');
        const severityText = severity.options[severity.selectedIndex].text;

        // Remove placeholder text if it exists
        observed = observed.replace(/^Tester has observed that:\s*/, '');
        expected = expected.replace(/^It is expected:\s*/, '');

        const steps = Array.from(stepsContainer.querySelectorAll('.step-container'))
            .map(container => {
                const number = container.querySelector('span').textContent;
                const description = container.querySelector('input').value;
                return `${number} ${description}`;
            })
            .join('\n');

        const environments = Array.from(environmentsContainer.querySelectorAll('input'))
            .map(input => input.value)
            .filter(value => value.trim() !== '')
            .join('\n');

        const bugReport = `${title}

${observed}
${expected}

Steps to recreate:
${steps}

Environment: 
${environments}
${scope}

Reproduction rate: ${reproductionPercent}% - ${reproductionDesc}

Version: ${versionDisplay.textContent}

Severity: ${severityText}`;

        try {
            await navigator.clipboard.writeText(bugReport);
            copyStatus.textContent = 'Copied to clipboard!';
            copyStatus.style.color = '#4CAF50';
            copyStatus.style.display = 'block';
            setTimeout(() => {
                copyStatus.style.display = 'none';
            }, 2000);
        } catch (err) {
            copyStatus.textContent = 'Failed to copy!';
            copyStatus.style.color = 'red';
            copyStatus.style.display = 'block';
            console.error('Failed to copy text: ', err);
        }
    });

    console.log('Extension setup complete');
});