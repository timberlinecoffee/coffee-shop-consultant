// TIM-3281: live transactional sends to trent@simpler.coffee + Resend
// delivery verification + inbox-equivalent PNG render via Playwright.
//
// Run from repo root with RESEND_API_KEY in env:
//   npx tsx scripts/tim3281-live-trent-inbox.mjs
//
// Outputs:
//   /tmp/tim3281-artifacts/<template>.png   — inbox-equivalent render
//   /tmp/tim3281-artifacts/manifest.json    — send IDs + last_event + voice-check

import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

import { sendVerifyEmail } from '../src/lib/email/templates/verify-email.tsx';
import { sendWelcomeEmail } from '../src/lib/email/templates/welcome.tsx';
import { sendCreditBalanceLowEmail } from '../src/lib/email/templates/credit-balance-low.tsx';
import { sendBusinessPlanExportReadyEmail } from '../src/lib/email/templates/business-plan-export-ready.tsx';
import { sendDeepResearchCompleteEmail } from '../src/lib/email/templates/deep-research-complete.tsx';
import { sendSupportTicketReceivedEmail } from '../src/lib/email/templates/support-ticket-received.tsx';
import { sendSupportTicketRepliedEmail } from '../src/lib/email/templates/support-ticket-replied.tsx';

const TO = 'trent@simpler.coffee';
const USER = 'tim3281-cto-live-trent';
const ART = '/tmp/tim3281-artifacts';
const RESEND_KEY = process.env.RESEND_API_KEY;
if (!RESEND_KEY) { console.error('RESEND_API_KEY missing'); process.exit(2); }

// Voice mandate per TIM-1537 / TIM-3278
const FORBIDDEN_PHRASES = [
  ' — ', ' – ',                          // em/en dash
  'leverage', 'unlock', 'elevate', 'embark', 'delve',
];
function voiceCheck(html, subject) {
  const text = (subject + ' ' + html.replace(/<[^>]+>/g, ' ')).toLowerCase();
  const hits = FORBIDDEN_PHRASES.filter((p) => text.includes(p.toLowerCase()));
  return { ok: hits.length === 0, hits };
}

const SENDS = [
  {
    name: 'verify-email',
    flow: 'Flow 1 step 2',
    fn: () => sendVerifyEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      verifyUrl: 'https://groundwork.cafe/auth/confirm?token=tim3281-demo-verify',
    }}),
  },
  {
    name: 'welcome',
    flow: 'Flow 1 step 4',
    fn: () => sendWelcomeEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      dashboardUrl: 'https://groundwork.cafe/workspace',
    }}),
  },
  {
    name: 'credit-balance-low',
    flow: 'Flow 5 step 18',
    fn: () => sendCreditBalanceLowEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      currentBalance: 7,
      buyMoreUrl: 'https://groundwork.cafe/billing/credits',
    }}),
  },
  {
    name: 'business-plan-export-ready',
    flow: 'Flow 5 step 16',
    fn: () => sendBusinessPlanExportReadyEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      planTitle: 'Simpler Coffee — Launch Plan',
      exportUrl: 'https://groundwork.cafe/exports/business-plan/tim3281-demo.pdf',
      expiresAtIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      sizeKb: 482,
    }}),
  },
  {
    name: 'deep-research-complete',
    flow: 'Flow 5 step 17',
    fn: () => sendDeepResearchCompleteEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      topic: 'Specialty coffee shop demand in Boulder, CO',
      reportUrl: 'https://groundwork.cafe/research/tim3281-demo-report',
      sourceCount: 47,
    }}),
  },
  {
    name: 'support-ticket-received',
    flow: 'Flow 6 step 19',
    fn: () => sendSupportTicketReceivedEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      ticketId: 'GW-TIM3281-001',
      subjectLine: 'Live E2E pass — please ignore (TIM-3281)',
    }}),
  },
  {
    name: 'support-ticket-replied',
    flow: 'Flow 6 step 20',
    fn: () => sendSupportTicketRepliedEmail({ to: TO, userId: USER, props: {
      firstName: 'Trent',
      ticketId: 'GW-TIM3281-001',
      subjectLine: 'Live E2E pass — please ignore (TIM-3281)',
      threadUrl: 'https://groundwork.cafe/support/tickets/GW-TIM3281-001',
      replySnippet: 'Thanks for the report. This is the CTO live-E2E rig posting to your inbox to verify the support-replied template renders correctly.',
      agentName: 'Jess',
    }}),
  },
];

