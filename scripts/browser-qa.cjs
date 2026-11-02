/* Run against a loopback-only HQ_LOCAL_DEVELOPMENT server. Never sign in to live providers. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CJS runner resolves the pinned Playwright installation. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = process.env.HQ_QA_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname), 'QA only runs against loopback');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs/evidence');
const REPORT = path.join(ROOT, 'docs/browser-qa-results.json');
const STORAGE_KEY = '4eign-hq3-demo-v1';
const results = [];
let browser;
let assertions = 0;
const screenshotFiles = [];
function check(condition, message) { assertions++; assert.ok(condition, message); }
function equal(actual, expected, message) { assertions++; assert.deepEqual(actual, expected, message); }
async function pressView(page, name) { await page.getByRole('group', {name: 'Calendar view', exact: true}).getByRole('button', {name, exact: true}).click(); }
async function navigate(page, label) { const mobile = await page.getByRole('navigation', {name: 'Mobile navigation'}).isVisible(); await page.getByRole('navigation', {name: mobile ? 'Mobile navigation' : 'Main navigation', exact: true}).getByRole('button', {name: label, exact: true}).click(); }
async function ready(page) { await page.getByRole('heading', {name: 'A little more clarity.', exact: true}).waitFor(); }
async function storedPost(page, id) { return page.evaluate(({key, id}) => JSON.parse(localStorage.getItem(key)).posts.find(post => post.id === id), {key: STORAGE_KEY, id}); }
async function screenshot(page, name) {
  await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {image.onload = resolve; image.onerror = resolve;})));});
  const filename = `${name}.png`;
  await page.screenshot({path: path.join(OUTPUT, filename), fullPage: !name.startsWith('post-detail'), animations: 'disabled'});
  screenshotFiles.push(`docs/evidence/${filename}`);
}
async function scenario(name, run, options = {}) {
  if (process.env.HQ_QA_ONLY && !name.includes(process.env.HQ_QA_ONLY)) return;
  const started = Date.now(); const initialAssertions = assertions;
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true, ...options});
  const blocked = []; const errors = []; const liveApiRequests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (url.origin !== new URL(BASE).origin) {blocked.push(`${url.origin}${url.pathname}`); return route.abort('blockedbyclient');}
    if (url.pathname.startsWith('/api/drive')) liveApiRequests.push(url.pathname);
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  let status = 'passed', error = null;
  try {
    await run(page, context);
    equal(blocked, [], 'Local demo and signed-out pages must not request external services');
    equal(liveApiRequests, [], 'Demo media must not call the live Drive API');
    equal(errors, [], 'No uncaught browser errors');
  } catch (failure) {
    status = 'failed'; error = failure.stack || String(failure);
    console.error(`FAIL ${name}: ${failure.message}`);
    await screenshot(page, `failure-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).catch(() => {});
  } finally { await context.close(); }
  const result = {name, status, assertions: assertions - initialAssertions, durationMs: Date.now() - started, blockedExternalRequests: blocked, liveApiRequests, browserErrors: errors, error};
  results.push(result); console.log(`${status.toUpperCase()} ${name} (${result.assertions} assertions)`);
  await saveReport();
}
async function saveReport() {
  await fs.writeFile(REPORT, JSON.stringify({executedAt: new Date().toISOString(), baseUrl: BASE, browser: `Chromium ${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium'}, Playwright`, mode: 'Demo fixtures and unauthenticated entry routes only; external HTTP requests blocked', filter: process.env.HQ_QA_ONLY || null, assertions, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, scenarios: results, screenshots: screenshotFiles, limitations: ['Browser emulation is not physical iPhone/Safari validation.', 'Live Google OAuth, deployed Supabase RLS, and live Google Drive are not exercised by this suite.']}, null, 2) + '\n');
}

(async () => {
  await fs.mkdir(OUTPUT, {recursive: true});
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});

  for (const route of ['/', '/auth/callback/']) {
    await scenario(`Signed-out access at ${route}`, async page => {
      const response = await page.goto(`${BASE}${route}`);
      equal(response.status(), 200, 'Unauthenticated entry route renders normally');
      await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor();
      check(await page.getByRole('button', {name: 'Continue with Google', exact: true}).isEnabled(), 'Google OAuth initiation is available without clicking it');
      check(await page.getByRole('button', {name: 'Continue with ChatGPT Unavailable', exact: true}).isDisabled(), 'Unsupported ChatGPT provider stays disabled');
      equal(await page.locator('input[type=password],input[type=email]').count(), 0, 'No password or email-registration form is exposed');
      equal(await page.getByRole('button', {name: /sign up|register|create account/i}).count(), 0, 'No public signup action is exposed');
      equal(await page.getByRole('heading', {name: 'A little more clarity.', exact: true}).count(), 0, 'Authenticated workspace is not rendered');
      equal(await page.getByRole('button', {name: 'New post', exact: true}).count(), 0, 'No authenticated content controls');
      equal(await page.getByText('Inside the lab.', {exact: true}).count(), 0, 'No demo or private posts leak into signed-out view');
      equal(await page.locator('.hq3-demo-bar').count(), 0, 'Signed-out route does not silently enter demo mode');
      equal(await page.locator('.hq3 [role=alert]').count(), 0, 'Absent session or callback code is handled without a workspace error');
    });
  }

  await scenario('Calendar views, filtering, and search', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    equal(await page.getByRole('button', {name: 'Week', exact: true}).getAttribute('aria-pressed'), 'true', 'Week is the default');
    equal(await page.locator('.hq3-day').count(), 7, 'Week has seven days');
    await pressView(page, 'Today'); equal(await page.locator('.hq3-day').count(), 1, 'Today has one day');
    check(await page.getByRole('button', {name: 'Open Inside the lab.', exact: true}).isVisible(), 'Today contains the sample post');
    await pressView(page, 'Month'); equal(await page.locator('.hq3-day').count(), 42, 'Month renders six weeks');
    const filters = page.getByRole('group', {name: 'Filter accounts', exact: true});
    await filters.getByRole('button', {name: '@dragonballhuntpr', exact: true}).click();
    equal(await page.getByRole('button', {name: 'Open Inside the lab.', exact: true}).count(), 0, 'Account filter excludes other-account posts');
    check(await page.getByRole('button', {name: 'Open The city is our playground.', exact: true}).isVisible(), 'Collaboration is retained by second-account filter');
    await filters.getByRole('button', {name: 'All accounts', exact: true}).click();
    await page.getByRole('textbox', {name: 'Search posts', exact: true}).fill('Inside the lab');
    equal(await page.locator('.hq3-month-post').count(), 1, 'Search filters cards');
    await page.getByRole('textbox', {name: 'Search posts', exact: true}).fill('no-match-qa');
    equal(await page.locator('.hq3-month-post').count(), 0, 'Search handles no matches');
    check(await page.getByRole('heading', {name: 'No posts match these filters.', exact: true}).isVisible(), 'No-match state explains active filters');
    await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
    equal(await page.getByRole('textbox', {name: 'Search posts', exact: true}).inputValue(), '', 'Clear filters resets search');
    check(await page.locator('.hq3-month-post').count() > 0, 'Clear filters restores scheduled posts');
  });

  await scenario('Mobile calendar starts with usable content and preserves weekly intention', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    const card = await page.locator('.hq3-post').first().boundingBox();
    const nav = await page.locator('.hq3-mobile-nav').boundingBox();
    check(card.y + 100 < nav.y, 'First card title and scheduling context appear above floating navigation');
    check(await page.getByRole('button', {name: 'New post', exact: true}).isVisible(), 'Mobile create button has an accessible name');
    check(await page.locator('.hq3-post-open').first().getAttribute('aria-describedby'), 'Post exposes time, accounts, and status as accessible description');
    const intention = page.locator('.hq3-intention');
    equal(await intention.getAttribute('open'), null, 'Weekly intention starts compact');
    await intention.locator('summary').click();
    await intention.getByRole('button', {name: 'Edit intention', exact: true}).click();
    await page.getByRole('textbox', {name: 'Weekly intention', exact: true}).fill('Keep the shared creative direction.');
    await page.getByRole('button', {name: 'Save intention', exact: true}).click();
    await page.getByRole('status').filter({hasText: 'Weekly intention saved.'}).waitFor();
    await page.reload(); await ready(page);
    check(await intention.locator('summary').getByText('Keep the shared creative direction.', {exact: true}).isVisible(), 'Weekly intention remains editable and persists');
    await pressView(page, 'Month');
    const populatedDay = page.locator('.hq3-day-heading button').filter({has: page.locator('.hq3-day-count')}).first();
    check((await populatedDay.boundingBox()).height >= 44, 'Month day target is at least 44px tall');
    check(/, [1-9][0-9]* posts?$/.test(await populatedDay.getAttribute('aria-label')), 'Month day announces date and post count');
    await populatedDay.click();
    equal(await page.getByRole('group', {name: 'Calendar view', exact: true}).getByRole('button', {name: 'Today', exact: true}).getAttribute('aria-pressed'), 'true', 'Month day opens full Today cards');
    check(await page.locator('.hq3-post').count() > 0, 'Selected day reveals full scheduling information');
  }, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  await scenario('Caption persistence, review notes, and keyboard dialog behavior', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    const opener = page.getByRole('button', {name: 'Open Inside the lab.', exact: true});
    await opener.click(); const dialog = page.getByRole('dialog', {name: 'Post details', exact: true}); await dialog.waitFor();
    equal(await page.locator(':focus').getAttribute('aria-label'), 'Close post details', 'Dialog autofocuses close control');
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press('Tab');
      check(await dialog.evaluate(element => element.contains(document.activeElement) || (!document.hasFocus() && document.activeElement === document.body)), `Modal prevents focus moving to background content (${index + 1})`);
    }
    await opener.evaluate(element => element.focus());
    check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Native modal makes background controls inert');
    const originalCaption = await dialog.getByRole('textbox', {name: 'Caption', exact: true}).inputValue();
    await dialog.getByRole('textbox', {name: 'Caption', exact: true}).fill('Unsaved QA draft'); await page.keyboard.press('Escape');
    check(await dialog.getByText('Keep your changes?', {exact: true}).isVisible(), 'Escape protects unsaved changes');
    await dialog.getByRole('button', {name: 'Keep editing', exact: true}).click();
    equal(await dialog.getByRole('textbox', {name: 'Caption', exact: true}).inputValue(), 'Unsaved QA draft', 'Keep editing retains draft');
    await page.keyboard.press('Escape'); await dialog.getByRole('button', {name: 'Discard & close', exact: true}).click();
    await dialog.waitFor({state: 'hidden'}); equal(await page.locator(':focus').getAttribute('aria-label'), 'Open Inside the lab.', 'Close returns focus to opener');
    await opener.click(); equal(await dialog.getByRole('textbox', {name: 'Caption', exact: true}).inputValue(), originalCaption, 'Discard leaves saved caption intact');
    await dialog.getByRole('textbox', {name: 'Caption', exact: true}).fill('Verified local caption edit — browser QA.');
    await dialog.getByRole('button', {name: 'Save changes', exact: true}).click(); await dialog.waitFor({state: 'hidden'});
    equal((await storedPost(page, 'post-1')).caption, 'Verified local caption edit — browser QA.', 'Caption persisted in demo storage');
    await page.reload(); await ready(page); await opener.click();
    equal(await dialog.getByRole('textbox', {name: 'Caption', exact: true}).inputValue(), 'Verified local caption edit — browser QA.', 'Caption survives reload');
    await dialog.getByRole('textbox', {name: 'Leave a review note', exact: true}).fill('A verified local review note.');
    await dialog.getByRole('button', {name: 'Add note', exact: true}).click();
    await dialog.getByText('A verified local review note.', {exact: true}).waitFor();
    equal(await dialog.getByRole('textbox', {name: 'Leave a review note', exact: true}).inputValue(), '', 'Added review note clears composer');
    await dialog.locator('summary').click(); check(await dialog.getByRole('textbox', {name: 'Creative instructions', exact: true}).isVisible(), 'Creative instructions expand');
    await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
  });

  await scenario('Manager task progress and read-only permissions', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    await page.getByRole('combobox', {name: 'Preview role', exact: true}).selectOption('manager');
    await pressView(page, 'Month'); await page.getByRole('button', {name: 'Open A signal of our own.', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Post details', exact: true});
    equal(await dialog.getByRole('button', {name: 'Save changes', exact: true}).count(), 0, 'Manager cannot edit approved content');
    const before = await storedPost(page, 'post-2');
    await dialog.getByRole('button', {name: 'Task progress: Not started. Change to In progress', exact: true}).click();
    await dialog.getByRole('button', {name: 'Task progress: In progress. Change to Done', exact: true}).waitFor();
    const after = await storedPost(page, 'post-2'); equal(after.taskProgress, 'in_progress', 'Manager progress saved'); equal(after.status, before.status, 'Progress does not change approval'); equal(after.caption, before.caption, 'Progress does not change caption');
    await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
    await page.getByRole('combobox', {name: 'Preview role', exact: true}).selectOption('brand_member');
    equal(await page.getByRole('button', {name: 'New post', exact: true}).count(), 0, 'Read-only member has no create control');
    await page.getByRole('button', {name: 'Open Inside the lab.', exact: true}).click();
    check(await dialog.getByRole('textbox', {name: 'Caption', exact: true}).getAttribute('readonly') !== null, 'Brand caption is read-only');
    equal(await dialog.getByRole('button', {name: 'Save changes', exact: true}).count(), 0, 'No read-only save control');
    equal(await dialog.getByRole('textbox', {name: 'Leave a review note', exact: true}).count(), 0, 'Read-only member cannot compose review notes');
    equal(await dialog.getByRole('button', {name: /^Task progress:/}).count(), 0, 'Read-only progress cannot mutate');
    await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
    await navigate(page, 'Media Library'); check(await page.locator('.wm-upload input').isDisabled(), 'Read-only media upload disabled');
    await navigate(page, 'Feed Preview'); equal(await page.getByRole('button', {name: 'Plan a post', exact: true}).count(), 0, 'Read-only feed has no planning mutation');
  });

  await scenario('New post and accessible rescheduling', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    await page.getByRole('button', {name: 'New post', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'A new idea.', exact: true}); await dialog.waitFor();
    await dialog.getByRole('textbox', {name: 'Title', exact: true}).fill('A browser-tested new idea.');
    await dialog.getByRole('textbox', {name: 'Caption', exact: true}).fill('Created locally; never published.');
    await dialog.getByRole('button', {name: 'Save idea', exact: true}).click(); await dialog.waitFor({state: 'hidden'});
    const newPost = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).posts.find(post => post.title === 'A browser-tested new idea.'), STORAGE_KEY);
    check(Boolean(newPost), 'New post is persisted'); check(['idea', 'draft'].includes(newPost.status), 'New idea is not auto-approved or published');
    await page.getByRole('button', {name: 'Open A browser-tested new idea.', exact: true}).click();
    const edit = page.getByRole('dialog', {name: 'Post details', exact: true});
    const input = edit.locator('input[type=datetime-local]'); const original = await input.inputValue();
    const date = new Date(`${original.slice(0, 10)}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); const updated = `${date.toISOString().slice(0, 10)}T14:30`;
    await input.fill(updated); await edit.getByRole('button', {name: 'Save changes', exact: true}).click(); await edit.waitFor({state: 'hidden'});
    equal((await storedPost(page, newPost.id)).scheduledAt, new Date(`${updated}:00-04:00`).toISOString(), 'Date editor reschedules in Puerto Rico time');
  });

  await scenario('Drag scheduling preserves time and progress', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    const source = page.locator('.hq3-post').filter({has: page.getByRole('button', {name: 'Open Inside the lab.', exact: true})});
    const sourceDate = await source.locator('time').getAttribute('datetime');
    const sourceDay = await source.locator('xpath=ancestor::section[contains(@class,"hq3-day")]').locator('.hq3-day-heading time').getAttribute('datetime');
    const target = page.locator('.hq3-day').filter({hasNot: source}).first(); const targetDate = await target.locator('.hq3-day-heading time').getAttribute('datetime');
    check(targetDate !== sourceDay, 'Drop target differs from source date');
    await source.dragTo(target.locator('.hq3-day-posts'));
    await page.getByRole('status').filter({hasText: 'Moved “Inside the lab.”'}).waitFor();
    const post = await storedPost(page, 'post-1'); equal(post.scheduledAt.slice(11), sourceDate.slice(11), 'Drag preserves time'); equal(post.taskProgress, 'in_progress', 'Drag preserves task progress');
    const date = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(post.scheduledAt)); equal(date, targetDate, 'Drag persists target calendar date');
  });

  await scenario('Feed modes, collaborative posts, and reference dialog', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page); await navigate(page, 'Feed Preview');
    equal(await page.getByRole('button', {name: 'Future Feed', exact: true}).getAttribute('aria-pressed'), 'true', 'Future Feed is initial view');
    equal(await page.locator('.hq-feed-tile-planned').count(), 3, 'Three eligible plans appear for Labz');
    equal(await page.locator('.hq-feed-tile').count(), 15, 'Plans precede twelve screenshot references');
    await page.getByRole('button', {name: 'Current Feed', exact: true}).click(); equal(await page.locator('.hq-feed-tile').count(), 12, 'Current Feed contains only screenshot references');
    const first = page.locator('.hq-feed-tile').first(); await first.click(); const reference = page.getByRole('dialog', {name: 'A moment in the feed.', exact: true}); await reference.waitFor();
    check(await reference.getByText(/not a live Instagram post/).isVisible(), 'Reference dialog discloses source'); await page.keyboard.press('Escape'); await reference.waitFor({state: 'hidden'});
    equal(await page.locator(':focus').getAttribute('aria-label'), await first.getAttribute('aria-label'), 'Reference close restores grid focus');
    await page.getByRole('combobox', {name: 'YOUR ACCOUNT', exact: true}).selectOption('@dragonballhuntpr'); equal(await page.locator('.hq-feed-tile').count(), 0, 'No invented Dragon Ball current snapshot');
    await page.getByRole('button', {name: 'Future Feed', exact: true}).click(); equal(await page.locator('.hq-feed-tile').count(), 1, 'Collaborative plan appears once in second account');
    await page.locator('.hq-feed-tile').first().click(); const details = page.getByRole('dialog', {name: 'Post details', exact: true}); await details.waitFor();
    equal(await details.getByRole('textbox', {name: 'Title', exact: true}).inputValue(), 'The city is our playground.', 'Feed opens canonical calendar post');
    equal(await details.locator('input[type=checkbox]:checked').count(), 2, 'Collaboration retains both accounts');
  });

  await scenario('Large local media upload, download integrity, attachment, and unlink', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page); await navigate(page, 'Media Library');
    const image = await fs.readFile(path.join(ROOT, 'public/feed/4eignlabz/05.jpg')); const bytes = Buffer.concat([image, Buffer.alloc(26 * 1024 * 1024 - image.length)]);
    await page.locator('.wm-upload input').setInputFiles({name: 'qa-large-original.jpg', mimeType: 'image/jpeg', buffer: bytes});
    await page.getByRole('heading', {name: 'qa-large-original.jpg', exact: true}).waitFor();
    check(await page.locator('.wm-selected-preview img').evaluate(image => image.complete && image.naturalWidth > 0), 'Large image decodes for preview');
    check(await page.getByText('26.0 MB', {exact: true}).isVisible(), 'Library accepts file above 25 MiB');
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', {name: 'Download original ↓', exact: true}).click(); const download = await downloadPromise; const downloaded = await fs.readFile(await download.path());
    equal(downloaded.length, bytes.length, 'Downloaded original byte count matches'); equal(crypto.createHash('sha256').update(downloaded).digest('hex'), crypto.createHash('sha256').update(bytes).digest('hex'), 'Downloaded original integrity matches');
    await page.getByRole('combobox', {name: 'Attach to a post', exact: true}).selectOption('post-1'); await page.getByRole('button', {name: 'Attach to post', exact: true}).click();
    await page.getByRole('button', {name: 'Remove attachment from Inside the lab.', exact: true}).waitFor(); check((await storedPost(page, 'post-1')).media.url.startsWith('blob:'), 'Attachment stored as local session media');
    await navigate(page, 'Calendar'); await page.getByRole('button', {name: 'Open Inside the lab.', exact: true}).click(); const dialog = page.getByRole('dialog', {name: 'Post details', exact: true});
    await dialog.getByRole('img', {name: 'qa-large-original.jpg', exact: true}).waitFor(); check(await dialog.getByRole('img', {name: 'qa-large-original.jpg', exact: true}).evaluate(image => image.complete && image.naturalWidth > 0), 'Local attachment survives tab switch');
    await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'}); await navigate(page, 'Media Library'); await page.getByRole('button', {name: /qa-large-original.jpg/}).click();
    await page.getByRole('button', {name: 'Remove attachment from Inside the lab.', exact: true}).click(); await page.getByText('Not attached to a post yet.', {exact: true}).waitFor(); equal((await storedPost(page, 'post-1')).media, null, 'Unlink removes association');
    check(await page.getByRole('button', {name: 'Download original ↓', exact: true}).isEnabled(), 'Unlink preserves downloadable original');
    await page.getByRole('button', {name: 'Remove browser copy', exact: true}).click(); equal(await page.getByRole('button', {name: /qa-large-original.jpg/}).count(), 0, 'Unattached local copy can be removed');
  });

  await scenario('Reduced motion and mobile keyboard controls', async page => {
    await page.goto(`${BASE}/preview/`); await ready(page);
    equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'Reduced motion preference active');
    const durations = await page.locator('.hq3-main').evaluate(element => {const style = getComputedStyle(element); return {animation: style.animationDuration, transition: style.transitionDuration};});
    check(durations.animation.split(',').every(value => parseFloat(value) <= 0.01), 'Nonessential entrance motion disabled');
    await navigate(page, 'Feed Preview');
    check(await page.locator('.hq-feed').evaluate(element => getComputedStyle(element).animationName === 'none'), 'Feed entrance respects reduced motion');
    const columns = await page.locator('.hq-feed-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length); equal(columns, 3, 'Mobile feed retains three columns');
    await page.getByRole('button', {name: 'Current Feed', exact: true}).focus(); await page.keyboard.press('Enter'); equal(await page.getByRole('button', {name: 'Current Feed', exact: true}).getAttribute('aria-pressed'), 'true', 'Keyboard activates feed view');
  }, {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});

  for (const width of [320, 390, 768, 1440]) {
    await scenario(`Responsive overflow at ${width}px`, async page => {
      const assertFits = async name => {const dimensions = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth})); check(dimensions.scroll <= dimensions.width + 1, `${name}: page width ${dimensions.scroll} must fit ${dimensions.width}`);};
      await page.goto(`${BASE}/preview/`); await ready(page);
      for (const view of ['Week', 'Today', 'Month']) {await pressView(page, view); await assertFits(view);}
      for (const tab of ['Media Library', 'Feed Preview']) {await navigate(page, tab); await assertFits(tab);}
      await page.goto(`${BASE}/login-preview/`); await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor(); await assertFits('Login');
      check(await page.getByRole('button', {name: 'Continue with ChatGPT Unavailable', exact: true}).isDisabled(), 'Unavailable provider is disabled');
      check(await page.getByRole('button', {name: 'Continue with Google', exact: true}).isDisabled(), 'Design login preview cannot authenticate');
    }, {viewport: {width, height: width < 500 ? 844 : 1000}, isMobile: width < 500, hasTouch: width < 500});
  }

  for (const device of [{name: 'desktop', width: 1440, height: 1000}, {name: 'mobile', width: 390, height: 844}]) {
    await scenario(`Screenshots ${device.name}`, async page => {
      await page.goto(`${BASE}/login-preview/`); await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor(); await screenshot(page, `login-${device.name}`);
      await page.goto(`${BASE}/`); await page.getByRole('heading', {name: 'Come on in.', exact: true}).waitFor(); await screenshot(page, `login-signed-out-${device.name}`);
      await page.goto(`${BASE}/preview/`); await ready(page);
      for (const view of ['Week', 'Today', 'Month']) {await pressView(page, view); await screenshot(page, `calendar-${view.toLowerCase()}-${device.name}`);}
      await page.getByRole('button', {name: 'Open Inside the lab.', exact: true}).click(); const dialog = page.getByRole('dialog', {name: 'Post details', exact: true}); await dialog.waitFor(); await screenshot(page, `post-detail-${device.name}`); await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
      await navigate(page, 'Feed Preview'); await screenshot(page, `feed-future-${device.name}`); await page.getByRole('button', {name: 'Current Feed', exact: true}).click(); await screenshot(page, `feed-current-${device.name}`);
      await navigate(page, 'Media Library'); await screenshot(page, `media-library-${device.name}`);
      check(screenshotFiles.filter(file => file.endsWith(`-${device.name}.png`)).length >= 9, 'Requested screenshot set captured');
    }, {viewport: {width: device.width, height: device.height}, isMobile: device.width < 500, hasTouch: device.width < 500});
  }
  await browser.close(); await saveReport();
  console.log(JSON.stringify({passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length, assertions, screenshots: screenshotFiles.length}));
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
})().catch(async error => {console.error(error); await browser?.close(); await saveReport(); process.exitCode = 1;});
