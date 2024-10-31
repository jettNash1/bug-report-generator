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

    // Function to save form data
    async function saveFormData() {
        const formData = {
            title: document.getElementById('title')?.value || '',
            observed: document.getElementById('observed')?.value || '',
            expected: document.getElementById('expected')?.value || '',
            scope: document.getElementById('scope')?.value || '',
            reproductionPercent: document.getElementById('reproductionPercent')?.value || '',
            reproductionDesc: document.getElementById('reproductionDesc')?.value || '',
            severity: document.getElementById('severity')?.value || '',
            steps: Array.from(stepsContainer.querySelectorAll('.step-container'))
                .map(container => ({
                    number: container.querySelector('span').textContent,
                    description: container.querySelector('input').value
                })),
            environments: Array.from(environmentsContainer.querySelectorAll('input'))
                .map(input => input.value)
        };

        await chrome.storage.local.set({ formData });
        console.log('Form data saved:', formData);
    }

    // Function to restore form data
    async function restoreFormData() {
        const { formData } = await chrome.storage.local.get('formData');
        if (!formData) return;

        console.log('Restoring form data:', formData);

        // Restore basic fields
        if (document.getElementById('title')) document.getElementById('title').value = formData.title;
        if (document.getElementById('observed')) document.getElementById('observed').value = formData.observed;
        if (document.getElementById('expected')) document.getElementById('expected').value = formData.expected;
        if (document.getElementById('scope')) document.getElementById('scope').value = formData.scope;
        if (document.getElementById('reproductionPercent')) document.getElementById('reproductionPercent').value = formData.reproductionPercent;
        if (document.getElementById('reproductionDesc')) document.getElementById('reproductionDesc').value = formData.reproductionDesc;
        if (document.getElementById('severity')) document.getElementById('severity').value = formData.severity;

        // Clear existing steps and environments
        stepsContainer.innerHTML = '';
        environmentsContainer.innerHTML = '';

        // Restore steps
        formData.steps.forEach(step => {
            const stepContainer = document.createElement('div');
            stepContainer.className = 'step-container';
            stepContainer.innerHTML = `
                <span>${step.number}</span>
                <input type="text" class="step-input" value="${step.description}" placeholder="Enter step description">
                <button class="remove-btn">X</button>
            `;

            const removeButton = stepContainer.querySelector('.remove-btn');
            removeButton.addEventListener('click', () => {
                stepContainer.remove();
                renumberSteps();
                saveFormData();
            });

            stepsContainer.appendChild(stepContainer);
        });

        // Restore environments
        formData.environments.forEach(env => {
            const envContainer = document.createElement('div');
            envContainer.className = 'environment-container';
            envContainer.innerHTML = `
                <input type="text" value="${env}" placeholder="OS - Browser - Device" style="flex: 1">
                <button class="remove-btn">X</button>
            `;

            const removeButton = envContainer.querySelector('.remove-btn');
            removeButton.addEventListener('click', () => {
                envContainer.remove();
                saveFormData();
            });

            environmentsContainer.appendChild(envContainer);
        });
    }

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
            saveFormData();
        });

        stepsContainer.appendChild(stepContainer);
        console.log('Step added successfully');
        saveFormData();
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
            saveFormData();
        });

        environmentsContainer.appendChild(envContainer);
        console.log('Environment added successfully');
        saveFormData();
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
                    scrollWidth * devicePixelRatio,
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
                    const dataUrl = await chrome.tabs.captureVisibleTab(tab.window