async function getResend(id) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.resend.com/emails/${id}`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (r.ok) return await r.json();
    if (r.status === 404 && attempt < 5) { await new Promise(res => setTimeout(res, 1500)); continue; }
    return { error: `HTTP ${r.status}`, body: await r.text() };
  }
  return { error: 'gave up after 6 attempts' };
}

const results = [];
for (const { name, flow, fn } of SENDS) {
  process.stdout.write(`${name.padEnd(30)} `);
  try {
    const res = await fn();
    if (!res.ok) {
      results.push({ name, flow, ok: false, error: res });
      console.log(`FAIL ${JSON.stringify(res)}`);
      continue;
    }
    results.push({ name, flow, ok: true, send_id: res.id });
    console.log(`SENT id=${res.id}`);
  } catch (e) {
    results.push({ name, flow, ok: false, threw: String(e).slice(0, 300) });
    console.log(`THREW ${String(e).slice(0, 200)}`);
  }
}

// Wait a few seconds for Resend to register, then poll each id for delivery
await new Promise(r => setTimeout(r, 4000));

console.log('\n--- polling Resend for delivery ---');
for (const r of results) {
  if (!r.ok) continue;
  const info = await getResend(r.send_id);
  r.subject = info?.subject;
  r.last_event = info?.last_event;
  r.created_at = info?.created_at;
  r.html_excerpt = (info?.html ?? '').slice(0, 200);
  r.html_full = info?.html;
  r.voice = voiceCheck(info?.html ?? '', info?.subject ?? '');
  console.log(`${r.name.padEnd(30)} last_event=${r.last_event} voice_ok=${r.voice.ok} ${r.voice.hits.length ? 'HITS=' + r.voice.hits.join(',') : ''}`);
}

console.log('\n--- rendering inbox-equivalent PNGs via Playwright ---');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });
for (const r of results) {
  if (!r.ok || !r.html_full) continue;
  // Wrap in inbox-style chrome: from/subject header above the HTML
  const inboxHtml = `<!doctype html><html><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f3ef">
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:16px 24px">
      <div style="font-size:13px;color:#6b7280">From</div>
      <div style="font-size:15px;font-weight:600">Groundwork &lt;noreply@groundwork.cafe&gt;</div>
      <div style="font-size:13px;color:#6b7280;margin-top:8px">To</div>
      <div style="font-size:15px">${TO}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:8px">Subject</div>
      <div style="font-size:17px;font-weight:600">${(r.subject ?? '(no subject)').replace(/</g,'&lt;')}</div>
    </div>
    ${r.html_full}
  </body></html>`;
  await page.setContent(inboxHtml, { waitUntil: 'networkidle' });
  const outPath = `${ART}/${r.name}.png`;
  await page.screenshot({ path: outPath, fullPage: true });
  r.png = outPath;
  delete r.html_full; delete r.html_excerpt;
  console.log(`${r.name.padEnd(30)} render=${outPath}`);
}
await browser.close();

const manifest = {
  to: TO,
  ranAt: new Date().toISOString(),
  results,
};
writeFileSync(`${ART}/manifest.json`, JSON.stringify(manifest, null, 2));

const okCount = results.filter(r => r.ok && r.last_event === 'delivered').length;
const failCount = results.filter(r => !r.ok).length;
const pendingCount = results.filter(r => r.ok && r.last_event !== 'delivered').length;
const voiceFailCount = results.filter(r => r.voice && !r.voice.ok).length;
console.log(`\n=== SUMMARY ===`);
console.log(`Total: ${results.length} | Delivered: ${okCount} | Send fail: ${failCount} | Not-yet-delivered: ${pendingCount} | Voice fails: ${voiceFailCount}`);
process.exit(failCount > 0 ? 1 : 0);
