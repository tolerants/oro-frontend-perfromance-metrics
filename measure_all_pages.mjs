import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory of current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration files
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const pagesConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));

// Build full URLs from base URL and paths
const pages = pagesConfig.map(p => ({
    name: p.name,
    url: `${config.baseUrl}${p.path}`
}));

const RUNS = config.runs || 5;

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--ignore-certificate-errors', '--no-sandbox']
    });
    const page = await browser.newPage();

    console.log('Navigating to login page...');
    await page.goto(`${config.baseUrl}${config.loginPath}`);

    console.log('Entering credentials...');
    await page.type('#userNameSignIn', config.credentials.username);
    await page.type('#passwordSignIn', config.credentials.password);

    console.log('Submitting form...');
    await Promise.all([
        page.waitForNavigation(),
        page.click('form#form-login button[type="submit"]')
    ]);
    console.log('Login complete.');

    const allResults = {}; // { pageName: [ {FCP, LCP...} ] }

    for (const p of pages) {
        console.log(`\nStarting measurements for: ${p.name} (${p.url})`);
        allResults[p.name] = [];

        for (let i = 1; i <= RUNS; i++) {
            console.log(`  Run ${i}/${RUNS}...`);
            try {
                // We create a new flow for each navigation to verify it in isolation
                // Using the same page context to keep session
                const flow = await startFlow(page, {
                    name: `${p.name} - Run ${i}`,
                    configContext: {
                        settingsOnlyCategories: ['performance'],
                    }
                });

                await flow.navigate(p.url);

                const result = await flow.createFlowResult();
                const audit = result.steps[0].lhr.audits;
                const categories = result.steps[0].lhr.categories;

                // Calculate Blocking JS
                const blockingResources = audit['render-blocking-resources']?.details?.items || [];
                const blockingJsItems = blockingResources.filter(item => item.url && item.url.includes('.js'));
                const blockingJsCount = blockingJsItems.length;
                const blockingJsSize = blockingJsItems.reduce((acc, item) => acc + (item.totalBytes || 0), 0) / 1024; // KB

                // Get resource summary for all resource types
                const resourceSummary = audit['resource-summary']?.details?.items || [];

                // Calculate Total JS
                const scriptResource = resourceSummary.find(r => r.resourceType === 'script') || { requestCount: 0, transferSize: 0 };
                const totalJsCount = scriptResource.requestCount;
                const totalJsSize = (scriptResource.transferSize || 0) / 1024; // KB

                // Calculate Total CSS
                const stylesheetResource = resourceSummary.find(r => r.resourceType === 'stylesheet') || { requestCount: 0, transferSize: 0 };
                const totalCssCount = stylesheetResource.requestCount;
                const totalCssSize = (stylesheetResource.transferSize || 0) / 1024; // KB

                // Calculate Total Fonts
                const fontResource = resourceSummary.find(r => r.resourceType === 'font') || { requestCount: 0, transferSize: 0 };
                const totalFontCount = fontResource.requestCount;
                const totalFontSize = (fontResource.transferSize || 0) / 1024; // KB

                // Calculate Total Media (images + media)
                const imageResource = resourceSummary.find(r => r.resourceType === 'image') || { requestCount: 0, transferSize: 0 };
                const mediaResource = resourceSummary.find(r => r.resourceType === 'media') || { requestCount: 0, transferSize: 0 };
                const totalMediaCount = imageResource.requestCount + mediaResource.requestCount;
                const totalMediaSize = ((imageResource.transferSize || 0) + (mediaResource.transferSize || 0)) / 1024; // KB

                const metrics = {
                    FCP: parseFloat(audit['first-contentful-paint'].numericValue / 1000), // seconds
                    LCP: parseFloat(audit['largest-contentful-paint'].numericValue / 1000), // seconds
                    TBT: parseFloat(audit['total-blocking-time'].numericValue), // ms
                    CLS: parseFloat(audit['cumulative-layout-shift'].numericValue), // unitless
                    SI: parseFloat(audit['speed-index'].numericValue / 1000), // seconds
                    Score: categories['performance'].score * 100,
                    TTI: parseFloat(audit['interactive'].numericValue / 1000), // seconds
                    BlockingJSCount: blockingJsCount,
                    BlockingJSSize: blockingJsSize,
                    TotalJSCount: totalJsCount,
                    TotalJSSize: totalJsSize,
                    TotalCSSCount: totalCssCount,
                    TotalCSSSize: totalCssSize,
                    TotalFontCount: totalFontCount,
                    TotalFontSize: totalFontSize,
                    TotalMediaCount: totalMediaCount,
                    TotalMediaSize: totalMediaSize
                };

                allResults[p.name].push(metrics);
                console.log(`    -> LCP: ${metrics.LCP.toFixed(2)}s | Score: ${metrics.Score.toFixed(0)}`);

            } catch (e) {
                console.error(`    Error in run ${i}:`, e.message);
            }
        }
    }

    await browser.close();

    generateReport(allResults);
}

