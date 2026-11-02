/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CJS Playwright protocol harness. */
// Exercises the real browser Supabase SDK against intercepted HTTP fixtures.
// Never sends a request to Google/Supabase, provisions an account, or seeds auth storage.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.HQ_QA_BASE_URL || 'http://127.0.0.1:3000';
const SUPABASE = 'https://gytldbxbvnrxhsprovfm.supabase.co';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname), 'Auth QA requires loopback');
const REPORT = path.join(ROOT, 'docs/auth-browser-results.json');
const EVIDENCE = path.join(ROOT, 'docs/evidence');
const ID = {
  user: '11111111-1111-4111-8111-111111111111',
  workspace: '22222222-2222-4222-8222-222222222222',
  account: '33333333-3333-4333-8333-333333333333',
  post: '44444444-4444-4444-8444-444444444444',
  vision: '55555555-5555-4555-8555-555555555555',
};
const PRIVATE_TITLE = 'Auth QA fixture · private calendar';
const SENTINEL = 'qa-private-diagnostic-must-not-render';
let browser;
let assertions = 0;
const results = [];
const screenshots = [];
function check(value, message) { assertions++; assert.ok(value, message); }
function equal(actual, expected, message) { assertions++; assert.deepEqual(actual, expected, message); }
function base64(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function fixtureJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = `${base64({alg: 'HS256', typ: 'JWT'})}.${base64({iss: `${SUPABASE}/auth/v1`, sub: user.id, aud: 'authenticated', exp: now + 3600, iat: now, role: 'authenticated', email: user.email, aal: 'aal1', amr: [{method: 'oauth', timestamp: now}]})}`;
  // Test-only signing material is never accepted by a real service.
  return `${payload}.${crypto.createHmac('sha256', 'hq3-intercepted-http-test-only').update(payload).digest('base64url')}`;
}
function fixtureState(options = {}) {
  const now = new Date().toISOString();
  const user = {id: ID.user, aud: 'authenticated', role: 'authenticated', email: 'hq3.qa.member@example.invalid', email_confirmed_at: options.unverified ? undefined : now, confirmed_at: options.unverified ? undefined : now, phone: '', app_metadata: {provider: 'google', providers: ['google']}, user_metadata: {name: 'QA protocol fixture', email_verified: true, role: options.metadataOwner ? 'owner' : 'member'}, identities: [{id: ID.user, identity_id: ID.user, provider: 'google', user_id: ID.user, identity_data: {sub: 'fixture-google-identity', email: 'hq3.qa.member@example.invalid', email_verified: true}, created_at: now, updated_at: now}], created_at: now, updated_at: now};
  return {user, token: fixtureJwt(user), invited: options.invited !== false, role: options.role || 'owner', tokenInvalid: !!options.tokenInvalid, failMembership: !!options.failMembership, failUser: false, challenge: null, code: 'hq3-intercepted-authorization-code', requests: [], unexpected: [], protocolErrors: [], authorizeCount: 0, tokenCount: 0, userCount: 0, logoutCount: 0, pkceVerified: false, ...options};
}
function rowsFor(table, fixture, url) {
  const now = new Date().toISOString();
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const member = {workspace_id: ID.workspace, user_id: ID.user, name: 'QA verified member', role: fixture.role};
  const rows = {
    workspace_members: fixture.invited ? [member] : [],
    workspaces: [{id: ID.workspace, name: 'HQ auth protocol fixture'}],
    accounts: [{id: ID.account, workspace_id: ID.workspace, name: '4EIGNLABZ', handle: '@4eignlabz', color: '#9b86d4'}],
    content_posts: [{id: ID.post, workspace_id: ID.workspace, account_id: ID.account, account_ids: [ID.account], title: PRIVATE_TITLE, caption: 'Synthetic HTTP fixture. This is not live workspace data.', scheduled_at: `${today}T18:00:00-04:00`, responsible_id: ID.user, status: 'draft', notes: 'Protocol QA only.', media_path: null, media_type: null, media_name: null, video_url: '', created_by: ID.user, created_at: now, updated_at: now}],
    post_comments: [],
    weekly_visions: [{id: ID.vision, workspace_id: ID.workspace, week_start: url.searchParams.get('week_start')?.replace(/^eq\./, '') || today, text: 'HTTP-intercepted fixture: verified identity to Calendar.', updated_at: now}],
    content_post_progress: [{workspace_id: ID.workspace, post_id: ID.post, progress: 'in_progress', updated_by: ID.user, updated_at: now}],
  };
  return rows[table];
}
async function intercept(context, fixture) {
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (url.origin === new URL(BASE).origin) return route.continue();
    if (url.origin !== SUPABASE) {fixture.unexpected.push({method: request.method(), origin: url.origin, pathname: url.pathname}); return route.abort('blockedbyclient');}
    // Record method/path only: never retain auth headers, code, verifier, or token values.
    fixture.requests.push({method: request.method(), pathname: url.pathname});
    const cors = {'access-control-allow-origin': new URL(BASE).origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,x-supabase-api-version', 'access-control-allow-credentials': 'true'};
    const json = (body, status = 200) => route.fulfill({status, headers: {...cors, 'content-type': 'application/json'}, body: JSON.stringify(body)});
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors, body: ''});
    try {
      if (url.pathname === '/auth/v1/authorize') {
        fixture.authorizeCount++;
        equal(url.searchParams.get('provider'), 'google', 'Real SDK chooses Google provider');
        equal(url.searchParams.get('redirect_to'), `${new URL(BASE).origin}/auth/callback/`, 'OAuth callback uses exact development origin');
        equal(url.searchParams.get('code_challenge_method')?.toUpperCase(), 'S256', 'PKCE uses S256');
        check(/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge') || ''), 'PKCE challenge is a SHA-256 base64url value');
        fixture.challenge = url.searchParams.get('code_challenge');
        return route.fulfill({status: 302, headers: {location: `${BASE}/auth/callback/?code=${fixture.code}`}, body: ''});
      }
      if (url.pathname === '/auth/v1/token') {
        fixture.tokenCount++;
        const body = request.postDataJSON();
        equal(url.searchParams.get('grant_type'), 'pkce', 'Callback exchanges authorization code using PKCE');
        check(body.auth_code === fixture.code, 'SDK exchanges the intercepted authorization code');
        check(typeof body.code_verifier === 'string' && body.code_verifier.length >= 43, 'SDK submits its persisted verifier');
        check(crypto.createHash('sha256').update(body.code_verifier).digest('base64url') === fixture.challenge, 'Verifier matches the actual authorize challenge');
        fixture.pkceVerified = true;
        if (fixture.tokenInvalid) return json({error: 'invalid_grant', code: 'flow_state_expired', msg: SENTINEL, error_description: SENTINEL}, 400);
        return json({access_token: fixture.token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'hq3-intercepted-refresh-token-not-valid-outside-tests', user: fixture.user});
      }
      if (url.pathname === '/auth/v1/user') {
        fixture.userCount++;
        check(request.headers().authorization === `Bearer ${fixture.token}`, 'SDK verifies the issued session with getUser');
        if (fixture.failUser) return json({code: 'bad_jwt', msg: SENTINEL}, 401);
        return json(fixture.user);
      }
      if (url.pathname === '/auth/v1/logout') {
        fixture.logoutCount++;
        check(request.headers().authorization === `Bearer ${fixture.token}`, 'Sign-out revokes the issued session');
        return route.fulfill({status: 204, headers: cors, body: ''});
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        equal(request.method(), 'GET', 'Auth-to-calendar fixtures permit read-only database requests');
        check(request.headers().authorization === `Bearer ${fixture.token}`, 'Database reads carry the verified session');
        const table = url.pathname.slice('/rest/v1/'.length);
        if (table === 'workspace_members' && fixture.failMembership) return route.abort('connectionfailed');
        const rows = rowsFor(table, fixture, url);
        check(rows !== undefined, `Expected calendar table requested: ${table}`);
        if (table === 'workspace_members' && url.searchParams.has('user_id')) equal(url.searchParams.get('user_id'), `eq.${ID.user}`, 'Membership lookup is bound to verified user ID');
        else if (table !== 'workspaces') equal(url.searchParams.get('workspace_id'), `eq.${ID.workspace}`, 'Calendar data is scoped to the verified workspace');
        const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
        return json(single ? rows[0] || null : rows);
      }
      fixture.unexpected.push({method: request.method(), origin: url.origin, pathname: url.pathname});
      return route.abort('blockedbyclient');
    } catch (error) {
      fixture.protocolErrors.push(error.message);
      return json({code: 'QA_FIXTURE_MISMATCH', message: 'Intercepted protocol fixture mismatch'}, 500);
    }
  });
}
async function capture(page, filename) {
  await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {image.onload = resolve; image.onerror = resolve;})));});
  const file = `auth-flow-${filename}.png`;
  await page.screenshot({path: path.join(EVIDENCE, file), fullPage: true, animations: 'disabled'});
  screenshots.push({path: `docs/evidence/${file}`, provenance: 'Real application and Supabase browser SDK; all provider/database HTTP responses are synthetic intercepted fixtures, never live Google/Supabase.'});
}
async function login(page) {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Continue with Google', exact: true}).click();
}
async function calendar(page) {
  await page.waitForURL(url => url.pathname === '/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', {name: 'A little more clarity.', exact: true}).waitFor();
  equal(await page.getByRole('button', {name: 'Week', exact: true}).getAttribute('aria-pressed'), 'true', 'Verified membership reaches default Week calendar');
  check(await page.getByRole('button', {name: `Open ${PRIVATE_TITLE}`, exact: true}).isVisible(), 'Calendar contains the authorized HTTP fixture post');
  equal(await page.locator('.hq3-demo-bar').count(), 0, 'Actual repository/auth flow is used, not demo mode');
}
async function safeSignedOut(page) {
  await page.getByRole('button', {name: 'Continue with Google', exact: true}).waitFor();
  check(await page.getByRole('button', {name: 'Continue with Google', exact: true}).isEnabled(), 'User can initiate Google again');
  equal(await page.getByText(PRIVATE_TITLE, {exact: true}).count(), 0, 'No private content remains visible');
  equal(await page.locator('.hq3-calendar').count(), 0, 'No authenticated calendar remains');
}
async function safeCallbackError(page) {
  await safeSignedOut(page);
  await page.locator('.hq3 [role=alert]').waitFor();
  const body = await page.locator('body').innerText();
  check(!body.includes(SENTINEL), 'Provider diagnostics are not echoed into UI');
  const url = new URL(page.url());
  check(!['code', 'error', 'error_description', 'error_code', 'access_token', 'refresh_token'].some(key => url.searchParams.has(key)) && !url.hash, 'Callback secrets and error parameters are cleaned');
}
async function save() {
  await fs.writeFile(REPORT, JSON.stringify({executedAt: new Date().toISOString(), baseUrl: BASE, browser: await browser?.version(), filter: process.env.HQ_AUTH_QA_ONLY || null, authenticationEvidence: 'MOCK PROTOCOL ONLY: real app + real Supabase JS SDK; Google authorize, token exchange, getUser, membership, and calendar responses intercepted. No live provider or database access. Auth storage is populated only by the SDK after its intercepted PKCE exchange.', assertions, passed: results.filter(item => item.status === 'passed').length, failed: results.filter(item => item.status === 'failed').length, scenarios: results, screenshots, limitations: ['Does not verify live Google provider enablement, authorized redirect configuration, external credentials, deployed RLS, or actual production user membership.', 'Chromium mobile emulation is not a physical iPhone/Safari test.']}, null, 2) + '\n');
}
async function scenario(name, options, test, browserOptions = {}) {
  if (process.env.HQ_AUTH_QA_ONLY && !name.includes(process.env.HQ_AUTH_QA_ONLY)) return;
  const start = Date.now(); const initialAssertions = assertions; const fixture = fixtureState(options);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, ...browserOptions});
  await intercept(context, fixture);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const browserErrors = []; page.on('pageerror', error => browserErrors.push(error.message));
  let status = 'passed', error = null;
  try {
    await test(page, fixture);
    equal(fixture.protocolErrors, [], 'All intercepted HTTP protocol assertions passed');
    equal(fixture.unexpected, [], 'No unexpected external request was allowed or attempted');
    equal(browserErrors, [], 'No uncaught browser error');
  } catch (failure) {status = 'failed'; error = failure.message; console.error(`FAIL ${name}: ${failure.message}`); await capture(page, `failure-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).catch(() => {});}
  results.push({name, status, assertions: assertions - initialAssertions, durationMs: Date.now() - start, authorizeCount: fixture.authorizeCount, tokenExchangeCount: fixture.tokenCount, pkceVerifierMatched: fixture.pkceVerified, userVerificationCount: fixture.userCount, logoutCount: fixture.logoutCount, interceptedRequests: fixture.requests, unexpectedRequests: fixture.unexpected, protocolErrors: fixture.protocolErrors, browserErrors, error});
  await context.close(); await save(); console.log(`${status.toUpperCase()} ${name}`);
}

(async () => {
  await fs.mkdir(EVIDENCE, {recursive: true});
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  for (const device of [{name: 'desktop', width: 1440, height: 1000}, {name: 'mobile', width: 390, height: 844}]) {
    await scenario(`Verified Google protocol to Calendar and logout ${device.name}`, {}, async (page, fixture) => {
      await login(page); await calendar(page);
      equal(fixture.authorizeCount, 1, 'Google initiation performs one authorize navigation'); equal(fixture.tokenCount, 1, 'Callback exchanges code once'); check(fixture.pkceVerified, 'PKCE verifier round trip was validated');
      check(!new URL(page.url()).searchParams.has('code'), 'Successful callback code removed from URL');
      const card = await page.getByRole('button', {name: `Open ${PRIVATE_TITLE}`, exact: true}).boundingBox();
      check(card && card.y < device.height, 'The first calendar card begins above the initial viewport fold');
      if (device.width < 500) {
        const title = await page.getByRole('heading', {name: PRIVATE_TITLE, exact: true}).boundingBox();
        check(title && title.y + title.height < device.height - 80, 'First post title is visible above floating navigation without scrolling');
      }
      await capture(page, `calendar-${device.name}`);
      const beforeUserChecks = fixture.userCount;
      await page.reload(); await calendar(page); check(fixture.userCount > beforeUserChecks, 'Reload re-verifies the persisted SDK session'); equal(fixture.tokenCount, 1, 'Reload does not reuse authorization code');
      const signout = page.getByRole('button', {name: 'Sign out', exact: true}); check(await signout.isVisible(), 'Sign-out is accessible at this viewport'); await signout.click(); await safeSignedOut(page);
      equal(fixture.logoutCount, 1, 'Logout reaches the intercepted revocation endpoint');
      await page.reload(); await safeSignedOut(page); check(fixture.userCount > 0, 'Authentication path was exercised');
      equal(await page.evaluate(() => Object.keys(localStorage).filter(key => /^sb-.*-auth-token$/.test(key)).length), 0, 'SDK clears persisted auth session after logout');
      await capture(page, `signed-out-${device.name}`);
    }, {viewport: {width: device.width, height: device.height}, isMobile: device.width < 500, hasTouch: device.width < 500});
  }
  await scenario('Uninvited verified user cannot self-promote through editable metadata', {invited: false, metadataOwner: true}, async (page, fixture) => {
    await login(page); await page.getByRole('button', {name: 'Use another account', exact: true}).waitFor();
    equal(await page.locator('.hq3-calendar').count(), 0, 'Uninvited identity cannot reach calendar');
    equal(fixture.requests.filter(request => request.pathname === '/rest/v1/content_posts').length, 0, 'No content fetch occurs before membership authorization');
    check(await page.getByRole('button', {name: /sign out|another account/i}).isVisible(), 'Denied user has an account recovery action');
    await capture(page, 'uninvited-denied');
    await page.getByRole('button', {name: 'Use another account', exact: true}).click(); await safeSignedOut(page);
    equal(fixture.logoutCount, 1, 'Denied identity can leave the session to use another account');
  });
  await scenario('Unverified provider identity is denied', {unverified: true, metadataOwner: true}, async (page, fixture) => {
    await login(page); await page.locator('.hq3 [role=alert]').waitFor();
    equal(await page.locator('.hq3-calendar').count(), 0, 'Unverified identity cannot reach calendar');
    equal(fixture.requests.filter(request => request.pathname.startsWith('/rest/v1/')).length, 0, 'Unverified identity is denied before database access');
    check(!(await page.locator('body').innerText()).includes(SENTINEL), 'No provider diagnostic disclosure');
  });
  await scenario('Cancelled callback is recoverable and sanitized', {}, async page => {
    await page.goto(`${BASE}/auth/callback/?error=access_denied&error_code=access_denied&error_description=${SENTINEL}`);
    await safeCallbackError(page); check(/sign.in|Google/i.test(await page.locator('.hq3 [role=alert]').innerText()), 'Cancellation has a useful generic explanation');
    await capture(page, 'cancelled');
  });
  await scenario('Orphan callback code fails safely without a verifier', {}, async (page, fixture) => {
    await page.goto(`${BASE}/auth/callback/?code=orphan-fixture-code`);
    await safeCallbackError(page);
    equal(fixture.requests.filter(request => request.pathname.startsWith('/rest/v1/')).length, 0, 'Invalid callback never loads workspace content');
  });
  await scenario('Expired exchange is recoverable and provider diagnostics are hidden', {tokenInvalid: true}, async (page, fixture) => {
    await login(page); await safeCallbackError(page); check(fixture.pkceVerified, 'Invalid-grant response followed a valid PKCE request');
    equal(fixture.requests.filter(request => request.pathname.startsWith('/rest/v1/')).length, 0, 'Expired code never loads workspace content');
  });
  await scenario('Workspace transport failure retries without repeating OAuth', {failMembership: true}, async (page, fixture) => {
    await login(page); await page.locator('.hq3 [role=alert]').waitFor();
    equal(await page.locator('.hq3-calendar').count(), 0, 'Failed membership fetch does not expose calendar');
    check(!(await page.locator('body').innerText()).includes(SENTINEL), 'Transport UI does not echo provider diagnostics');
    fixture.failMembership = false;
    await page.getByRole('button', {name: /try again|retry/i}).click(); await calendar(page);
    equal(fixture.authorizeCount, 1, 'Workspace retry does not start another OAuth flow'); equal(fixture.tokenCount, 1, 'Workspace retry reuses verified SDK session');
  });
  await save(); await browser.close();
  console.log(JSON.stringify({passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, assertions, screenshots: screenshots.length}));
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
})().catch(async error => {console.error(error.message); await save(); await browser?.close(); process.exitCode = 1;});
