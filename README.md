# Performance Measurement Tool

This tool automates Lighthouse performance audits for multiple pages. It performs configurable runs per page to provide reliable averages.

## Prerequisites
- Node.js (v18+)
- Target server running and accessible

## Installation
Run the following command in the project directory to install dependencies:
```bash
npm install
```

## Configuration

### `config.json`
Main configuration file for the tool:

```json
{
  "baseUrl": "https://127.0.0.1:8000",
  "loginPath": "/customer/user/login",
  "credentials": {
    "username": "AmandaRCole@example.org",
    "password": "AmandaRCole@example.org"
  },
  "runs": 5,
  "outputFilename": "performance_report.md"
}
```

| Option | Description |
|--------|-------------|
| `baseUrl` | Base URL of the target server |
| `loginPath` | Path to the login page (relative to baseUrl) |
| `credentials.username` | Login username |
| `credentials.password` | Login password |
| `runs` | Number of Lighthouse runs per page |
| `outputFilename` | Default output filename for the report |

### `pages.json`
List of pages to test. Each page has a name and a path relative to `baseUrl`:

```json
[
  { "name": "Homepage", "path": "/" },
  { "name": "Product Listing", "path": "/navigation-root/products/by-category/industrial" },
  { "name": "Product Details", "path": "/90-watt-bright-white-led-light-bulb" },
  { "name": "Shopping List", "path": "/customer/shoppinglist/update/3" },
  { "name": "Checkout", "path": "/customer/checkout/1" },
  { "name": "User Dashboard", "path": "/customer/user/dashboard/" }
]
```

## Usage
To run the performance audit with default settings:
```bash
node measure_all_pages.mjs
```

To specify a custom output filename (overrides `config.json`):
```bash
node measure_all_pages.mjs my_report.md
```

## Metrics Captured

### Core Web Vitals & Performance
| Metric | Description |
|--------|-------------|
| **Score** | Lighthouse Performance score (0-100) |
| **FCP** | First Contentful Paint (seconds) |
| **LCP** | Largest Contentful Paint (seconds) |
| **TBT** | Total Blocking Time (milliseconds) |
| **CLS** | Cumulative Layout Shift |
| **SI** | Speed Index (seconds) |
| **TTI** | Time to Interactive (seconds) |

### Asset Metrics
| Metric | Description |
|--------|-------------|
| **Blocking JS #** | Number of render-blocking JavaScript files |
| **Blocking JS (KB)** | Total size of render-blocking JavaScript (KB) |
| **JS #** | Total number of JavaScript requests |
| **JS (KB)** | Total JavaScript transfer size (KB) |
| **CSS #** | Total number of CSS requests |
| **CSS (KB)** | Total CSS transfer size (KB) |
| **Fonts #** | Total number of font requests |
| **Fonts (KB)** | Total fonts transfer size (KB) |
| **Media #** | Total number of image and media requests |
| **Media (KB)** | Total images and media transfer size (KB) |

## How it Works
The script:
1. Loads configuration from `config.json` and `pages.json`
2. Launches a headless Chrome browser via Puppeteer
3. Logs in with the configured credentials
4. Sequentially visits each configured page
5. For each page, runs a Lighthouse "navigation flow" for the configured number of runs
6. Calculates averages and generates a detailed Markdown report