function generateReport(results) {
    let md = '# Performance Report\n\n';
    let summaryData = [];

    for (const [pageName, runs] of Object.entries(results)) {
        if (runs.length === 0) continue;

        md += `## ${pageName}\n\n`;
        md += `| Run | Score | FCP (s) | LCP (s) | TBT (ms) | CLS | SI (s) | TTI (s) | Blocking JS # | Blocking JS (KB) | JS # | JS (KB) | CSS # | CSS (KB) | Fonts # | Fonts (KB) | Media # | Media (KB) |\n`;
        md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

        let sumFCP = 0, sumLCP = 0, sumTBT = 0, sumCLS = 0, sumSI = 0, sumScore = 0, sumTTI = 0;
        let sumBlockingJSSize = 0, sumTotalJSSize = 0, sumBlockingJSCount = 0, sumTotalJSCount = 0;
        let sumTotalCSSSize = 0, sumTotalCSSCount = 0;
        let sumTotalFontSize = 0, sumTotalFontCount = 0;
        let sumTotalMediaSize = 0, sumTotalMediaCount = 0;

        runs.forEach((r, idx) => {
            md += `| ${idx + 1} | ${r.Score.toFixed(0)} | ${r.FCP.toFixed(2)} | ${r.LCP.toFixed(2)} | ${r.TBT.toFixed(0)} | ${r.CLS.toFixed(3)} | ${r.SI.toFixed(2)} | ${r.TTI.toFixed(2)} | ${r.BlockingJSCount} | ${r.BlockingJSSize.toFixed(1)} | ${r.TotalJSCount} | ${r.TotalJSSize.toFixed(1)} | ${r.TotalCSSCount} | ${r.TotalCSSSize.toFixed(1)} | ${r.TotalFontCount} | ${r.TotalFontSize.toFixed(1)} | ${r.TotalMediaCount} | ${r.TotalMediaSize.toFixed(1)} |\n`;

            sumFCP += r.FCP;
            sumLCP += r.LCP;
            sumTBT += r.TBT;
            sumCLS += r.CLS;
            sumSI += r.SI;
            sumScore += r.Score;
            sumTTI += r.TTI;
            sumBlockingJSSize += r.BlockingJSSize;
            sumTotalJSSize += r.TotalJSSize;
            sumBlockingJSCount += r.BlockingJSCount;
            sumTotalJSCount += r.TotalJSCount;
            sumTotalCSSSize += r.TotalCSSSize;
            sumTotalCSSCount += r.TotalCSSCount;
            sumTotalFontSize += r.TotalFontSize;
            sumTotalFontCount += r.TotalFontCount;
            sumTotalMediaSize += r.TotalMediaSize;
            sumTotalMediaCount += r.TotalMediaCount;
        });

        const avg = {
            FCP: sumFCP / runs.length,
            LCP: sumLCP / runs.length,
            TBT: sumTBT / runs.length,
            CLS: sumCLS / runs.length,
            SI: sumSI / runs.length,
            Score: sumScore / runs.length,
            TTI: sumTTI / runs.length,
            BlockingJSSize: sumBlockingJSSize / runs.length,
            TotalJSSize: sumTotalJSSize / runs.length,
            BlockingJSCount: Math.round(sumBlockingJSCount / runs.length),
            TotalJSCount: Math.round(sumTotalJSCount / runs.length),
            TotalCSSSize: sumTotalCSSSize / runs.length,
            TotalCSSCount: Math.round(sumTotalCSSCount / runs.length),
            TotalFontSize: sumTotalFontSize / runs.length,
            TotalFontCount: Math.round(sumTotalFontCount / runs.length),
            TotalMediaSize: sumTotalMediaSize / runs.length,
            TotalMediaCount: Math.round(sumTotalMediaCount / runs.length)
        };

        md += `| **Average** | **${avg.Score.toFixed(0)}** | **${avg.FCP.toFixed(2)}** | **${avg.LCP.toFixed(2)}** | **${avg.TBT.toFixed(0)}** | **${avg.CLS.toFixed(3)}** | **${avg.SI.toFixed(2)}** | **${avg.TTI.toFixed(2)}** | **${avg.BlockingJSCount}** | **${avg.BlockingJSSize.toFixed(1)}** | **${avg.TotalJSCount}** | **${avg.TotalJSSize.toFixed(1)}** | **${avg.TotalCSSCount}** | **${avg.TotalCSSSize.toFixed(1)}** | **${avg.TotalFontCount}** | **${avg.TotalFontSize.toFixed(1)}** | **${avg.TotalMediaCount}** | **${avg.TotalMediaSize.toFixed(1)}** |\n\n`;

        summaryData.push({ name: pageName, ...avg });
    }

    md += `## Summary (Averages)\n\n`;
    md += `| Page | Score | FCP (s) | LCP (s) | TBT (ms) | CLS | SI (s) | TTI (s) | Blocking JS # | Blocking JS (KB) | JS # | JS (KB) | CSS # | CSS (KB) | Fonts # | Fonts (KB) | Media # | Media (KB) |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

    summaryData.forEach(d => {
        md += `| ${d.name} | ${d.Score.toFixed(0)} | ${d.FCP.toFixed(2)} | ${d.LCP.toFixed(2)} | ${d.TBT.toFixed(0)} | ${d.CLS.toFixed(3)} | ${d.SI.toFixed(2)} | ${d.TTI.toFixed(2)} | ${d.BlockingJSCount} | ${d.BlockingJSSize.toFixed(1)} | ${d.TotalJSCount} | ${d.TotalJSSize.toFixed(1)} | ${d.TotalCSSCount} | ${d.TotalCSSSize.toFixed(1)} | ${d.TotalFontCount} | ${d.TotalFontSize.toFixed(1)} | ${d.TotalMediaCount} | ${d.TotalMediaSize.toFixed(1)} |\n`;
    });

    const outputFilename = process.argv[2] || config.outputFilename || 'performance_report.md';
    fs.writeFileSync(outputFilename, md);
    console.log(`Report saved to ${outputFilename}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
