chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'detectEnvironment') {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
            if (!tabs[0]?.id) {
                sendResponse(null);
                return;
            }

            try {
                const envInfo = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
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
                    sendResponse(envInfo[0].result);
                } else {
                    sendResponse(null);
                }
            } catch (error) {
                console.error('Environment detection error:', error);
                sendResponse(null);
            }
        });

        // Keep the message channel open for the async response
        return true;
    }
});

function detectOS(userAgent) {
    // Windows detection with version
    if (userAgent.includes('Windows')) {
        if (userAgent.includes('Windows NT 10.0')) return 'Windows 11/10';
        if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1';
        if (userAgent.includes('Windows NT 6.2')) return 'Windows 8';
        if (userAgent.includes('Windows NT 6.1')) return 'Windows 7';
        if (userAgent.includes('Windows NT 6.0')) return 'Windows Vista';
        if (userAgent.includes('Windows NT 5.1')) return 'Windows XP';
        if (userAgent.includes('Windows NT 5.0')) return 'Windows 2000';
        
        // Additional check for Windows 11
        if (userAgent.includes('Windows NT 10.0')) {
            // Try to get more specific Windows version information
            try {
                const platformInfo = navigator.userAgentData?.platformVersion;
                if (platformInfo && parseInt(platformInfo) >= 13) {
                    return 'Windows 11';
                }
                return 'Windows 10';
            } catch {
                return 'Windows 10/11'; // Fallback if we can't determine specifically
            }
        }
        return 'Windows (Unknown Version)';
    }
    
    // macOS detection with version
    if (userAgent.includes('Mac OS X')) {
        try {
            const macVersion = userAgent.match(/Mac OS X (\d+[._]\d+[._]\d+|\d+[._]\d+)/i);
            if (macVersion) {
                const versionString = macVersion[1].replace(/_/g, '.');
                return `macOS ${versionString}`;
            }
        } catch {
            // If version parsing fails, return generic macOS
        }
        return 'macOS';
    }

    // Linux detection with distribution if available
    if (userAgent.includes('Linux')) {
        if (userAgent.includes('Ubuntu')) return 'Linux (Ubuntu)';
        if (userAgent.includes('Fedora')) return 'Linux (Fedora)';
        if (userAgent.includes('SUSE')) return 'Linux (SUSE)';
        if (userAgent.includes('Debian')) return 'Linux (Debian)';
        return 'Linux';
    }

    // Mobile OS detection with version
    if (userAgent.includes('Android')) {
        const match = userAgent.match(/Android\s([0-9.]*)/);
        return match ? `Android ${match[1]}` : 'Android';
    }
    if (userAgent.includes('iOS')) {
        const match = userAgent.match(/OS\s([0-9_]*)/);
        return match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
    }

    return 'Unknown OS';
}

function detectBrowser(userAgent) {
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Chrome')) {
        if (userAgent.includes('Edg')) return 'Edge';
        if (userAgent.includes('Opera')) return 'Opera';
        if (userAgent.includes('Brave')) return 'Brave';
        return 'Chrome';
    }
    if (userAgent.includes('Safari')) return 'Safari';
    return 'Unknown Browser';
}

function detectBrowserVersion(userAgent) {
    // Enhanced browser version detection
    if (userAgent.includes('Firefox')) {
        const matches = userAgent.match(/Firefox\/([0-9.]+)/);
        return matches ? matches[1] : 'Unknown Version';
    }
    if (userAgent.includes('Edge')) {
        const matches = userAgent.match(/Edg\/([0-9.]+)/);
        return matches ? matches[1] : 'Unknown Version';
    }
    if (userAgent.includes('Chrome')) {
        const matches = userAgent.match(/Chrome\/([0-9.]+)/);
        return matches ? matches[1] : 'Unknown Version';
    }
    if (userAgent.includes('Safari')) {
        const matches = userAgent.match(/Version\/([0-9.]+)/);
        return matches ? matches[1] : 'Unknown Version';
    }
    return 'Unknown Version';
}

function detectDeviceType(userAgent) {
    // Enhanced device type detection
    if (userAgent.includes('Mobile')) {
        if (userAgent.includes('Tablet')) return 'Tablet';
        return 'Mobile';
    }
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
}