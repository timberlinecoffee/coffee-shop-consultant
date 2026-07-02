import { chromium } from 'playwright';

const URL = 'https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xVFhqNnFDendjaUlMMGhuKKHu_NEGMgZ2JXqwOwE6LBboRzMhyy89HTgTniJT0itMFSnefwhdyvMeox0Tjxq44p9sGNc6hgW0QG5Y';
const OUT = '/tmp/tim3281-artifacts/stripe-receipt.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('saved', OUT);
