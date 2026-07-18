// ==UserScript==
// @name         Make Bilibili Better（海外优化版）
// @namespace    local.make-bilibili-better
// @version      1.2.2
// @description  优化哔哩哔哩网页体验，支持海外播放地址优化，适合留学生和海外用户观看 B 站。
// @author       ArcherEmiya
// @license      MIT
// @match        https://*.bilibili.com/*
// @match        https://*.bilibili.tv/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        hosts: {
            homepage: 'www.bilibili.com',
            dynamic: 't.bilibili.com',
            live: 'live.bilibili.com',
        },
        paths: {
            homepage: '/',
            article: '/read/cv',
            bangumi: '/bangumi/play/',
            video: '/video/',
        },
        storage: {
            dynamicWideDisabled: 'mbb-dynamic-wide-disabled',
            videoCropEnabled: 'mbb-video-crop-enabled',
            playbackFlag: 'bilibili_player_force_DolbyAtmos&8K&HDR',
            hdrFlag: 'bilibili_player_force_hdr',
            hevcError: 'enableHEVCError',
        },
        playbackCapabilityPaths: [
            '/watchlater',
            '/watchroom',
            '/medialist',
            '/list/',
            '/festival/',
            '/blackboard/',
        ],
        trackingParamRules: [
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
        ],
        userAgent: {
            safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
            platform: 'MacIntel',
        },
    };

    const page = {
        isHomepage() {
            return location.host === CONFIG.hosts.homepage && location.pathname === CONFIG.paths.homepage;
        },

        isDynamic() {
            return location.host === CONFIG.hosts.dynamic;
        },

        isArticle() {
            return location.host === CONFIG.hosts.homepage && location.pathname.startsWith(CONFIG.paths.article);
        },

        isLive() {
            return location.host === CONFIG.hosts.live;
        },

        isBangumi() {
            return location.host === CONFIG.hosts.homepage && location.pathname.startsWith(CONFIG.paths.bangumi);
        },

        isVideo() {
            return location.host === CONFIG.hosts.homepage && location.pathname.startsWith(CONFIG.paths.video);
        },

        needsPlaybackCapabilityPatch() {
            if (this.isVideo() || this.isBangumi() || this.isLive()) {
                return true;
            }

            if (location.host !== CONFIG.hosts.homepage) {
                return false;
            }

            return CONFIG.playbackCapabilityPaths.some(prefix => location.pathname.startsWith(prefix));
        },
    };

    const utils = {
        toArray(listLike) {
            return Array.from(listLike || []);
        },

        uniqueElements(list) {
            return this.toArray(new Set(list));
        },

        getPageWindow() {
            return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        },

        onBodyReady(callback) {
            if (document.body) {
                callback();
                return;
            }

            let hasRun = false;
            const runOnce = () => {
                if (hasRun || !document.body) {
                    return;
                }

                hasRun = true;
                callback();
            };

            document.addEventListener('DOMContentLoaded', runOnce, { once: true });

            const intervalId = setInterval(() => {
                if (hasRun) {
                    clearInterval(intervalId);
                    return;
                }

                if (document.body) {
                    clearInterval(intervalId);
                    runOnce();
                }
            }, 50);
        },

        observeAddedElements(onElement) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node instanceof HTMLElement) {
                            onElement(node);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
            return observer;
        },

        setNavigatorValue(propertyName, value) {
            const descriptor = Object.getOwnPropertyDescriptor(window.navigator, propertyName);
            if (descriptor && descriptor.configurable === false) {
                return;
            }

            Object.defineProperty(window.navigator, propertyName, {
                configurable: true,
                get() {
                    return value;
                },
            });
        },

        safeNotification(options) {
            if (typeof GM_notification === 'function') {
                GM_notification(options);
            }
        },
    };

    const urlTools = {
        shouldRemoveTrackingParam(paramName) {
            return CONFIG.trackingParamRules.some(rule => {
                if (rule instanceof RegExp) {
                    return rule.test(paramName);
                }
                return rule === paramName;
            });
        },

        removeTrackingParams(inputUrl) {
            if (!inputUrl) {
                return inputUrl;
            }

            let parsedUrl;
            try {
                parsedUrl = new URL(String(inputUrl), location.href);
            } catch (error) {
                return inputUrl;
            }

            let changed = false;
            utils.toArray(parsedUrl.searchParams.keys()).forEach(paramName => {
                if (this.shouldRemoveTrackingParam(paramName)) {
                    parsedUrl.searchParams.delete(paramName);
                    changed = true;
                }
            });

            if (!changed) {
                return inputUrl;
            }

            if (/^https?:/i.test(String(inputUrl))) {
                return parsedUrl.toString();
            }

            return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
        },
    };

    const modules = {
        playbackCdnAccelerator: {
            storageKey: 'biliAccelerator.config.v1',
            mediaPathPattern: /\.(m4s|mp4|flv|m3u8)(?:$|[?#])/i,
            ipPattern: /^(?:\d{1,3}\.){3}\d{1,3}$/,
            xyMcdnPattern: /^xy(?:\d+x){3}\d+xy\.mcdn\.bilivideo\.(?:cn|com|net)$/i,
            defaultConfig: Object.freeze({
                enabled: true,
                autoAdapt: true,
                adaptiveLevel: 0,
                mode: 'bad-only',
                pcdnHost: 'upos-sz-mirrorcos.bilivideo.com',
                mcdnStrategy: 'proxy-all',
                proxyHost: 'proxy-tf-all-ws.bilivideo.com',
                rewriteAkamai: false,
                maxDepth: 20,
            }),
            state: {
                rewrites: [],
                rewriteCount: 0,
                lastSource: '',
                playbackIssues: [],
                adaptiveReason: '',
                lastAdaptiveAt: 0,
            },
            config: null,
            nativeJsonParse: null,

            shouldRun() {
                return /(^|\.)bilibili\.(com|tv)$/i.test(location.hostname);
            },

            shouldMonitorPlayback() {
                return page.needsPlaybackCapabilityPatch() || location.hostname.endsWith('.bilibili.tv');
            },

            getBufferedAhead(video) {
                if (!(video instanceof HTMLVideoElement) || !video.buffered) {
                    return 0;
                }

                const currentTime = video.currentTime || 0;
                for (let index = 0; index < video.buffered.length; index += 1) {
                    const start = video.buffered.start(index);
                    const end = video.buffered.end(index);
                    if (currentTime >= start && currentTime <= end) {
                        return Math.max(0, end - currentTime);
                    }
                }

                return 0;
            },

            isLikelyRealPlaybackIssue(video, reason) {
                if (!(video instanceof HTMLVideoElement)) {
                    return false;
                }

                if (video.paused || video.ended || video.seeking || video.currentTime < 1) {
                    return false;
                }

                if (reason === 'error') {
                    return true;
                }

                const remaining = Number.isFinite(video.duration) ? video.duration - video.currentTime : 999;
                if (remaining < 8) {
                    return false;
                }

                return video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || this.getBufferedAhead(video) < 2.5;
            },

            recordPlaybackIssue(root, video, reason) {
                if (!this.config?.enabled || !this.config.autoAdapt || !this.shouldMonitorPlayback()) {
                    return;
                }

                if (!this.isLikelyRealPlaybackIssue(video, reason)) {
                    return;
                }

                const now = Date.now();
                this.state.playbackIssues.push({
                    at: now,
                    reason,
                    bufferedAhead: this.getBufferedAhead(video),
                    readyState: video.readyState,
                });
                this.state.playbackIssues = this.state.playbackIssues.filter(item => now - item.at <= 45000);

                const issueCount = this.state.playbackIssues.length;
                const hasHardFailure = reason === 'error';
                if (issueCount >= 3 || hasHardFailure) {
                    this.adaptPlaybackStrategy(root, `${reason}:${issueCount}`);
                }
            },

            adaptPlaybackStrategy(root, reason) {
                const now = Date.now();
                if (now - this.state.lastAdaptiveAt < 60000) {
                    return;
                }

                if (this.config.adaptiveLevel >= 1 && this.config.mode === 'force' && this.config.rewriteAkamai) {
                    return;
                }

                this.state.lastAdaptiveAt = now;
                this.state.adaptiveReason = reason;
                this.saveConfig(root, Object.assign({}, this.config, {
                    adaptiveLevel: 1,
                    mode: 'force',
                    mcdnStrategy: 'proxy-all',
                    rewriteAkamai: true,
                }));

                console.info('[Make Bilibili Better] playback CDN strategy escalated after stutter', {
                    reason,
                    config: this.config,
                });

                this.reloadPlaybackOnce(root, reason);
            },

            reloadPlaybackOnce(root, reason) {
                let markerKey = '';
                try {
                    markerKey = `mbb-accelerator-adapted:${location.origin}${location.pathname}${location.search}`;
                    if (root.sessionStorage.getItem(markerKey) === '1') {
                        return;
                    }
                    root.sessionStorage.setItem(markerKey, '1');
                } catch (error) {
                    // Continue without loop protection if sessionStorage is blocked.
                }

                setTimeout(() => {
                    try {
                        root.location.reload();
                    } catch (error) {
                        console.warn('[Make Bilibili Better] playback reload after CDN strategy change failed', reason, error);
                    }
                }, 800);
            },

            collectVideos(root = document) {
                const videos = [];

                if (root instanceof HTMLVideoElement) {
                    videos.push(root);
                }

                if (typeof root.querySelectorAll === 'function') {
                    videos.push(...root.querySelectorAll('video'));
                }

                return utils.uniqueElements(videos);
            },

            attachPlaybackMonitor(root, target = document) {
                this.collectVideos(target).forEach(video => {
                    if (!(video instanceof HTMLVideoElement) || video.dataset.mbbCdnMonitorBound === '1') {
                        return;
                    }

                    video.dataset.mbbCdnMonitorBound = '1';
                    video.addEventListener('waiting', () => this.recordPlaybackIssue(root, video, 'waiting'));
                    video.addEventListener('stalled', () => this.recordPlaybackIssue(root, video, 'stalled'));
                    video.addEventListener('error', () => this.recordPlaybackIssue(root, video, 'error'));

                    setInterval(() => {
                        if (!video.isConnected) {
                            return;
                        }

                        if (!video.paused && !video.ended && this.getBufferedAhead(video) < 1.5 && video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
                            this.recordPlaybackIssue(root, video, 'low-buffer');
                        }
                    }, 4000);
                });
            },

            normalizeConfig(config) {
                return Object.assign({}, this.defaultConfig, config || {});
            },

            loadConfig(root) {
                try {
                    const stored = root.localStorage.getItem(this.storageKey);
                    return this.normalizeConfig(stored ? JSON.parse(stored) : null);
                } catch (error) {
                    return this.normalizeConfig();
                }
            },

            saveConfig(root, nextConfig) {
                this.config = this.normalizeConfig(nextConfig);
                root.localStorage.setItem(this.storageKey, JSON.stringify(this.config));
            },

            hasBiliMediaSignal(value) {
                return typeof value === 'string'
                    && (
                        value.includes('bilivideo')
                        || value.includes('akamaized.net')
                        || value.includes('szbdyd.com')
                        || value.includes('/upgcxcode/')
                        || value.includes('/v1/resource/')
                    );
            },

            parseUrl(value) {
                if (!this.hasBiliMediaSignal(value)) {
                    return null;
                }

                try {
                    const url = new URL(value);
                    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                        return null;
                    }
                    return url;
                } catch (error) {
                    return null;
                }
            },

            isMediaUrl(url) {
                return this.mediaPathPattern.test(url.pathname + url.search)
                    || url.pathname.startsWith('/upgcxcode/')
                    || url.pathname.startsWith('/v1/resource/');
            },

            isMcdnHost(hostname) {
                return /\.mcdn\.bilivideo\.(?:cn|com|net)$/i.test(hostname);
            },

            isPcdnHost(url) {
                return this.ipPattern.test(url.hostname)
                    || this.xyMcdnPattern.test(url.hostname)
                    || this.isMcdnHost(url.hostname);
            },

            isBiliCdnHost(hostname) {
                return hostname.endsWith('.bilivideo.com')
                    || hostname.endsWith('.bilivideo.cn')
                    || hostname.endsWith('.bilivideo.net')
                    || hostname.endsWith('.akamaized.net');
            },

            isKnownSlowHost(url, config) {
                const hostname = url.hostname.toLowerCase();

                if (this.isPcdnHost(url) || hostname.endsWith('.szbdyd.com')) {
                    return true;
                }

                if (hostname.includes('mirroraliov') || hostname.includes('mirrorcosov') || hostname.includes('mirrorhwov')) {
                    return true;
                }

                return config.rewriteAkamai && hostname.endsWith('.akamaized.net');
            },

            cleanHost(host) {
                const trimmed = String(host || '').trim();
                return trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
            },

            replaceHost(url, host) {
                const cleanedHost = this.cleanHost(host);
                if (!cleanedHost) {
                    return url.toString();
                }

                const next = new URL(url.toString());
                next.protocol = 'https:';
                next.host = cleanedHost;
                if (!cleanedHost.includes(':')) {
                    next.port = '';
                }
                return next.toString();
            },

            proxyUrl(url, config) {
                const next = new URL(`https://${this.cleanHost(config.proxyHost)}/`);
                next.searchParams.set('url', url.toString());
                return next.toString();
            },

            shouldProxyMcdn(url, config) {
                if (!this.isMcdnHost(url.hostname)) {
                    return false;
                }

                if (config.mcdnStrategy === 'proxy-all') {
                    return true;
                }

                return config.mcdnStrategy === 'proxy-v1' && url.pathname.startsWith('/v1/resource/');
            },

            rewriteUrlDetail(value, rawConfig) {
                const config = this.normalizeConfig(rawConfig);
                const original = String(value || '');
                const url = this.parseUrl(original);

                if (!config.enabled || !url || !this.isMediaUrl(url) || url.hostname === this.cleanHost(config.proxyHost)) {
                    return {
                        changed: false,
                        original,
                        url: original,
                        reason: 'ignored',
                    };
                }

                if (url.hostname.endsWith('.szbdyd.com')) {
                    const source = url.searchParams.get('xy_usource');
                    if (source) {
                        const rewritten = this.replaceHost(url, source);
                        return {
                            changed: rewritten !== original,
                            original,
                            url: rewritten,
                            reason: 'szbdyd-source',
                            targetHost: this.cleanHost(source),
                        };
                    }
                }

                if (this.shouldProxyMcdn(url, config)) {
                    const rewritten = this.proxyUrl(url, config);
                    return {
                        changed: rewritten !== original,
                        original,
                        url: rewritten,
                        reason: 'mcdn-proxy',
                        targetHost: this.cleanHost(config.proxyHost),
                    };
                }

                const force = config.mode === 'force';
                if (this.isKnownSlowHost(url, config) || (force && this.isBiliCdnHost(url.hostname))) {
                    const rewritten = this.replaceHost(url, config.pcdnHost);
                    return {
                        changed: rewritten !== original,
                        original,
                        url: rewritten,
                        reason: this.isPcdnHost(url) ? 'pcdn-host' : 'cdn-host',
                        targetHost: this.cleanHost(config.pcdnHost),
                    };
                }

                return {
                    changed: false,
                    original,
                    url: original,
                    reason: 'ok',
                };
            },

            rewriteObject(value, rawConfig, state, depth, seen) {
                const config = this.normalizeConfig(rawConfig);
                const tracker = state || { changed: false, rewrites: [] };
                const level = depth || 0;
                const visited = seen || new WeakSet();

                if (!config.enabled || value == null || level > config.maxDepth) {
                    return value;
                }

                if (typeof value === 'string') {
                    const detail = this.rewriteUrlDetail(value, config);
                    if (detail.changed) {
                        tracker.changed = true;
                        tracker.rewrites.push(detail);
                    }
                    return detail.url;
                }

                if (typeof value !== 'object') {
                    return value;
                }

                if (visited.has(value)) {
                    return value;
                }
                visited.add(value);

                if (Array.isArray(value)) {
                    for (let index = 0; index < value.length; index += 1) {
                        value[index] = this.rewriteObject(value[index], config, tracker, level + 1, visited);
                    }
                    return value;
                }

                Object.keys(value).forEach(key => {
                    value[key] = this.rewriteObject(value[key], config, tracker, level + 1, visited);
                });

                return value;
            },

            rewritePayload(payload, source) {
                const tracker = { changed: false, rewrites: [] };

                try {
                    const rewritten = this.rewriteObject(payload, this.config, tracker);
                    this.record(tracker.rewrites, source);
                    return rewritten;
                } catch (error) {
                    console.warn('[Make Bilibili Better] playback CDN rewrite failed', error);
                    return payload;
                }
            },

            record(rewrites, source) {
                if (!rewrites || rewrites.length === 0) {
                    return;
                }

                this.state.lastSource = source;
                this.state.rewriteCount += rewrites.length;
                this.state.rewrites = this.state.rewrites.concat(rewrites.map(item => ({
                    at: new Date().toISOString(),
                    source,
                    reason: item.reason,
                    targetHost: item.targetHost,
                    from: item.original,
                    to: item.url,
                }))).slice(-50);

                this.renderStatus();
            },

            isInterestingFetch(input) {
                const url = typeof input === 'string' ? input : input?.url;
                return typeof url === 'string'
                    && (
                        url.includes('/x/player')
                        || url.includes('/pgc/player')
                        || url.includes('playurl')
                        || url.includes('bilivideo')
                    );
            },

            patchJsonParse(root) {
                if (!root.JSON || root.JSON.parse.__mbbAcceleratorPatched === '1') {
                    return;
                }

                const accelerator = this;
                root.JSON.parse = function patchedJsonParse(text) {
                    const parsed = accelerator.nativeJsonParse.apply(this, arguments);
                    if (typeof text === 'string' && text.includes('bilivideo')) {
                        return accelerator.rewritePayload(parsed, 'JSON.parse');
                    }
                    return parsed;
                };

                Object.defineProperty(root.JSON.parse, '__mbbAcceleratorPatched', {
                    configurable: true,
                    value: '1',
                });
            },

            patchFetch(root) {
                if (!root.fetch || root.fetch.__mbbAcceleratorPatched === '1') {
                    return;
                }

                const accelerator = this;
                const nativeFetch = root.fetch;
                root.fetch = function patchedFetch() {
                    const args = arguments;
                    return nativeFetch.apply(this, args).then(response => {
                        if (!accelerator.config.enabled || !accelerator.isInterestingFetch(args[0])) {
                            return response;
                        }

                        const contentType = response.headers?.get('content-type');
                        if (contentType && !contentType.includes('json') && !contentType.includes('text')) {
                            return response;
                        }

                        return response.clone().text().then(text => {
                            if (!text || !text.includes('bilivideo')) {
                                return response;
                            }

                            let parsed;
                            const tracker = { changed: false, rewrites: [] };
                            try {
                                parsed = accelerator.nativeJsonParse(text);
                                accelerator.rewriteObject(parsed, accelerator.config, tracker);
                            } catch (error) {
                                return response;
                            }

                            if (!tracker.changed) {
                                return response;
                            }

                            accelerator.record(tracker.rewrites, 'fetch');
                            const HeadersCtor = root.Headers || Headers;
                            const ResponseCtor = root.Response || Response;
                            const headers = new HeadersCtor(response.headers);
                            headers.delete('content-length');
                            return new ResponseCtor(JSON.stringify(parsed), {
                                status: response.status,
                                statusText: response.statusText,
                                headers,
                            });
                        }).catch(() => response);
                    });
                };

                Object.defineProperty(root.fetch, '__mbbAcceleratorPatched', {
                    configurable: true,
                    value: '1',
                });
            },

            patchGlobalPlayInfo(root, name) {
                let currentValue;
                const existing = Object.getOwnPropertyDescriptor(root, name);
                if (existing && existing.configurable === false) {
                    return;
                }

                if (existing && 'value' in existing) {
                    currentValue = this.rewritePayload(existing.value, name);
                }

                try {
                    Object.defineProperty(root, name, {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return currentValue;
                        },
                        set: value => {
                            currentValue = this.rewritePayload(value, name);
                        },
                    });
                } catch (error) {
                    if (root[name]) {
                        root[name] = this.rewritePayload(root[name], name);
                    }
                }
            },

            renderStatus() {
                // No UI is installed; status is available through MBBPlaybackAccelerator.getStats().
            },

            install() {
                const root = utils.getPageWindow();
                if (root.__MBB_BILI_ACCELERATOR_INSTALLED__) {
                    return;
                }
                root.__MBB_BILI_ACCELERATOR_INSTALLED__ = true;

                this.config = this.loadConfig(root);
                this.nativeJsonParse = root.JSON?.parse || JSON.parse;
                this.patchJsonParse(root);
                this.patchFetch(root);
                this.patchGlobalPlayInfo(root, '__playinfo__');
                this.patchGlobalPlayInfo(root, '__INITIAL_STATE__');

                root.MBBPlaybackAccelerator = {
                    getConfig: () => Object.assign({}, this.config),
                    setConfig: nextConfig => {
                        this.saveConfig(root, Object.assign({}, this.config, nextConfig || {}));
                        this.renderStatus();
                        return Object.assign({}, this.config);
                    },
                    getStats: () => JSON.parse(JSON.stringify(this.state)),
                    rewriteUrl: url => this.rewriteUrlDetail(url, this.config).url,
                };

                if (this.shouldMonitorPlayback()) {
                    utils.onBodyReady(() => {
                        this.attachPlaybackMonitor(root);
                        utils.observeAddedElements(node => this.attachPlaybackMonitor(root, node));
                    });
                }

                console.info('[Make Bilibili Better] adaptive playback CDN accelerator installed', root.MBBPlaybackAccelerator.getConfig());
            },
        },

        trackingCleanup: {
            shouldRun() {
                return true;
            },

            install() {
                const pageWindow = utils.getPageWindow();
                const { history } = pageWindow;
                const cleanedCurrentUrl = urlTools.removeTrackingParams(location.href);

                if (typeof cleanedCurrentUrl === 'string' && cleanedCurrentUrl !== location.href) {
                    history.replaceState(history.state, '', cleanedCurrentUrl);
                }

                const originalPushState = history.pushState.bind(history);
                history.pushState = function (state, unused, url) {
                    const cleanedUrl = typeof url === 'string' ? urlTools.removeTrackingParams(url) : url;
                    return originalPushState(state, unused, cleanedUrl);
                };

                const originalReplaceState = history.replaceState.bind(history);
                history.replaceState = function (state, unused, url) {
                    const cleanedUrl = typeof url === 'string' ? urlTools.removeTrackingParams(url) : url;
                    return originalReplaceState(state, unused, cleanedUrl);
                };
            },
        },

        playbackCapabilityUnlocks: {
            shouldRun() {
                return page.needsPlaybackCapabilityPatch();
            },

            install() {
                try {
                    localStorage.setItem(CONFIG.storage.playbackFlag, '1');
                    localStorage.setItem(CONFIG.storage.hdrFlag, '1');
                } catch (error) {
                    // Ignore storage write failures on restricted pages.
                }

                const storageProto = Object.getPrototypeOf(sessionStorage);
                if (storageProto && storageProto.__mbbHevcPatched !== '1') {
                    const originalGetItem = storageProto.getItem;
                    storageProto.getItem = function (key) {
                        if (this === sessionStorage && key === CONFIG.storage.hevcError) {
                            return undefined;
                        }
                        return originalGetItem.call(this, key);
                    };

                    Object.defineProperty(storageProto, '__mbbHevcPatched', {
                        configurable: true,
                        value: '1',
                    });
                }

                utils.setNavigatorValue('userAgent', CONFIG.userAgent.safariMac);
                utils.setNavigatorValue('platform', CONFIG.userAgent.platform);
            },
        },

        homepageCleanup: {
            shouldRun() {
                return page.isHomepage();
            },

            collectFeedCards(root = document) {
                const cards = [];

                if (root instanceof HTMLElement && root.matches('.feed-card, .bili-feed-card')) {
                    cards.push(root);
                }

                if (typeof root.querySelectorAll === 'function') {
                    cards.push(...root.querySelectorAll('.feed-card, .bili-feed-card'));
                }

                return utils.uniqueElements(cards);
            },

            hasAdMarkers(card) {
                return Boolean(
                    card.querySelector('a[href*="cm.bilibili.com"]')
                    || card.querySelector('.ad-report')
                );
            },

            isEmptyRecommendationCard(card) {
                const videoCard = card.matches('.bili-video-card')
                    ? card
                    : card.querySelector('.bili-video-card.is-rcmd');

                if (!(videoCard instanceof HTMLElement) || !videoCard.matches('.bili-video-card.is-rcmd')) {
                    return false;
                }

                if (videoCard.querySelector('.bili-video-card__wrap, .bili-video-card__info, .bili-video-card__image--link, .bili-video-card__skeleton')) {
                    return false;
                }

                const elementChildren = utils.toArray(videoCard.children);
                return elementChildren.length === 1 && elementChildren[0].tagName === 'DIV';
            },

            cleanup(root = document) {
                this.collectFeedCards(root).forEach(card => {
                    if (this.hasAdMarkers(card) || this.isEmptyRecommendationCard(card)) {
                        card.remove();
                    }
                });
            },

            install() {
                GM_addStyle([
                    '.feed2 .container > * { margin-top: 0 !important; }',
                    '.feed-card:has(a[href*="cm.bilibili.com"]) { display: none !important; }',
                    '.feed-card:has(.ad-report) { display: none !important; }',
                ].join('\n'));

                this.cleanup();

                let attempts = 0;
                const intervalId = setInterval(() => {
                    this.cleanup();
                    attempts += 1;
                    if (attempts >= 100) {
                        clearInterval(intervalId);
                    }
                }, 300);

                utils.observeAddedElements(node => this.cleanup(node));
            },
        },

        dynamicWideMode: {
            shouldRun() {
                return page.isDynamic();
            },

            isEnabled() {
                return localStorage.getItem(CONFIG.storage.dynamicWideDisabled) !== '1';
            },

            applyState(enabled) {
                document.documentElement.toggleAttribute('data-mbb-wide', enabled);
            },

            toggle() {
                const nextEnabled = !this.isEnabled();
                if (nextEnabled) {
                    localStorage.removeItem(CONFIG.storage.dynamicWideDisabled);
                } else {
                    localStorage.setItem(CONFIG.storage.dynamicWideDisabled, '1');
                }
                this.applyState(nextEnabled);
            },

            createButton() {
                const button = document.createElement('button');
                button.id = 'mbb-wide-mode-switch';
                button.type = 'button';
                button.className = 'mbb-wide-mode-switch';
                button.textContent = '宽屏';
                button.addEventListener('click', () => this.toggle());
                return button;
            },

            install() {
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

                this.applyState(this.isEnabled());

                if (!document.getElementById('mbb-wide-mode-switch')) {
                    document.body.appendChild(this.createButton());
                }
            },
        },

        articleCopy: {
            shouldRun() {
                return page.isArticle();
            },

            unlock(root = document) {
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
            },

            install() {
                document.addEventListener('copy', event => {
                    if (event.target instanceof Node && event.target.parentElement?.closest('.article-holder')) {
                        event.stopImmediatePropagation();
                    }
                }, true);

                this.unlock();
                utils.observeAddedElements(node => this.unlock(node));
            },
        },

        videoCropMode: {
            shouldRun() {
                return page.isVideo();
            },

            isEnabled() {
                return localStorage.getItem(CONFIG.storage.videoCropEnabled) === '1';
            },

            applyState(enabled) {
                document.body.toggleAttribute('data-mbb-video-crop', enabled);
            },

            setEnabled(enabled) {
                if (enabled) {
                    localStorage.setItem(CONFIG.storage.videoCropEnabled, '1');
                } else {
                    localStorage.removeItem(CONFIG.storage.videoCropEnabled);
                }
                this.applyState(enabled);
            },

            updateInput(input) {
                if (input instanceof HTMLInputElement) {
                    input.checked = this.isEnabled();
                }
            },

            createSwitchItem() {
                const item = document.createElement('div');
                item.className = 'bpx-player-ctrl-setting-fit-mode bui bui-switch';
                item.innerHTML = '<input class="bui-switch-input" type="checkbox"><label class="bui-switch-label"><span class="bui-switch-name">裁切模式</span><span class="bui-switch-body"><span class="bui-switch-dot"><span></span></span></span></label>';

                const input = item.querySelector('input');
                this.updateInput(input);
                input?.addEventListener('change', event => {
                    this.setEnabled(Boolean(event.target?.checked));
                });

                return item;
            },

            mountSwitch() {
                const existingInput = document.querySelector('.bpx-player-ctrl-setting-fit-mode input');
                if (existingInput) {
                    this.updateInput(existingInput);
                    return true;
                }

                const parent = document.querySelector('.bpx-player-ctrl-setting-menu-left');
                if (!(parent instanceof HTMLElement)) {
                    return false;
                }

                const item = this.createSwitchItem();
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
            },

            install() {
                GM_addStyle([
                    'body[data-mbb-video-crop] #bilibili-player video { object-fit: cover !important; }',
                    '.bpx-player-ctrl-setting-fit-mode { display: flex; width: 100%; height: 32px; line-height: 32px; }',
                    '.bpx-player-ctrl-setting-box .bui-panel-wrap, .bpx-player-ctrl-setting-box .bui-panel-item { min-height: 172px !important; }',
                ].join('\n'));

                this.applyState(this.isEnabled());

                let attempts = 0;
                const timer = setInterval(() => {
                    attempts += 1;
                    if (this.mountSwitch() || attempts >= 200) {
                        clearInterval(timer);
                    }
                }, 200);
            },
        },

        liveEnhancements: {
            shouldRun() {
                return page.isLive();
            },

            install() {
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
                    utils.safeNotification({
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

                    utils.uniqueElements(videos).forEach(video => {
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
                utils.observeAddedElements(node => attachVideoWatchers(node));
            },
        },

        bangumiEnhancements: {
            shouldRun() {
                return page.isBangumi();
            },

            install() {
                const attachVideoRecovery = root => {
                    const videos = [];

                    if (root instanceof HTMLVideoElement) {
                        videos.push(root);
                    }

                    if (typeof root.querySelectorAll === 'function') {
                        videos.push(...root.querySelectorAll('video'));
                    }

                    utils.uniqueElements(videos).forEach(video => {
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
                utils.observeAddedElements(node => attachVideoRecovery(node));
            },
        },
    };

    const startup = {
        earlyModules: [
            modules.playbackCdnAccelerator,
            modules.trackingCleanup,
            modules.playbackCapabilityUnlocks,
        ],

        bodyModules: [
            modules.homepageCleanup,
            modules.dynamicWideMode,
            modules.articleCopy,
            modules.videoCropMode,
            modules.liveEnhancements,
            modules.bangumiEnhancements,
        ],

        run(list) {
            list.forEach(module => {
                if (module.shouldRun()) {
                    module.install();
                }
            });
        },

        boot() {
            this.run(this.earlyModules);
            utils.onBodyReady(() => this.run(this.bodyModules));
        },
    };

    startup.boot();
})();
