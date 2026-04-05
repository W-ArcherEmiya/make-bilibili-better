// ==UserScript==
// @name         Make Bilibili Better
// @namespace    local.make-bilibili-better
// @version      1.0
// @description  优化哔哩哔哩网页体验，提供首页净化、动态页宽屏、专栏复制、视频裁切模式、链接参数清理，以及轻量级直播与番剧增强。
// @author       Make Bilibili Better contributors
// @license      MIT
// @match        https://*.bilibili.com/*
// @run-at       document-body
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const HOMEPAGE_HOST = 'www.bilibili.com';
    const HOMEPAGE_PATH = '/';
    const DYNAMIC_HOST = 't.bilibili.com';
    const LIVE_HOST = 'live.bilibili.com';
    const ARTICLE_PATH_PREFIX = '/read/cv';
    const BANGUMI_PATH_PREFIX = '/bangumi/play/';
    const VIDEO_PATH_PREFIX = '/video/';
    const WIDE_MODE_STORAGE_KEY = 'mbb-dynamic-wide-disabled';
    const VIDEO_CROP_STORAGE_KEY = 'mbb-video-crop-enabled';
    const TRACKING_PARAM_RULES = [
        'buvid',
        'from_spmid',
        'is_story_h5',
        'launch_id',
        'live_from',
        'mid',
        'session_id',
        'timestamp',
        'unique_k',
        'up_id',
        'vd_source',
        /^share/i,
        /^spm/i,
    ];

    function isDynamicPage() {
        return location.host === DYNAMIC_HOST;
    }

    function isArticlePage() {
        return location.host === HOMEPAGE_HOST && location.pathname.startsWith(ARTICLE_PATH_PREFIX);
    }

    function isLivePage() {
        return location.host === LIVE_HOST;
    }

    function isBangumiPage() {
        return location.host === HOMEPAGE_HOST && location.pathname.startsWith(BANGUMI_PATH_PREFIX);
    }

    function isVideoPage() {
        return location.host === HOMEPAGE_HOST && location.pathname.startsWith(VIDEO_PATH_PREFIX);
    }

    function isHomepage() {
        return location.host === HOMEPAGE_HOST && location.pathname === HOMEPAGE_PATH;
    }

    function toArray(listLike) {
        return Array.from(listLike || []);
    }

    function shouldRemoveTrackingParam(paramName) {
        return TRACKING_PARAM_RULES.some(rule => {
            if (rule instanceof RegExp) {
                return rule.test(paramName);
            }
            return rule === paramName;
        });
    }

    function getSafePageWindow() {
        return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    }

    function removeTrackingParams(inputUrl) {
        if (!inputUrl) {
            return inputUrl;
        }

        let url;
        try {
            url = new URL(String(inputUrl), location.href);
        } catch (error) {
            return inputUrl;
        }

        let changed = false;
        toArray(url.searchParams.keys()).forEach(paramName => {
            if (shouldRemoveTrackingParam(paramName)) {
                url.searchParams.delete(paramName);
                changed = true;
            }
        });

        if (!changed) {
            return inputUrl;
        }

        if (/^https?:/i.test(String(inputUrl))) {
            return url.toString();
        }

        return `${url.pathname}${url.search}${url.hash}`;
    }

    function collectFeedCards(root = document) {
        const cards = [];

        if (root instanceof HTMLElement && root.matches('.feed-card, .bili-feed-card')) {
            cards.push(root);
        }

        if (typeof root.querySelectorAll === 'function') {
            cards.push(...root.querySelectorAll('.feed-card, .bili-feed-card'));
        }

        return toArray(new Set(cards));
    }

    function hasAdMarkers(card) {
        return Boolean(
            card.querySelector('a[href*="cm.bilibili.com"]')
            || card.querySelector('.ad-report')
        );
    }

    function isEmptyRecommendationCard(card) {
        const videoCard = card.matches('.bili-video-card')
            ? card
            : card.querySelector('.bili-video-card.is-rcmd');

        if (!(videoCard instanceof HTMLElement) || !videoCard.matches('.bili-video-card.is-rcmd')) {
            return false;
        }

        if (videoCard.querySelector('.bili-video-card__wrap, .bili-video-card__info, .bili-video-card__image--link, .bili-video-card__skeleton')) {
            return false;
        }

        const elementChildren = toArray(videoCard.children);
        return elementChildren.length === 1 && elementChildren[0].tagName === 'DIV';
    }

    function cleanupHomepage(root = document) {
        collectFeedCards(root).forEach(card => {
            if (!(card instanceof HTMLElement)) {
                return;
            }

            if (hasAdMarkers(card) || isEmptyRecommendationCard(card)) {
                card.remove();
            }
        });
    }

    function installHomepageCleanup() {
        GM_addStyle([
            '.feed2 .container > * { margin-top: 0 !important; }',
            '.feed-card:has(a[href*="cm.bilibili.com"]) { display: none !important; }',
            '.feed-card:has(.ad-report) { display: none !important; }',
        ].join('\n'));

        cleanupHomepage();

        let attempts = 0;
        const intervalId = setInterval(() => {
            cleanupHomepage();
            attempts += 1;
            if (attempts >= 100) {
                clearInterval(intervalId);
            }
        }, 300);

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        cleanupHomepage(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function isWideModeEnabled() {
        return localStorage.getItem(WIDE_MODE_STORAGE_KEY) !== '1';
    }

    function applyDynamicWideModeState(enabled) {
        document.documentElement.toggleAttribute('data-mbb-wide', enabled);
    }

    function toggleDynamicWideMode() {
        const nextEnabled = !isWideModeEnabled();
        if (nextEnabled) {
            localStorage.removeItem(WIDE_MODE_STORAGE_KEY);
        } else {
            localStorage.setItem(WIDE_MODE_STORAGE_KEY, '1');
        }
        applyDynamicWideModeState(nextEnabled);
    }

    function createWideModeButton() {
        const button = document.createElement('button');
        button.id = 'mbb-wide-mode-switch';
        button.type = 'button';
        button.className = 'mbb-wide-mode-switch';
        button.textContent = '宽屏';
        button.addEventListener('click', toggleDynamicWideMode);
        return button;
    }

    function installDynamicWideMode() {
        GM_addStyle([
            'html[data-mbb-wide] #app { display: flex; }',
            'html[data-mbb-wide] .bili-dyn-home--member { box-sizing: border-box; width: 100%; flex: 1; padding: 0 10px; }',
            'html[data-mbb-wide] .bili-dyn-content { width: auto; }',
            'html[data-mbb-wide] main { width: auto; flex: 1; margin: 0 8px; overflow: hidden; }',
            '.mbb-wide-mode-switch { position: fixed; right: 16px; bottom: 24px; z-index: 9999; box-sizing: border-box; min-width: 76px; padding: 8px 14px; border: 1px solid #e3e5e7; border-radius: 6px; background: #fff; color: #18191c; font: inherit; line-height: 20px; text-align: center; cursor: pointer; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08); }',
            '.mbb-wide-mode-switch:hover { border-color: #c9ccd0; background: #fff; color: #18191c; }',
            'html[data-mbb-wide] .mbb-wide-mode-switch { border-color: transparent; background: #fb7299; color: #fff; box-shadow: 0 6px 16px rgba(251, 114, 153, 0.28); }',
            'html[data-mbb-wide] .mbb-wide-mode-switch:hover { background: #fc86a8; color: #fff; }',
            '.bili-dyn-list__item:has(.bili-dyn-card-goods), .bili-dyn-list__item:has(.bili-rich-text-module.goods) { display: none !important; }',
        ].join('\n'));

        applyDynamicWideModeState(isWideModeEnabled());

        const mountButton = () => {
            if (document.getElementById('mbb-wide-mode-switch')) {
                return true;
            }
            if (!document.body) {
                return false;
            }
            document.body.appendChild(createWideModeButton());
            return true;
        };

        if (!mountButton()) {
            let attempts = 0;
            const intervalId = setInterval(() => {
                if (mountButton() || ++attempts >= 100) {
                    clearInterval(intervalId);
                }
            }, 300);
        }
    }

    function installArticleCopy() {
        const unlockArticle = (root = document) => {
            const articleHolders = [];

            if (root instanceof HTMLElement && root.matches('.article-holder')) {
                articleHolders.push(root);
            }

            if (typeof root.querySelectorAll === 'function') {
                articleHolders.push(...root.querySelectorAll('.article-holder'));
            }

            articleHolders.forEach(holder => {
                holder.classList.remove('unable-reprint');
            });
        };

        document.addEventListener('copy', event => {
            if (event.target instanceof Node && event.target.parentElement?.closest('.article-holder')) {
                event.stopImmediatePropagation();
            }
        }, true);

        unlockArticle();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        unlockArticle(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function installTrackingCleanup() {
        const pageWindow = getSafePageWindow();
        const { history } = pageWindow;
        const cleanedCurrentUrl = removeTrackingParams(location.href);

        if (typeof cleanedCurrentUrl === 'string' && cleanedCurrentUrl !== location.href) {
            history.replaceState(history.state, '', cleanedCurrentUrl);
        }

        const originalPushState = history.pushState.bind(history);
        history.pushState = function (state, unused, url) {
            const cleanedUrl = typeof url === 'string' ? removeTrackingParams(url) : url;
            return originalPushState(state, unused, cleanedUrl);
        };

        const originalReplaceState = history.replaceState.bind(history);
        history.replaceState = function (state, unused, url) {
            const cleanedUrl = typeof url === 'string' ? removeTrackingParams(url) : url;
            return originalReplaceState(state, unused, cleanedUrl);
        };
    }

    function isVideoCropEnabled() {
        return localStorage.getItem(VIDEO_CROP_STORAGE_KEY) === '1';
    }

    function applyVideoCropState(enabled) {
        document.body.toggleAttribute('data-mbb-video-crop', enabled);
    }

    function setVideoCropEnabled(enabled) {
        if (enabled) {
            localStorage.setItem(VIDEO_CROP_STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(VIDEO_CROP_STORAGE_KEY);
        }
        applyVideoCropState(enabled);
    }

    function updateVideoCropInput(input) {
        if (input instanceof HTMLInputElement) {
            input.checked = isVideoCropEnabled();
        }
    }

    function createVideoCropSwitchItem() {
        const item = document.createElement('div');
        item.className = 'bpx-player-ctrl-setting-fit-mode bui bui-switch';
        item.innerHTML = '<input class="bui-switch-input" type="checkbox"><label class="bui-switch-label"><span class="bui-switch-name">裁切模式</span><span class="bui-switch-body"><span class="bui-switch-dot"><span></span></span></span></label>';

        const input = item.querySelector('input');
        updateVideoCropInput(input);
        input?.addEventListener('change', event => {
            setVideoCropEnabled(Boolean(event.target?.checked));
        });

        return item;
    }

    function installVideoCropMode() {
        GM_addStyle([
            'body[data-mbb-video-crop] #bilibili-player video { object-fit: cover !important; }',
            '.bpx-player-ctrl-setting-fit-mode { display: flex; width: 100%; height: 32px; line-height: 32px; }',
            '.bpx-player-ctrl-setting-box .bui-panel-wrap, .bpx-player-ctrl-setting-box .bui-panel-item { min-height: 172px !important; }',
        ].join('\n'));

        applyVideoCropState(isVideoCropEnabled());

        const mountButton = () => {
            if (document.querySelector('.bpx-player-ctrl-setting-fit-mode')) {
                const existingInput = document.querySelector('.bpx-player-ctrl-setting-fit-mode input');
                updateVideoCropInput(existingInput);
                return true;
            }

            const parent = document.querySelector('.bpx-player-ctrl-setting-menu-left');
            if (!(parent instanceof HTMLElement)) {
                return false;
            }

            const item = createVideoCropSwitchItem();
            const moreButton = document.querySelector('.bpx-player-ctrl-setting-more');

            if (moreButton instanceof HTMLElement && moreButton.parentElement === parent) {
                parent.insertBefore(item, moreButton);
            } else {
                parent.appendChild(item);
            }

            const panelItem = document.querySelector('.bpx-player-ctrl-setting-box .bui-panel-item');
            if (panelItem instanceof HTMLElement) {
                panelItem.style.height = '';
            }

            return true;
        };

        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (mountButton() || attempts >= 200) {
                clearInterval(timer);
            }
        }, 200);
    }

    function installLiveEnhancements() {
        GM_addStyle([
            '#welcome-area-bottom-vm { display: none !important; }',
            '.web-player-icon-roomStatus { display: none !important; }',
        ].join('\n'));

        const errorTimestamps = [];
        let hasShownFailureNotice = false;

        const recordPlaybackFailure = () => {
            const now = Date.now();
            errorTimestamps.push(now);

            while (errorTimestamps.length && now - errorTimestamps[0] > 30000) {
                errorTimestamps.shift();
            }

            if (hasShownFailureNotice || errorTimestamps.length < 5) {
                return;
            }

            hasShownFailureNotice = true;
            GM_notification({
                title: '直播播放异常',
                text: '检测到直播多次播放失败，最高清晰度可能不可用，建议尝试切换到较低画质。',
                timeout: 4000,
                silent: true,
            });
        };

        const attachVideoWatchers = root => {
            const videos = [];

            if (root instanceof HTMLVideoElement) {
                videos.push(root);
            }

            if (typeof root.querySelectorAll === 'function') {
                videos.push(...root.querySelectorAll('video'));
            }

            toArray(new Set(videos)).forEach(video => {
                if (!(video instanceof HTMLVideoElement) || video.dataset.mbbLiveBound === '1') {
                    return;
                }

                video.dataset.mbbLiveBound = '1';
                video.addEventListener('error', recordPlaybackFailure);
                video.addEventListener('stalled', recordPlaybackFailure);
                video.addEventListener('abort', recordPlaybackFailure);
            });
        };

        attachVideoWatchers(document);

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        attachVideoWatchers(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function installBangumiEnhancements() {
        const attachVideoRecovery = root => {
            const videos = [];

            if (root instanceof HTMLVideoElement) {
                videos.push(root);
            }

            if (typeof root.querySelectorAll === 'function') {
                videos.push(...root.querySelectorAll('video'));
            }

            toArray(new Set(videos)).forEach(video => {
                if (!(video instanceof HTMLVideoElement) || video.dataset.mbbBangumiBound === '1') {
                    return;
                }

                video.dataset.mbbBangumiBound = '1';
                let hasRetried = false;

                video.addEventListener('error', () => {
                    if (hasRetried) {
                        return;
                    }

                    hasRetried = true;
                    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

                    try {
                        video.load();
                        video.addEventListener('loadedmetadata', () => {
                            if (currentTime > 0) {
                                try {
                                    video.currentTime = currentTime;
                                } catch (error) {
                                    // Ignore seek failures on recovery.
                                }
                            }
                            video.play().catch(() => { });
                        }, { once: true });
                    } catch (error) {
                        // Ignore recovery failures and let the player handle the final state.
                    }
                });
            });
        };

        attachVideoRecovery(document);

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        attachVideoRecovery(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (isHomepage()) {
        installHomepageCleanup();
    }

    if (isDynamicPage()) {
        installDynamicWideMode();
    }

    if (isArticlePage()) {
        installArticleCopy();
    }

    installTrackingCleanup();

    if (isVideoPage()) {
        installVideoCropMode();
    }

    if (isLivePage()) {
        installLiveEnhancements();
    }

    if (isBangumiPage()) {
        installBangumiEnhancements();
    }
})();
