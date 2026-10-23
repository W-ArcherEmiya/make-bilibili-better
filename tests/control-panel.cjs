const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../Make Bilibili Better.user.js'), 'utf8');
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="feed2"><div class="container"><div>推荐</div></div></div>
<div class="feed-card" id="ad"><a href="https://cm.bilibili.com/ad">广告</a></div>
<div class="feed-card" id="empty"><div class="bili-video-card is-rcmd"><div></div></div></div>
<div class="feed-card" id="normal"><div class="bili-video-card__info">视频</div></div>
<div id="app"><main>动态</main></div><div class="bili-dyn-list__item" id="goods"><div class="bili-dyn-card-goods">商品</div></div>
<div id="bilibili-player"><video></video></div><div class="bpx-player-ctrl-setting-menu-left"></div>
<div id="welcome-area-bottom-vm">欢迎</div><div class="web-player-icon-roomStatus">状态</div>
<div class="article-holder unable-reprint">文章</div></body></html>`;

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        const errors = [];
        const page = await context.newPage();
        page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
        await page.addInitScript(() => {
            window.unsafeWindow = window;
            window.GM_info = { script: { version: '1.3.1' } };
            window.GM_notification = () => {};
            window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.documentElement.append(style); };
        });
        await page.addInitScript(source);
        const ui = page.locator('#mbb-control-panel');
        async function visit(url) {
            await page.goto(url);
            await ui.locator('#dock').waitFor({ state: 'visible' });
            assert.equal(await ui.locator('#dock').getAttribute('title'), null, 'Dock has no hover text');
            await ui.locator('#dock').click();
            await ui.locator('#panel').waitFor({ state: 'visible' });
        }
        async function advanced() { if (!await ui.locator('#advanced').evaluate(el => el.open)) await ui.locator('#advanced summary').click(); }
        await visit('https://www.bilibili.com/video/BVfixture?vd_source=tracking');
        async function checkAnchor() {
            const logo = await ui.locator('.panel-head .logo').boundingBox();
            const bounds = await ui.locator('#panel').boundingBox();
            const viewport = page.viewportSize();
            assert.equal(bounds.width, Math.min(320, viewport.width - 20));
            assert(bounds.height <= 520, 'Compact height cap');
            assert(await ui.locator('.panel-head').evaluate(el => el.scrollWidth <= el.clientWidth), 'Header fits');
            assert(logo.y + logo.height / 2 <= viewport.height * 0.3 + 28, 'Panel follows origin or shifts upward to fit');
            assert(bounds.y >= 12 && bounds.y + bounds.height <= viewport.height - 11, 'Panel stays inside viewport');
        }
        await checkAnchor();
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForTimeout(100);
        assert.equal(await ui.locator('#panel').getAttribute('data-theme'), 'dark', 'System dark fallback');
        assert.equal(await ui.locator('#panel').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(32, 33, 36)');
        await page.screenshot({ path: path.join(process.env.TEMP, 'mbb-dark-desktop.png') });
        await ui.locator('#reset').click();
        assert.equal(await ui.locator('#reset-dialog').getAttribute('data-theme'), 'dark');
        await page.keyboard.press('Escape');
        await page.evaluate(() => document.documentElement.dataset.theme = 'light');
        await page.waitForTimeout(100);
        assert.equal(await ui.locator('#panel').getAttribute('data-theme'), 'light', 'Page light overrides system');
        await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.style.backgroundColor = '#181818'; });
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForTimeout(100);
        assert.equal(await ui.locator('#panel').getAttribute('data-theme'), 'dark', 'Dark page background overrides system');
        await page.setViewportSize({ width: 320, height: 640 });
        await ui.locator('#mode-help').hover(); await page.waitForTimeout(350);
        assert.equal(await ui.locator('#mode-hint').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(48, 51, 56)');
        await page.screenshot({ path: path.join(process.env.TEMP, 'mbb-dark-mobile.png') });
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.body.style.removeProperty('background-color'));
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(100);
        assert.equal(await ui.locator('#panel').getAttribute('data-theme'), 'light', 'Returns to light');
        await page.screenshot({ path: path.join(process.env.TEMP, 'mbb-production-desktop.png') });
        assert(!page.url().includes('vd_source'));
        assert.equal(await ui.locator('input[type=checkbox]').count(), 10);
        assert.equal(await ui.locator('.version').innerText(), 'v1.3.1');
        await ui.locator('#crop').check();
        assert(await page.locator('body').evaluate(el => el.hasAttribute('data-mbb-video-crop')));
        await page.reload(); await ui.locator('#dock').click();
        assert(await ui.locator('#crop').isChecked());
        await page.locator('.bpx-player-ctrl-setting-fit-mode input').uncheck();
        await ui.locator('#dock').click();
        assert(!await ui.locator('#crop').isChecked());
        await ui.locator('[data-mode=force]').click();
        assert.equal(await page.evaluate(() => MBBPlaybackAccelerator.getConfig().mode), 'force');
        await ui.locator('#enabled').uncheck();
        assert(await ui.locator('[data-mode=force]').isDisabled());
        assert.equal(await page.evaluate(() => MBBPlaybackAccelerator.getConfig().enabled), false);
        await ui.locator('#enabled').check();
        await ui.locator('[data-mode=gentle]').click();
        await page.evaluate(() => {
            const video = document.querySelector('video');
            for (const [key, value] of Object.entries({ paused: false, currentTime: 10, duration: 100, readyState: 1 })) {
                Object.defineProperty(video, key, { configurable: true, value });
            }
            video.dispatchEvent(new Event('waiting'));
        });
        await ui.locator('#tab-current').click();
        assert(Number(await ui.locator('#issues').innerText()) >= 1);
        assert((await ui.locator('#current').innerText()).includes('策略已修改 · 用于后续请求'));
        await ui.locator('#tab-settings').click();
        await ui.locator('[data-mode=auto]').click();
        assert.equal(await page.evaluate(() => MBBPlaybackAccelerator.getConfig().autoAdapt), true);
        await advanced();
        await checkAnchor();
        assert(!await ui.locator('#feature-hevc').isChecked());
        await ui.locator('#feature-hevc').check();
        await ui.locator('#safari').check();
        await ui.locator('#feature-capability').uncheck();
        assert(await ui.locator('#pending').isVisible());
        await ui.locator('#tab-current').click();
        assert((await ui.locator('#current').innerText()).includes('待刷新开启'));
        assert((await ui.locator('#current').innerText()).includes('待刷新关闭'));
        await ui.locator('#tab-settings').click();
        assert(!await page.evaluate(() => Object.getPrototypeOf(sessionStorage).__mbbHevcPatched === '1'));
        await page.reload(); await ui.locator('#dock').click(); await advanced();
        assert(await page.evaluate(() => Object.getPrototypeOf(sessionStorage).__mbbHevcPatched === '1'));
        assert.equal(await page.evaluate(() => navigator.platform), 'MacIntel');
        assert.equal(await page.evaluate(() => localStorage.getItem('bilibili_player_force_hdr')), null);
        await ui.locator('#reset').click(); await page.keyboard.press('Escape');
        assert(await ui.locator('#panel').isVisible());
        await ui.locator('#reset').click(); await ui.locator('#confirm-reset').click();
        assert(!await ui.locator('#feature-hevc').isChecked());
        assert(await ui.locator('#pending').isVisible());
        await page.reload(); await ui.locator('#dock').click();
        assert(!await page.evaluate(() => Object.getPrototypeOf(sessionStorage).__mbbHevcPatched === '1'));
        assert.notEqual(await page.evaluate(() => navigator.platform), 'MacIntel');
        await ui.locator('#close').click(); await page.keyboard.press('Tab');
        assert(await ui.locator('#panel').evaluate(el => el.inert));
        assert(!await ui.evaluate(el => el.shadowRoot.activeElement?.closest('#panel')));
        await ui.locator('#dock').click();
        await advanced();
        await ui.locator('#settings details').evaluateAll(es => es.forEach(el => { el.open = true; }));
        await ui.locator('.panel .body').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const scroll = await ui.locator('.panel .body').evaluate(el => el.scrollTop);
        await ui.locator('#tab-current').click(); await ui.locator('#tab-settings').click();
        assert(Math.abs(scroll - await ui.locator('.panel .body').evaluate(el => el.scrollTop)) < 1);
        await page.setViewportSize({ width: 320, height: 640 });
        await page.waitForTimeout(100);
        await checkAnchor();
        await ui.locator('#safari-help').scrollIntoViewIfNeeded();
        await ui.locator('#safari-help').hover(); await page.waitForTimeout(350);
        const tip = await ui.locator('#mode-hint').boundingBox(), panel = await ui.locator('#panel').boundingBox();
        assert(tip && tip.x >= panel.x && tip.x + tip.width <= panel.x + panel.width);
        await page.keyboard.press('Escape'); assert(await ui.locator('#panel').isVisible());
        await page.screenshot({ path: path.join(process.env.TEMP, 'mbb-production-mobile.png') });
        await page.evaluate(() => document.body.classList.add('bpx-state-web'));
        await page.waitForTimeout(1100); assert(!await ui.locator('#dock').isVisible());
        await page.evaluate(() => document.body.classList.remove('bpx-state-web'));
        await page.waitForTimeout(1100); assert(await ui.locator('#dock').isVisible());
        await page.setViewportSize({ width: 1440, height: 900 });

        const dock = ui.locator('#dock');
        await page.mouse.move(100, 100);
        await dock.evaluate(el => el.blur());
        assert.equal(await dock.evaluate(el => getComputedStyle(el).opacity), '0.45', 'Idle dock fades');
        await dock.hover();
        assert.equal(await dock.evaluate(el => getComputedStyle(el).opacity), '1', 'Hover restores opacity');
        await page.mouse.move(100, 100);
        await page.keyboard.press('Tab');
        await dock.focus();
        assert.equal(await dock.evaluate(el => getComputedStyle(el).opacity), '1', 'Keyboard focus restores opacity');
        async function dragDock(y) {
            const box = await dock.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2, y, { steps: 12 });
            await page.mouse.up();
        }
        await dragDock(890);
        assert(!await ui.locator('#panel').isVisible(), 'Drag does not open panel');
        const moved = await dock.boundingBox();
        assert(moved.y > 800 && moved.y + moved.height <= 892, 'Dock clamps at bottom');
        await page.reload(); await dock.waitFor({ state: 'visible' });
        assert(Math.abs((await dock.boundingBox()).y - moved.y) < 1, 'Dock position persists');
        await dock.click();
        const bottomPanel = await ui.locator('#panel').boundingBox();
        assert(bottomPanel.height >= 300 && bottomPanel.y + bottomPanel.height <= 888, 'Bottom anchor keeps panel usable');
        assert(await ui.locator('.panel .body').evaluate(el => el.scrollHeight <= el.clientHeight + 2), 'Collapsed content fits without premature scrolling');
        await page.screenshot({ path: path.join(process.env.TEMP, 'mbb-drag-bottom.png') });
        await ui.locator('#close').click();
        await page.setViewportSize({ width: 320, height: 480 });
        await page.waitForTimeout(100);
        const resizedDock = await dock.boundingBox();
        assert(resizedDock.y + resizedDock.height <= 472, 'Dock remains visible after resize');
        await dragDock(2);
        assert.equal((await dock.boundingBox()).y, 8, 'Dock clamps at top');
        const touch = await context.newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 34 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 200 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await touch.detach();
        assert.equal((await dock.boundingBox()).y, 8, 'Cancelled gesture restores position');
        await dock.focus(); await page.keyboard.press('Enter');
        assert(await ui.locator('#panel').isVisible(), 'Keyboard opening remains available');
        await page.evaluate(() => localStorage.removeItem('mbb-dock-position-v1'));
        await page.setViewportSize({ width: 1440, height: 900 });

        await visit('https://www.bilibili.com/');
        await ui.locator('#tab-current').click();
        assert((await ui.locator('#current').innerText()).includes('已开启 · 暂无播放任务'));
        await ui.locator('#tab-settings').click();
        assert(!await page.locator('#ad').isVisible()); assert.equal(await page.locator('#empty').count(), 0);
        assert(await page.locator('#normal').isVisible(), await page.locator('#normal').evaluate(el => JSON.stringify({html:el.outerHTML, display:getComputedStyle(el).display, body:getComputedStyle(document.body).display, width:el.getBoundingClientRect().width, height:el.getBoundingClientRect().height})));
        await ui.locator('#feature-groups summary').click(); await ui.locator('#feature-ads').uncheck();
        assert(await page.locator('#ad').isVisible());
        await ui.locator('#feature-spacing').uncheck();
        assert(!await page.locator('html').evaluate(el => el.hasAttribute('data-mbb-spacing')));
        await page.reload(); await ui.locator('#dock').click();
        assert(await page.locator('#ad').isVisible());
        await visit('https://t.bilibili.com/');
        assert(await page.locator('html').evaluate(el => el.hasAttribute('data-mbb-wide')));
        await ui.locator('#wide').uncheck();
        assert(!await page.locator('html').evaluate(el => el.hasAttribute('data-mbb-wide')));
        await ui.locator('#feature-groups summary').click(); await ui.locator('#feature-goods').uncheck();
        assert(await page.locator('#goods').isVisible());
        assert.equal(await page.locator('#mbb-wide-mode-switch').count(), 0);
        await visit('https://live.bilibili.com/123');
        assert(!await page.locator('#welcome-area-bottom-vm').isVisible());
        await ui.locator('#feature-groups summary').click(); await ui.locator('#feature-liveClean').uncheck();
        assert(await page.locator('#welcome-area-bottom-vm').isVisible());
        await visit('https://www.bilibili.com/read/cv123');
        assert(!await page.locator('.article-holder').evaluate(el => el.classList.contains('unable-reprint')));
        await page.evaluate(() => history.pushState({}, '', '/video/BVnext'));
        await page.waitForTimeout(900); await ui.locator('#tab-current').click();
        assert((await ui.locator('#current').innerText()).includes('视频播放页'));
        await visit('https://www.bilibili.tv/en/video/123');
        assert(await ui.locator('#panel').isVisible());
        const blocked = await context.newPage();
        blocked.on('pageerror', error => errors.push(error.message));
        await blocked.addInitScript(() => {
            window.unsafeWindow = window;
            window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.documentElement.append(style); };
            Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
        });
        await blocked.addInitScript(source);
        await blocked.goto('https://www.bilibili.com/video/BVblocked');
        const blockedUi = blocked.locator('#mbb-control-panel');
        await blockedUi.locator('#dock').click(); await blockedUi.locator('#crop').click();
        assert(!await blockedUi.locator('#crop').isChecked());
        assert((await blockedUi.locator('#toast').innerText()).includes('无法保存'));
        await blocked.close();
        assert.deepEqual(errors, []);
        console.log('PASS: persistence, real toggles, compatibility opt-in/reset, keyboard, tooltip, responsive layout, fullscreen, SPA and page types.');
        await context.close();
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
