# Bug Report Generator Extension

A browser extension for generating structured bug reports with screenshot capabilities. Streamline your bug reporting process with formatted reports, automatic environment detection, and integrated screenshot tools.

## Features

- 📝 Generate structured bug reports
- 📸 Take full page or visible area screenshots
- 📋 One-click copy to clipboard
- 🔄 Track steps to reproduce
- 💻 Record environment details
- 🌐 Multi-browser support
- 🎯 Customizable severity levels
- 📊 Reproduction rate tracking

## Installation Guide

## Chrome Installation

### Method 1: Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Click "Add Extension" in the popup

### Method 2: Developer Mode
1. Download the latest release (.zip) from the [releases page](../../releases)
2. Unzip the downloaded file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top-right corner
5. Click "Load unpacked" in the top-left corner
6. Select the unzipped folder
7. The extension icon should appear in your browser toolbar

## Edge Installation

### Method 1: Microsoft Edge Add-ons Store (Coming Soon)
1. Visit the Edge Add-ons Store (link coming soon)
2. Click "Get"
3. Click "Add Extension" in the popup

### Method 2: Chrome Web Store in Edge
1. Open Edge
2. Navigate to the Chrome Web Store
3. Click "Allow extensions from other stores" if prompted
4. Click "Add to Chrome"
5. Click "Add Extension" in the popup

### Method 3: Developer Mode
1. Download the latest release (.zip) from the [releases page](../../releases)
2. Unzip the downloaded file
3. Open Edge and navigate to `edge://extensions/`
4. Enable "Developer mode" in the bottom-left corner
5. Click "Load unpacked" in the top-left corner
6. Select the unzipped folder
7. The extension icon should appear in your browser toolbar

## Firefox Installation

### Method 1: Firefox Add-ons (Coming Soon)
1. Visit Firefox Add-ons (link coming soon)
2. Click "Add to Firefox"
3. Click "Add" in the popup

### Method 2: Temporary Installation
1. Download the latest release (.zip) from the [releases page](../../releases)
2. Unzip the downloaded file
3. Open Firefox and navigate to `about:debugging`
4. Click "This Firefox" in the left sidebar
5. Click "Load Temporary Add-on"
6. Navigate to the unzipped folder and select the `manifest.json` file
7. The extension icon should appear in your browser toolbar

> **Note**: In Firefox, temporarily loaded extensions will be removed when you close the browser.

## Usage

1. Click the extension icon in your browser toolbar
2. Fill in the bug report details:
   - Title
   - Description
   - Steps to reproduce
   - Environment details
3. Use the screenshot tools:
   - Click "Take Screenshot" for visible area
   - Use dropdown for full page capture
4. Click "Copy to Clipboard" to get the formatted report

## Troubleshooting

### Extension Not Appearing
- Make sure Developer mode is enabled
- Try refreshing the extensions page
- Restart your browser

### Loading Error
- Ensure all files are properly unzipped
- Check that manifest.json is in the root folder
- Verify no files are missing or corrupted

### Permission Issues
The extension requires the following permissions:
- `activeTab`: For capturing screenshots
- `downloads`: For saving screenshots
- `scripting`: For full page screenshots
- `clipboardWrite`: For copying bug reports

### Browser Support Status

| Feature                | Chrome | Edge | Firefox |
|-----------------------|--------|------|---------|
| Basic Functionality   | ✅     | ✅   | ✅      |
| Full Page Screenshots | ✅     | ✅   | ⚠️      |
| Clipboard Support     | ✅     | ✅   | ✅      |
| Auto-Updates          | ✅*    | ✅*  | ✅*     |

\*When installed from official store

## Updating the Extension

### From Store (When Available)
- Updates will be automatic

### Developer Mode
1. Download the latest release
2. Delete the old extension from your browser
3. Follow the installation steps above for your browser
4. Your settings will be preserved

## Uninstallation

### Chrome/Edge
1. Right-click the extension icon
2. Select "Remove from [Browser]"
3. Click "Remove" to confirm

### Firefox
1. Click the menu button (≡)
2. Select "Add-ons and themes"
3. Find the extension in the list
4. Click the "..." menu
5. Select "Remove"

## Privacy

- All data remains local to your browser
- No data is collected or transmitted
- Screenshots are saved directly to your downloads folder
- No external servers are used

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Version History

### v2.3
- Added full page screenshot capability
- Improved error handling
- Added progress bar for full page captures

### v2.2
- Initial public release

---

For any issues or feature requests, please [create an issue](../../issues) on GitHub.

