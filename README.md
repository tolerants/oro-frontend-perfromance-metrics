# Performance Measurement Tool

This tool automates Lighthouse performance audits for multiple pages on `https://127.0.0.1:8000/`. It performs 5 runs per page to provide reliable averages.

## Prerequisites
- Node.js (v18+)
- Local server running at `https://127.0.0.1:8000/`

## Installation
Run the following command in the project directory to install dependencies:
```bash
npm install
```

## Usage
To run the standard performance audit and save results to the default file (`performance_report.md`):
```bash
node measure_all_pages.mjs
```

To specify a custom output filename:
```bash
node measure_all_pages.mjs my_report.md
```

## Metrics Captured
- **Score**: Lighthouse Performance score (0-100).
- **FCP**: First Contentful Paint (seconds).
- **LCP**: Largest Contentful Paint (seconds).
- **TBT**: Total Blocking Time (milliseconds).
- **CLS**: Cumulative Layout Shift.
- **SI**: Speed Index (seconds).
- **TTI**: Time to Interactive (seconds).
- **Blocking JS**: Number of render-blocking JS files and their total size (KB).
- **Total JS**: Total number of JavaScript requests and their transfer size (KB).

## How it works
The script:
1. Launches a headless Chrome browser via Puppeteer.
2. Logins with the user `AmandaRCole@example.org`.
3. Sequentially visits 6 key pages:
   - Homepage
   - Product Listing
   - Product Details
   - Shopping List
   - Checkout
   - User Dashboard
4. For each page, it runs a Lighthouse "navigation flow" 5 times.
5. Calculates averages and generates a detailed Markdown report.
