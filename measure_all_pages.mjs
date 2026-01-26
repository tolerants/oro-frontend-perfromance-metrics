import puppeteer from 'puppeteer';
import { startFlow } from 'lighthouse';
import fs from 'fs';

const pages = [
    { name: 'Homepage', url: 'https://127.0.0.1:8000/' },
    { name: 'Product Listing', url: 'https://127.0.0.1:8000/navigation-root/products/by-category/industrial' },
    { name: 'Product Details', url: 'https://127.0.0.1:8000/90-watt-bright-white-led-light-bulb' },
    { name: 'Shopping List', url: 'https://127.0.0.1:8000/customer/shoppinglist/update/3' },
    { name: 'Checkout', url: 'https://127.0.0.1:8000/customer/checkout/1' },
    { name: 'User Dashboard', url: 'https://127.0.0.1:8000/customer/user/dashboard/' }
];

const RUNS = 5;

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--ignore-certificate-errors', '--no-sandbox']
    });
    const page = await browser.newPage();

    console.log('Navigating to login page...');
    await page.goto('https://127.0.0.1:8000/customer/user/login');

    console.log('Entering credentials...');
    await page.type('#userNameSignIn', 'AmandaRCole@example.org');
    await page.type('#passwordSignIn', 'AmandaRCole@example.org');

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

                // Calculate Total JS
                const resourceSummary = audit['resource-summary']?.details?.items || [];
                const scriptResource = resourceSummary.find(r => r.resourceType === 'script') || { requestCount: 0, transferSize: 0 };
                const totalJsCount = scriptResource.requestCount;
                const totalJsSize = (scriptResource.transferSize || 0) / 1024; // KB

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
                    TotalJSSize: totalJsSize
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
        md += `| Run | Score | FCP (s) | LCP (s) | TBT (ms) | CLS | SI (s) | TTI (s) | Blocking JS (KB) | Total JS (KB) |\n`;
        md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

        let sumFCP = 0, sumLCP = 0, sumTBT = 0, sumCLS = 0, sumSI = 0, sumScore = 0, sumTTI = 0, sumBlockingJSSize = 0, sumTotalJSSize = 0, sumBlockingJSCount = 0, sumTotalJSCount = 0;

        runs.forEach((r, idx) => {
            const blockingStr = `${r.BlockingJSCount} / ${r.BlockingJSSize.toFixed(1)}`;
            const totalStr = `${r.TotalJSCount} / ${r.TotalJSSize.toFixed(1)}`;

            md += `| ${idx + 1} | ${r.Score.toFixed(0)} | ${r.FCP.toFixed(2)} | ${r.LCP.toFixed(2)} | ${r.TBT.toFixed(0)} | ${r.CLS.toFixed(3)} | ${r.SI.toFixed(2)} | ${r.TTI.toFixed(2)} | ${blockingStr} | ${totalStr} |\n`;

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
            TotalJSCount: Math.round(sumTotalJSCount / runs.length)
        };

        const avgBlockingStr = `${avg.BlockingJSCount} / ${avg.BlockingJSSize.toFixed(1)}`;
        const avgTotalStr = `${avg.TotalJSCount} / ${avg.TotalJSSize.toFixed(1)}`;

        md += `| **Average** | **${avg.Score.toFixed(0)}** | **${avg.FCP.toFixed(2)}** | **${avg.LCP.toFixed(2)}** | **${avg.TBT.toFixed(0)}** | **${avg.CLS.toFixed(3)}** | **${avg.SI.toFixed(2)}** | **${avg.TTI.toFixed(2)}** | **${avgBlockingStr}** | **${avgTotalStr}** |\n\n`;

        summaryData.push({ name: pageName, ...avg });
    }

    md += `## Summary (Averages)\n\n`;
    md += `| Page | Score | FCP (s) | LCP (s) | TBT (ms) | CLS | SI (s) | TTI (s) | Blocking JS (n/KB) | Total JS (n/KB) |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

    summaryData.forEach(d => {
        const blk = `${d.BlockingJSCount} / ${d.BlockingJSSize.toFixed(1)}`;
        const tot = `${d.TotalJSCount} / ${d.TotalJSSize.toFixed(1)}`;
        md += `| ${d.name} | ${d.Score.toFixed(0)} | ${d.FCP.toFixed(2)} | ${d.LCP.toFixed(2)} | ${d.TBT.toFixed(0)} | ${d.CLS.toFixed(3)} | ${d.SI.toFixed(2)} | ${d.TTI.toFixed(2)} | ${blk} | ${tot} |\n`;
    });

    const outputFilename = process.argv[2] || 'performance_report.md';
    fs.writeFileSync(outputFilename, md);
    console.log(`Report saved to ${outputFilename}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
