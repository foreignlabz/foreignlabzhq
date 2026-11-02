/* eslint-disable @typescript-eslint/no-require-imports -- Standalone production-build Playwright verification. */
// Invoked by verify-staging.mjs. Credentials stay in memory and never enter evidence.
const {chromium, request} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.HQ_QA_BASE_URL || 'http://127.0.0.1:3001';
const ORIGIN = new URL(BASE).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname), 'Staging verification must use loopback');
const username = process.env.HQ_QA_USERNAME;
const password = process.env.HQ_QA_PASSWORD;
if (!username || !password) throw new Error('HQ_QA_USERNAME and HQ_QA_PASSWORD are required; use the staging verifier orchestrator.');
const REPORT = path.join(ROOT, 'docs/staging-browser-results.json');
const EVIDENCE = path.join(ROOT, 'docs/evidence');
const screenshots = [];
const results = [];
let browser;
let anonymousAPI;
let privateAPI;
let assertions = 0;
const check = (value, message) => {assertions++; assert.ok(value, message);};
const equal = (actual, expected, message) => {assertions++; assert.deepEqual(actual, expected, message);};
async function capture(page, label) {
  await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {image.onload = resolve; image.onerror = resolve;})));});
  const file = `staging-${label}.png`;
  await page.screenshot({path: path.join(EVIDENCE, file), fullPage: true, animations: 'disabled'});
  screenshots.push(`docs/evidence/${file}`);
}
function safeError(error) {
  // Playwright normally redacts authentication; additionally prevent credential text
  // from reaching logs should a transport/tooling error include request options.
  return String(error?.message || error).split('Basic '+Buffer.from(`${username}:${password}`).toString('base64')).join('[REDACTED]').split(password).join('[REDACTED]').split(username).join('[REDACTED]');
}
function verifyHeaders(headers) {
  equal(headers['x-hq-data-mode'], 'synthetic-demo', 'Response identifies synthetic staging mode');
  check(/private/i.test(headers['cache-control'] || '') && /no-store/i.test(headers['cache-control'] || ''), 'Authenticated staging responses are private and noncacheable');
  const csp = headers['content-security-policy'] || '';
  check(/(?:^|;)\s*connect-src\s+'self'\s*(?:;|$)/.test(csp), 'CSP limits connections to this origin');
  check(/(?:^|;)\s*img-src\s+'self'\s+data:\s+blob:\s*(?:;|$)/.test(csp), 'CSP permits only local/data/blob images');
  check(/(?:^|;)\s*media-src\s+'self'\s+data:\s+blob:\s*(?:;|$)/.test(csp), 'CSP permits only local/data/blob media');
  check(/(?:^|;)\s*form-action\s+'self'\s*(?:;|$)/.test(csp), 'CSP blocks external form destinations');
}
async function assertLogin(page) {
  await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor();
  check(await page.getByRole('button', {name: 'Continue with Google', exact: true}).isDisabled(), 'Staging Google provider is disabled');
  check(await page.getByRole('button', {name: 'Continue with ChatGPT Unavailable', exact: true}).isDisabled(), 'Staging ChatGPT provider is disabled');
  check(await page.getByRole('link', {name: 'Explore demo workspace', exact: true}).isVisible(), 'Login has an explicit demo navigation link');
  equal(await page.locator('input[type=password],input[type=email]').count(), 0, 'Staging app does not collect identity credentials');
}
async function assertFits(page, label) {
  const box = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth}));
  check(box.scrollWidth <= box.width + 1, `${label} has no page-wide horizontal overflow`);
}
async function saveReport() {
  await fs.writeFile(REPORT, JSON.stringify({executedAt: new Date().toISOString(), baseUrl: BASE, build: 'Next.js production build, started by verify-staging.mjs with staging enabled and Drive flag deliberately true', browser: browser ? await browser.version() : null, dataMode: 'Synthetic demo; original screenshot paths must serve generated SVG artwork; live integrations blocked at proxy', credentials: 'Ephemeral credentials supplied only through environment; never written to evidence', assertions, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, scenarios: results, screenshots, limitations: ['Loopback production-build verification does not establish a hosted deployment or public URL.', 'Google OAuth, live Supabase data, and Google Drive are intentionally disabled in staging.', 'Mobile viewport emulation is not physical iPhone/Safari verification.']}, null, 2) + '\n');
}
async function scenario(name, run, options = {}) {
  const start = Date.now(); const before = assertions;
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, httpCredentials: {username, password, origin: ORIGIN}, ...options});
  const blockedExternal = []; const browserErrors = []; const apiAttempts = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (url.origin !== ORIGIN) {blockedExternal.push({origin: url.origin, pathname: url.pathname}); return route.abort('blockedbyclient');}
    if (url.pathname.startsWith('/api/')) apiAttempts.push({method: route.request().method(), pathname: url.pathname});
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => browserErrors.push(safeError(error)));
  let status = 'passed', error = null;
  try {
    await run(page, context);
    equal(blockedExternal, [], 'No external network requests from staging UI');
    equal(browserErrors, [], 'No uncaught browser errors');
    equal(apiAttempts, [], 'Staging browser pages do not initiate live API calls');
  } catch (failure) {
    status = 'failed'; error = safeError(failure); console.error(`FAIL ${name}: ${error}`);
    await capture(page, `failure-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).catch(() => {});
  } finally {await context.close();}
  results.push({name, status, assertions: assertions - before, durationMs: Date.now() - start, blockedExternalRequests: blockedExternal, browserErrors, liveApiAttempts: apiAttempts, error});
  await saveReport(); console.log(`${status.toUpperCase()} ${name}`);
}

(async () => {
  await fs.mkdir(EVIDENCE, {recursive: true});
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  anonymousAPI = await request.newContext({baseURL: BASE});
  privateAPI = await request.newContext({baseURL: BASE, httpCredentials: {username, password, origin: ORIGIN, send: 'always'}});

  await scenario('Anonymous pages, media, app shell, and APIs require authentication', async () => {
    for (const url of ['/', '/preview/', '/feed-preview/', '/login-preview/', '/auth/callback/?code=staging-fixture', '/feed/4eignlabz/01.jpg', '/staging-art/01.svg', '/hq-icon.svg', '/manifest.webmanifest', '/sw.js', '/api/drive/']) {
      const response = await anonymousAPI.get(url, {maxRedirects: 0});
      equal(response.status(), 401, `Anonymous ${url.split('?')[0]} is denied`);
      check(/^Basic /i.test(response.headers()['www-authenticate'] || ''), 'Denied request advertises private-preview authentication');
      check(/no-store/i.test(response.headers()['cache-control'] || ''), 'Denied response is noncacheable');
      check(!(await response.text()).includes('Inside the lab.'), 'Denied response contains no content fixtures');
    }
  });

  await scenario('Incorrect preview credentials do not grant access', async () => {
    const invalid = await request.newContext({baseURL: BASE, httpCredentials: {username: `${username}-invalid`, password: 'invalid-staging-test-password', origin: ORIGIN, send: 'always'}});
    try {equal((await invalid.get('/preview/', {maxRedirects: 0})).status(), 401, 'Incorrect credentials remain denied');}
    finally {await invalid.dispose();}
  });

  await scenario('Authenticated root and auth callbacks render design-only login', async page => {
    for (const route of ['/', '/auth/callback/?code=staging-unusable-code', '/auth/callback/?error=access_denied', '/auth/']) {
      const response = await page.goto(`${BASE}${route}`);
      equal(response.status(), 200, 'Authenticated staging entry is available'); verifyHeaders(response.headers());
      await assertLogin(page);
      equal(new URL(page.url()).pathname, new URL(`${BASE}${route}`).pathname, 'Auth entry is internally rewritten rather than redirected to a provider');
      equal(await page.locator('.hq3-calendar').count(), 0, 'Staging auth route does not mount authenticated workspace');
    }
    equal(await page.evaluate(() => Object.keys(localStorage).filter(key => /^sb-.*-auth-token/.test(key)).length), 0, 'Design-only login does not create a Supabase session');
    const review = page.getByRole('navigation', {name: 'Review screens', exact: true});
    check(await review.isVisible(), 'Staging review navigation is present');
    for (const name of ['Login', 'Calendar', 'Feed Preview']) check(await review.getByRole('link', {name, exact: true}).isVisible(), `${name} review link is available`);
  });

  await scenario('Original feed paths serve synthetic SVGs behind access control', async () => {
    for (let index = 1; index <= 12; index++) {
      const response = await privateAPI.get(`/feed/4eignlabz/${String(index).padStart(2, '0')}.jpg`);
      equal(response.status(), 200, 'Rewritten feed asset is available to reviewer');
      check(/image\/svg\+xml/i.test(response.headers()['content-type'] || ''), 'Original JPEG path serves SVG content');
      const body = await response.text();
      check(body.includes('SYNTHETIC DEMO / NO LIVE CONTENT'), 'Every image carries synthetic provenance');
      check(body.startsWith('<svg') && !/<image\b|data:image|https?:\/\/(?!www\.w3\.org)/i.test(body), 'Synthetic SVG does not embed original or external imagery');
      verifyHeaders(response.headers());
    }
    equal((await privateAPI.get('/feed/unknown-private-original.jpg', {maxRedirects: 0})).status(), 404, 'Unknown original asset path is not exposed');
  });

  await scenario('Staging proxy blocks every tested API even with Drive enabled', async () => {
    const requests = [
      {method: 'GET', url: '/api/drive/'},
      {method: 'POST', url: '/api/drive/uploads/', data: {name: 'qa-synthetic.jpg', mimeType: 'image/jpeg', size: 1024}},
      {method: 'PUT', url: '/api/drive/uploads/00000000-0000-4000-8000-000000000001/', data: 'blocked synthetic bytes'},
      {method: 'GET', url: '/api/drive/files/00000000-0000-4000-8000-000000000001/'},
      {method: 'POST', url: '/api/drive/associations/', data: {assetId: 'not-real', postId: 'not-real'}},
      {method: 'DELETE', url: '/api/drive/associations/', data: {assetId: 'not-real', postId: 'not-real'}},
      {method: 'GET', url: '/api/anything-else/'},
    ];
    for (const item of requests) {
      const response = await privateAPI.fetch(item.url, {method: item.method, data: item.data, maxRedirects: 0});
      equal(response.status(), 404, `${item.method} ${item.url} is blocked at proxy`);
      check((await response.text()).includes('Live integrations are disabled'), 'API response is the staging proxy guard');
      verifyHeaders(response.headers());
    }
  });

  for (const device of [{name: 'desktop', width: 1440, height: 1000}, {name: 'mobile', width: 390, height: 844}]) {
    await scenario(`Production-build review flow ${device.name}`, async page => {
      let response = await page.goto(`${BASE}/`); equal(response.status(), 200, 'Authenticated production-build page responds'); verifyHeaders(response.headers());
      await assertLogin(page); await assertFits(page, 'Login'); await capture(page, `login-${device.name}`);
      await page.getByRole('link', {name: 'Explore demo workspace', exact: true}).click(); await page.waitForURL(url => url.pathname === '/preview/');
      await page.getByRole('heading', {name: 'A little more clarity.', exact: true}).waitFor();
      check(await page.getByText('Demo workspace', {exact: true}).isVisible(), 'Calendar is explicitly a demo');
      equal(await page.getByRole('button', {name: 'Week', exact: true}).getAttribute('aria-pressed'), 'true', 'Week is the default staging calendar');
      const review = page.getByRole('navigation', {name: 'Review screens', exact: true});
      check(await review.isVisible(), 'Review navigation remains available in workspace');
      for (const view of ['Week', 'Today', 'Month']) {
        await page.getByRole('group', {name: 'Calendar view', exact: true}).getByRole('button', {name: view, exact: true}).click();
        equal(await page.getByRole('group', {name: 'Calendar view', exact: true}).getByRole('button', {name: view, exact: true}).getAttribute('aria-pressed'), 'true', `${view} view is selected`);
        equal(await page.locator('.hq3-day').count(), view === 'Week' ? 7 : view === 'Today' ? 1 : 42, `${view} has expected date cells`);
        await assertFits(page, view); await capture(page, `${view.toLowerCase()}-${device.name}`);
      }
      await review.getByRole('link', {name: 'Feed Preview', exact: true}).click(); await page.waitForURL(url => url.pathname === '/feed-preview/');
      await page.getByRole('heading', {name: 'See the bigger picture.', exact: true}).waitFor();
      equal(await page.getByRole('button', {name: 'Future Feed', exact: true}).getAttribute('aria-pressed'), 'true', 'Feed preview opens in future mode');
      equal(await page.locator('.hq-feed-tile').count(), 15, 'Future feed contains three plans and twelve synthetic references');
      await assertFits(page, 'Future Feed'); await capture(page, `feed-future-${device.name}`);
      await page.getByRole('button', {name: 'Current Feed', exact: true}).click(); equal(await page.locator('.hq-feed-tile').count(), 12, 'Current feed contains twelve synthetic references');
      equal(await page.locator('.hq-feed-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 3, 'Feed retains three columns');
      await assertFits(page, 'Current Feed'); await capture(page, `feed-current-${device.name}`);
      await page.getByRole('combobox', {name: 'YOUR ACCOUNT', exact: true}).selectOption('@dragonballhuntpr'); equal(await page.locator('.hq-feed-tile').count(), 0, 'No invented current grid for the second account');
      await page.getByRole('button', {name: 'Future Feed', exact: true}).click(); equal(await page.locator('.hq-feed-tile').count(), 1, 'Collaborative plan appears in second account');
      await review.getByRole('link', {name: 'Login', exact: true}).click(); await assertLogin(page);
      const bundle = await page.locator('script[src*="/_next/static/"]').first().getAttribute('src');
      check(Boolean(bundle), 'Production JS bundle is present');
      equal((await anonymousAPI.get(new URL(bundle, BASE).href, {maxRedirects: 0})).status(), 401, 'Actual production JS bundle is protected from anonymous access');
      response = await privateAPI.get('/manifest.webmanifest'); equal(response.status(), 200, 'Authenticated app-shell manifest remains available'); verifyHeaders(response.headers());
      equal(await page.evaluate(() => Object.keys(localStorage).filter(key => /^sb-.*-auth-token/.test(key)).length), 0, 'Reviewing synthetic screens never creates a live auth session');
    }, {viewport: {width: device.width, height: device.height}, isMobile: device.width < 500, hasTouch: device.width < 500});
  }

  await saveReport(); await anonymousAPI.dispose(); await privateAPI.dispose(); await browser.close();
  console.log(JSON.stringify({passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, assertions, screenshots: screenshots.length}));
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
})().catch(async error => {console.error(safeError(error)); await saveReport(); await anonymousAPI?.dispose(); await privateAPI?.dispose(); await browser?.close(); process.exitCode = 1;});
