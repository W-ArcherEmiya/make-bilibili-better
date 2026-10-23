// ==UserScript==
// @name         Make Bilibili Better（海外优化版）
// @namespace    local.make-bilibili-better
// @version      1.3.0
// @description  优化哔哩哔哩网页体验，支持海外播放地址优化，适合留学生和海外用户观看 B 站。
// @author       ArcherEmiya
// @license      MIT
// @match        https://*.bilibili.com/*
// @match        https://*.bilibili.tv/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_info
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = typeof GM_info !== 'undefined' ? GM_info.script.version : '1.3.0';

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
            hevcPatchEnabled: 'mbb-hevc-patch-enabled',
            safariUaPatchEnabled: 'mbb-safari-ua-patch-enabled',
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

    const settings = {
        key: 'mbb-settings-v1',
        defaults: { ads: true, spacing: true, goods: true, liveClean: true, capability: true },
        values: {},
        applied: {},
        listeners: new Set(),
        logs: [],
        issueCount: 0,
        storageError: false,
        read(key) {
            try { return localStorage.getItem(key); } catch { this.storageError = true; return null; }
        },
        write(key, value) {
            try { localStorage.setItem(key, value); return true; }
            catch { this.storageError = true; return false; }
        },
        load() {
            let saved = {};
            try { saved = JSON.parse(this.read(this.key) || '{}') || {}; } catch { /* Use defaults. */ }
            for (const [key, fallback] of Object.entries(this.defaults)) {
                this.values[key] = typeof saved[key] === 'boolean' ? saved[key] : fallback;
            }
            this.values.crop = this.read(CONFIG.storage.videoCropEnabled) === '1';
            this.values.wide = this.read(CONFIG.storage.dynamicWideDisabled) !== '1';
            this.values.hevc = this.read(CONFIG.storage.hevcPatchEnabled) === '1';
            this.values.safari = this.read(CONFIG.storage.safariUaPatchEnabled) === '1';
            this.applied = { ...this.values };
        },
        set(key, value) {
            const legacy = {
                crop: CONFIG.storage.videoCropEnabled, wide: CONFIG.storage.dynamicWideDisabled,
                hevc: CONFIG.storage.hevcPatchEnabled, safari: CONFIG.storage.safariUaPatchEnabled,
            };
            const next = { ...this.values, [key]: !!value };
            const saved = legacy[key]
                ? this.write(legacy[key], (key === 'wide' ? !value : value) ? '1' : '0')
                : this.write(this.key, JSON.stringify(next));
            if (!saved) { this.emit(); return false; }
            this.values = next;
            this.applyStyles();
            this.emit();
            return true;
        },
        applyStyles() {
            const root = document.documentElement;
            if (!root) return;
            for (const key of ['ads', 'spacing', 'goods', 'liveClean']) {
                root.toggleAttribute(`data-mbb-${key.toLowerCase()}`, this.values[key]);
            }
            root.toggleAttribute('data-mbb-home', page.isHomepage());
            root.toggleAttribute('data-mbb-wide', page.isDynamic() && this.values.wide);
            document.body?.toggleAttribute('data-mbb-video-crop', page.isVideo() && this.values.crop);
            const playerSwitch = document.querySelector('.bpx-player-ctrl-setting-fit-mode input');
            if (playerSwitch) playerSwitch.checked = this.values.crop;
        },
        emit() { this.listeners.forEach(listener => listener()); },
        log(message) {
            this.logs.unshift({ time: new Date().toISOString(), message });
            this.logs.length = Math.min(this.logs.length, 40);
            this.emit();
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
                if (!this.shouldMonitorPlayback()) {
                    return;
                }

                if (!this.isLikelyRealPlaybackIssue(video, reason)) {
                    return;
                }

                const now = Date.now();
                settings.issueCount += 1;
                settings.log(`检测到播放异常：${reason}`);
                if (!this.config?.enabled || !this.config.autoAdapt) return;
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
                settings.log('持续卡顿，切换至增强策略');
                const saved = this.saveConfig(root, Object.assign({}, this.config, {
                    adaptiveLevel: 1,
                    mode: 'force',
                    mcdnStrategy: 'proxy-all',
                    rewriteAkamai: true,
                }));
                if (!saved) return;

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
                const normalized = this.normalizeConfig(nextConfig);
                if (!settings.write(this.storageKey, JSON.stringify(normalized))) {
                    settings.emit();
                    return false;
                }
                this.config = normalized;
                settings.emit();
                return true;
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
                settings.emit();
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

                utils.onBodyReady(() => {
                    if (this.shouldMonitorPlayback()) this.attachPlaybackMonitor(root);
                    utils.observeAddedElements(node => {
                        if (this.shouldMonitorPlayback()) this.attachPlaybackMonitor(root, node);
                    });
                });

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
                    if (settings.values.capability) {
                        localStorage.setItem(CONFIG.storage.playbackFlag, '1');
                        localStorage.setItem(CONFIG.storage.hdrFlag, '1');
                    } else {
                        localStorage.removeItem(CONFIG.storage.playbackFlag);
                        localStorage.removeItem(CONFIG.storage.hdrFlag);
                    }
                } catch (error) {
                    // Ignore storage write failures on restricted pages.
                }

                let shouldPatchHevc = false;
                try {
                    shouldPatchHevc = localStorage.getItem(CONFIG.storage.hevcPatchEnabled) === '1';
                } catch (error) {
                    // Keep native error handling when preferences cannot be read.
                }
                const storageProto = shouldPatchHevc ? Object.getPrototypeOf(sessionStorage) : null;
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

                let shouldPatchSafariUa = false;
                try {
                    shouldPatchSafariUa = localStorage.getItem(CONFIG.storage.safariUaPatchEnabled) === '1';
                } catch (error) {
                    shouldPatchSafariUa = false;
                }

                if (shouldPatchSafariUa) {
                    utils.setNavigatorValue('userAgent', CONFIG.userAgent.safariMac);
                    utils.setNavigatorValue('platform', CONFIG.userAgent.platform);
                }
                settings.applied.capability = settings.values.capability;
                settings.applied.hevc = shouldPatchHevc;
                settings.applied.safari = shouldPatchSafariUa;
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
                    card.toggleAttribute('data-mbb-ad', this.hasAdMarkers(card));
                    if (this.isEmptyRecommendationCard(card)) {
                        card.remove();
                    }
                });
            },

            install() {
                GM_addStyle([
                    'html[data-mbb-home][data-mbb-spacing] .feed2 .container > * { margin-top: 0 !important; }',
                    'html[data-mbb-home][data-mbb-ads] [data-mbb-ad] { display: none !important; }',
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
                return settings.values.wide;
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
                    'html[data-mbb-goods] .bili-dyn-list__item:has(.bili-dyn-card-goods), html[data-mbb-goods] .bili-dyn-list__item:has(.bili-rich-text-module.goods) { display: none !important; }',
                ].join('\n'));

                this.applyState(this.isEnabled());

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
                return settings.values.crop;
            },

            applyState(enabled) {
                document.body.toggleAttribute('data-mbb-video-crop', enabled);
            },

            setEnabled(enabled) {
                settings.set('crop', enabled);
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
                    'html[data-mbb-liveclean] #welcome-area-bottom-vm { display: none !important; }',
                    'html[data-mbb-liveclean] .web-player-icon-roomStatus { display: none !important; }',
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
                    settings.log('直播多次播放失败，已提醒切换较低画质');
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
                            settings.log('番剧播放错误，尝试恢复一次');
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
        installed: new Set(),
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
                if (module.shouldRun() && !this.installed.has(module)) {
                    module.install();
                    this.installed.add(module);
                }
            });
        },

        boot() {
            settings.load();
            settings.applyStyles();
            this.run(this.earlyModules);
            utils.onBodyReady(() => {
                settings.applyStyles();
                this.run(this.bodyModules);
                installControlPanel();
                let route = location.href;
                setInterval(() => {
                    if (route === location.href) return;
                    route = location.href;
                    this.run(this.earlyModules);
                    this.run(this.bodyModules);
                    settings.applyStyles();
                    if (modules.playbackCdnAccelerator.shouldMonitorPlayback()) {
                        modules.playbackCdnAccelerator.attachPlaybackMonitor(utils.getPageWindow());
                    }
                    settings.emit();
                }, 750);
            });
        },
    };

    // BEGIN GENERATED CONTROL PANEL
/*
# Third-Party Notices

The control panel embeds icons from Lucide 0.468.0. The blue electrical effects are custom paths.

Source: https://github.com/lucide-icons/lucide

## Lucide

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## Feather

MIT License

Copyright (c) 2013-2022 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
    const CONTROL_PANEL_TEMPLATE = "<style>\n:host{font-family:Inter,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;color:#24272e;background:#f5f6f8;font-size:14px;letter-spacing:0;--pink:#ec618b;--line:#eceef1;--muted:#888e98}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #ec618b;outline-offset:3px}button{color:inherit}svg{width:18px;height:18px;flex-shrink:0}header.site{height:66px;background:white;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:30px;padding:0 36px}.brand{font-size:24px;font-weight:800;color:var(--pink)}.site nav{display:flex;gap:24px;color:#606773}.search{margin:auto;background:#f2f3f5;border-radius:6px;width:330px;padding:10px 15px;color:#969ba4}.avatar{border-radius:50%;background:#fce8ee;color:#c84870;width:34px;height:34px;display:grid;place-items:center}.workspace{max-width:1400px;margin:35px auto;padding:0 42px}.preview-bar{display:flex;align-items:center;gap:14px;margin-bottom:28px}.preview-bar strong{font-size:15px}.pill{font-size:11px;background:#fce8ee;color:#b6466a;border-radius:4px;padding:4px 7px}.preview-actions{margin-left:auto;display:flex;gap:8px}.command{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #dfe2e7;background:white;border-radius:5px;padding:8px 11px;font-size:12px;min-height:34px}.command:hover{background:#f5f6f8}.page-content{max-width:990px;margin-right:280px}h1{font-size:21px;line-height:1.5;margin:0 0 10px}.meta{font-size:12px;color:var(--muted);display:flex;gap:20px;margin-bottom:22px}.player{aspect-ratio:16/9;background:#20252b;position:relative;overflow:hidden;border-radius:5px}.player img{width:100%;height:100%;object-fit:cover}.player:after{content:\"\";position:absolute;inset:60% 0 0;background:linear-gradient(transparent,rgba(0,0,0,.65));pointer-events:none}.video-caption{position:absolute;left:30px;bottom:66px;color:white;font-size:24px;z-index:1;font-weight:600}.player-controls{position:absolute;bottom:0;left:0;right:0;padding:17px 20px;color:white;display:flex;align-items:center;gap:16px;z-index:2;font-size:12px}.player-controls button{background:none;border:0;color:inherit;padding:0;display:flex}.progress{position:absolute;top:0;left:20px;right:20px;height:3px;background:#ffffff55}.progress:before{content:\"\";display:block;width:28%;height:100%;background:#fb7299}.spacer{flex:1}.under-player{height:50px;background:white;display:flex;align-items:center;padding:0 20px;color:#9297a1;font-size:12px;border-bottom:1px solid var(--line)}.creator{display:flex;align-items:center;gap:12px;margin-top:28px}.creator .avatar{background:#e6efeb;color:#42735c;width:42px;height:42px}.creator small{display:block;color:var(--muted);margin-top:5px}.description{line-height:1.9;color:#737983;font-size:13px}.comments{border-top:1px solid #e2e5e9;margin-top:26px;padding-top:22px;font-weight:600}.comment-placeholder{margin-top:20px;height:72px;background:#eceef1;border-radius:5px}\n.dock{position:fixed;right:0;top:30%;border:1px solid #e6e8ec;border-right:0;background:white;box-shadow:0 3px 18px #2027350d;border-radius:7px 0 0 7px;padding:13px 9px;display:flex;align-items:center;flex-direction:column;gap:9px;z-index:10}.dock span{writing-mode:vertical-rl;font-size:12px}.dot{width:6px;height:6px;background:#26a67c;border-radius:50%;display:inline-block}.panel{position:fixed;top:98px;right:18px;width:354px;max-height:calc(100dvh - 118px);background:#fff;border:1px solid #e3e6eb;box-shadow:0 12px 48px #20273517;border-radius:8px;z-index:20;display:flex;flex-direction:column;overflow:hidden;transition:transform .2s,opacity .2s}.panel.closed{transform:translateX(calc(100% + 25px));opacity:0;pointer-events:none}.panel-head{display:flex;align-items:center;gap:10px;padding:19px 20px 16px}.logo{width:32px;height:32px;display:grid;place-items:center;background:#fce9ef;color:#df5680;border-radius:7px}.panel-title{font-weight:700;font-size:14px}.subtitle{font-size:10px;color:#9298a1;margin-top:4px}.icon-button{border:0;background:transparent;width:28px;height:28px;display:grid;place-items:center;border-radius:4px}.icon-button:hover{background:#f4f5f7}.tabs{display:flex;padding:0 20px;border-bottom:1px solid var(--line);gap:24px}.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:12px 0;font-size:12px;color:#868b95;display:flex;align-items:center;gap:6px}.tabs svg{width:15px;height:15px}.tabs button[aria-selected=true]{border-color:var(--pink);color:#d9517c;font-weight:600}.body{overflow:auto;flex:1;padding:0 20px}.tab-page[hidden]{display:none}.section{padding:19px 0;border-bottom:1px solid var(--line)}.section:last-child{border-bottom:0}.row{display:flex;align-items:center;justify-content:space-between;gap:14px}.label{font-size:13px;font-weight:600}.hint{font-size:11px;color:#9298a1;line-height:1.65;margin-top:5px}.toggle{appearance:none;width:32px;height:18px;background:#d9dde3;border-radius:12px;position:relative;flex-shrink:0;cursor:pointer;margin:0}.toggle:before{content:\"\";width:14px;height:14px;background:white;border-radius:50%;position:absolute;top:2px;left:2px;box-shadow:0 1px 3px #0002;transition:transform .15s}.toggle:checked{background:var(--pink)}.toggle:checked:before{transform:translateX(14px)}.toggle:disabled{opacity:.4;cursor:default}.section-heading{font-size:10px;font-weight:600;color:#939aa4;margin-bottom:12px}.segments{display:grid;grid-template-columns:repeat(3,1fr);background:#f3f4f6;border-radius:5px;padding:3px;margin:14px 0 9px;gap:3px}.segments button{font-size:11px;min-height:30px;border:0;background:transparent;border-radius:4px;color:#7c838e}.segments button[aria-pressed=true]{background:white;color:#d7537e;box-shadow:0 1px 4px #0000000d}.segments button:disabled{opacity:.45}.status{display:flex;align-items:center;gap:7px;font-size:11px;color:#288569;margin-top:14px}.status .tag{margin-left:auto;background:#eaf6f0;color:#3d8c6d;padding:3px 6px;border-radius:3px;font-size:10px}.stats{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.stat-number{font-size:23px;font-weight:600;font-variant-numeric:tabular-nums}.stat-number small{font-size:11px;color:#949aa3;font-weight:400;margin-left:4px}.stat-name{font-size:10px;color:#969ca5;margin-top:5px}.kv{display:flex;justify-content:space-between;font-size:11px;margin-top:14px;color:#939aa4;gap:16px}.kv span:last-child{color:#555e6c;text-align:right;overflow-wrap:anywhere}.warning{background:#fff7e8;border-left:2px solid #e6b55f;padding:9px 10px;color:#986d24;font-size:11px;line-height:1.65;margin-top:12px}.footer{padding:13px 20px;border-top:1px solid var(--line);display:flex;align-items:center;gap:8px;background:#fcfcfd;flex-shrink:0}.footer span{font-size:10px;color:#969ca5}.footer .command{margin-left:auto;padding:5px 8px;min-height:28px;font-size:10px}.feature-row{padding:11px 0}.badge{font-size:10px;color:#9298a1}.log{padding:12px 0;border-bottom:1px solid var(--line);font-size:11px;line-height:1.6}.log time{color:#9aa0a8;font-size:10px;display:block}.diagnostic-actions{display:flex;gap:8px;margin:17px 0}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#30343d;color:white;border-radius:6px;padding:11px 18px;font-size:12px;z-index:40;max-width:90%;text-align:center}.toast[hidden]{display:none}.full-preview .site,.full-preview .preview-bar,.full-preview .panel,.full-preview .dock{display:none}.full-preview .workspace{margin:0;padding:0;max-width:none}.full-preview .page-content{margin:0;max-width:none}.full-preview .page-content> :not(.player){display:none}.full-preview .player{height:100dvh;border-radius:0}.full-preview .player img{object-fit:contain}.full-preview .player-controls{background:#0006}.pending{margin-top:12px;color:#bc7135;font-size:11px}dialog{border:1px solid #e1e4e8;border-radius:8px;max-width:calc(100% - 32px);width:330px;padding:22px}dialog::backdrop{background:#20273544}dialog h2{font-size:16px;margin:0 0 10px}dialog p{font-size:12px;line-height:1.8;color:#747c88}dialog .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.primary{background:#eb638c;color:#fff;border-color:#eb638c}\n@media(min-width:1500px){.page-content{margin-right:320px}}@media(max-width:900px){.site nav{display:none}.workspace{padding:0 22px}.page-content{margin-right:0}.panel{right:12px}.preview-bar{flex-wrap:wrap}.preview-actions{margin-left:0}.search{width:auto;flex:1}.site{gap:15px!important;padding:0 20px!important}}@media(max-width:480px){.panel{top:80px;right:10px;width:calc(100% - 20px);max-height:calc(100dvh - 94px)}.site .search{font-size:11px}.brand{font-size:20px}.workspace{margin-top:22px;padding:0 16px}.preview-bar{gap:8px;margin-bottom:20px}.preview-actions{width:100%;flex-wrap:wrap}.video-caption{font-size:17px;bottom:50px;left:18px}h1{font-size:17px}.meta{gap:12px;font-size:10px}.body{padding:0 18px}.panel-head{padding:15px 18px}.section{padding:16px 0}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}\n[hidden]{display:none!important}\n.preview-actions{margin-left:12px}\n@media(max-width:900px){.preview-actions{margin-left:0}}\n\n\n:host{--blue:#00aeec;--blue-ink:#007eac;--pink:#fb7299}\nbutton:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}\n.panel{height:auto;max-height:min(520px,calc(100dvh - 118px))}\n.panel .body{flex:0 1 auto}\n@media(max-width:480px){.panel{max-height:min(520px,calc(100dvh - 94px))}}\n.panel-head,.tabs{flex-shrink:0}\n.panel .body{min-height:0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#cbd5db transparent;scrollbar-gutter:stable}\n.panel .section{padding:16px 0}\n.logo{background:#e5f7fe;color:var(--blue)}\n.tabs button[aria-selected=true]{color:var(--blue-ink);border-color:var(--blue)}\n.toggle:checked{background:var(--blue)}\n.segments button[aria-pressed=true]{color:var(--blue-ink);background:#e5f7fe;box-shadow:none}\n.primary{background:var(--blue);border-color:var(--blue);color:#102f3e}\n.primary:hover{background:#62d0f7}\n.dock{color:var(--blue-ink)}\n.panel .hint,.panel .section-heading,.panel .kv{color:#747b85}\n.compact-row{min-height:62px}\n.compact-row+.compact-row{border-top:1px solid var(--line)}\n.panel .compact-section{padding:0}\n.advanced summary,.records summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;min-height:24px}\nsummary::-webkit-details-marker{display:none}\nsummary svg{width:14px;height:14px;color:#8a929c;transition:transform .15s}\ndetails[open]>summary svg{transform:rotate(90deg)}\n.summary-state{margin-left:auto;font-size:10px;font-weight:400;color:#848c96}\n.summary-state.pending-state{color:#ab7118}\n.advanced-content{padding-top:16px}\n.footer{height:54px;padding:10px 18px}\n.footer .command{font-size:11px;min-height:30px}\n.footer-note{display:flex;align-items:center;gap:6px;white-space:nowrap}\n.footer .command:hover{color:var(--blue-ink);border-color:var(--blue)}\n.panel .status .tag{background:#e5f7fe;color:var(--blue-ink)}\n.scene-picker{display:flex;align-items:center;gap:6px;font-size:12px;color:#747b85}\n.scene-picker select{max-width:150px;min-height:34px;border:1px solid #dfe2e7;border-radius:5px;background:white;padding:5px;color:#24272e}\n.preview-bar,.preview-actions{flex-wrap:wrap}\n.feature-status .kv{align-items:flex-start;line-height:1.6}\n.feature-status .kv span:first-child{flex:1}\n.feature-status .kv span:last-child{max-width:55%}\n:host{--yellow:#ffdc62;--rose:#fb7299}\n.panel{border-color:#dcecf3;box-shadow:0 12px 38px #007eac17}\n.panel-head{background:#f3fbff;position:relative}\n.logo{background:#fff5c9;border:1px solid #ffe58a;transform:rotate(-5deg);color:#a46d00}\n.logo svg{fill:var(--yellow);width:22px;height:22px;stroke-width:1.8}\n.panel-head .logo>svg[data-lucide=\"zap\"],.dock .dock-bolt>svg[data-lucide=\"zap\"]{fill:#ffdc62;stroke:#c18a22;stroke-width:1.2;filter:drop-shadow(0 0 2px #fff2a680)}\n.panel-title{color:#24465a;font-size:13px;display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 7px;min-width:0;flex:1;line-height:1.5}\n.panel-title .title-name{white-space:nowrap}\n.panel-title .version{font-size:11px;font-weight:400;color:#747b85;white-space:nowrap}\n.panel-head .logo,.panel-head #close{flex-shrink:0}\n.toast{top:12px;bottom:auto;max-width:calc(100vw - 24px);max-height:56px;padding:8px 14px;overflow:hidden;pointer-events:none}\n.panel-head .logo{position:relative;isolation:isolate}\n.panel-head .logo .header-electric{position:absolute;inset:-6px;width:44px;height:44px;opacity:0;fill:none;stroke:#5dd8ff;stroke-width:1.6;pointer-events:none;filter:drop-shadow(0 0 2px #b4f1ff)}\n.panel-head .logo.is-charged{animation:header-bolt-pop .25s ease-out}\n.panel-head .logo.is-charged .header-electric{animation:header-bolt-arc .25s ease-out}\n@keyframes header-bolt-pop{0%,100%{transform:rotate(-5deg) scale(1)}40%{transform:rotate(5deg) scale(1.12)}70%{transform:rotate(-8deg) scale(1.04)}}\n@keyframes header-bolt-arc{0%,100%{opacity:0}25%{opacity:1}55%{opacity:.35}75%{opacity:.85}}\n@media(prefers-reduced-motion:reduce){.panel-head .logo.is-charged,.panel-head .logo.is-charged .header-electric{animation:none}}\n.panel .tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;padding:0;background:#fff}\n.panel .tabs button{justify-content:center;width:100%;min-width:0}\n.tabs button[aria-selected=true]{border-bottom-width:3px}\n.tabs button[aria-selected=true] svg{stroke-width:2.4}\n.segments{background:#f4f7fa}\n.segments button[data-mode=force][aria-pressed=true]{background:#fff3c2;color:#865d00}\n.segments button[data-mode=gentle][aria-pressed=true]{background:#ffeaf1;color:#b84769}\n#crop:checked,#wide:checked{background:var(--rose)}\n.advanced summary:hover{color:var(--blue-ink)}\n.panel .footer{background:#f5fbfe}\n.panel .pill{background:#fff4c6;color:#866100}\n.stat-number{color:var(--blue-ink)}\n#issues{color:#bc4c70}\n.dock{width:44px;min-height:94px;padding:12px 7px;gap:9px;border:1px solid #b6e7f7;border-right:0;background:#eefaff;box-shadow:0 4px 16px #00aeec20;transition:background .2s}\n.dock:hover{background:#dff5ff}\n.dock .dock-bolt{display:grid;place-items:center;position:relative;width:28px;height:32px;writing-mode:horizontal-tb}\n.dock-bolt svg{width:27px;height:30px;fill:var(--yellow);stroke:#b88300;stroke-width:1.5;transform-origin:50% 60%;animation:bolt-wiggle 4.8s ease-in-out infinite}\n.dock-bolt:after{content:\"\";position:absolute;right:-1px;top:0;width:5px;height:5px;background:var(--rose);border-radius:1px;transform:rotate(45deg);animation:spark 4.8s ease-in-out infinite}\n.dock .dock-label{font-size:11px;color:#35748c;font-weight:600}\n.dock:hover .dock-bolt svg{filter:drop-shadow(0 0 3px #ffd54c80)}\n@keyframes bolt-wiggle{0%,72%,100%{transform:rotate(-7deg) translateY(0)}78%{transform:rotate(8deg) translateY(-2px)}84%{transform:rotate(-10deg) translateY(0)}90%{transform:rotate(3deg) translateY(-1px)}}\n@keyframes spark{0%,72%,100%{opacity:.25;transform:rotate(45deg) scale(.7)}81%,90%{opacity:1;transform:rotate(45deg) scale(1)}}\n@media(prefers-reduced-motion:reduce){.dock-bolt svg,.dock-bolt:after{animation:none}}\n.label-with-help{display:flex;align-items:center;gap:6px}\n.label-with-help .icon-button{color:#778792}\n#mode-help:focus:not(:focus-visible){outline:none;box-shadow:none}\n#mode-help:focus-visible{outline:1px dashed #778792;outline-offset:2px}\n.feature-help:focus:not(:focus-visible){outline:none;box-shadow:none}\n.feature-help:focus-visible{outline:1px dashed #778792;outline-offset:2px}\n#mode-hint{position:fixed;z-index:30;width:max-content;max-width:calc(100vw - 32px);margin:0;padding:12px 16px;background:#fff;border:1px solid #dce8ee;border-radius:8px;box-shadow:0 6px 24px #24465a24;color:#53636e;font-size:12px;line-height:1.75;overflow-wrap:anywhere;text-align:left;letter-spacing:0;word-spacing:normal;white-space:pre-line}\n.label-with-help svg{width:16px;height:16px}\n.panel .label{font-size:14px}\n.panel .hint,.panel .warning,.panel .pending,.panel .kv{font-size:12px;line-height:1.7}\n.panel .summary-state,.panel .section-heading,.panel .footer span{font-size:11px;color:#6c7781}\n.panel .tabs button,.segments button{font-size:13px}\n.compact-row{min-height:40px;padding:6px 0}\n.compact-row+.compact-row{border-top:0}\n#settings>.section:first-child{padding:12px 0}\n#settings .segments{margin:12px 0 0}\n#settings .section:has(>details){padding:0}\n#settings details>summary{min-height:40px;padding:8px 0}\n#settings details .compact-row{min-height:40px;padding:6px 0}\n#settings .advanced-content{padding:0 0 12px}\n#feature-groups details>div{padding-bottom:12px}\n#settings .warning,#settings .pending{margin-top:8px}\n#crop:checked,#wide:checked{background:var(--blue)}\n.dock{min-height:52px;height:52px;width:44px;padding:9px 7px}\n.dock,.dock:hover{background:transparent;border:0;border-radius:0;box-shadow:none}\n.dock-bolt:after{content:none}\n.dock{overflow:visible;isolation:isolate}\n.electric-field{position:absolute;inset:-8px;pointer-events:none;opacity:0;width:44px;height:48px}\n.electric-field path{fill:none;stroke:#68d9ff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 2px #00aeec)}\n.electric-field .arc-core{stroke:#f3fdff;stroke-width:.7}\n.dock:hover .electric-field,.dock:focus-visible .electric-field{animation:arc-charge .65s ease-out 1}\n.dock .dock-bolt .electric-field{width:44px;height:48px;fill:none;transform:none;animation:none;stroke:none;filter:none}\n.dock:hover .dock-bolt .electric-field,.dock:focus-visible .dock-bolt .electric-field{animation:arc-charge .65s ease-out 1}\n.dock.discharging .dock-bolt .electric-field{animation:arc-discharge .24s ease-out 1}\n.dock.discharging .dock-bolt>svg:not(.electric-field){filter:drop-shadow(0 0 5px #56d7ff)}\n.dock .discharge-beam{position:absolute;right:20px;top:17px;width:88px;height:18px;overflow:visible;opacity:0;pointer-events:none;fill:none}\n.discharge-beam path{stroke:#56d7ff;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 3px #00aeec)}\n.discharge-beam .beam-core{stroke:#effcff;stroke-width:.8;filter:none}\n.dock.discharging .discharge-beam{animation:discharge-trace .24s ease-out both}\n@keyframes arc-charge{0%,100%{opacity:0}16%{opacity:.85;transform:scale(.92)}32%{opacity:.15}45%{opacity:1;transform:scale(1)}70%{opacity:.35}82%{opacity:.7}}\n@keyframes arc-discharge{0%{opacity:1;transform:scale(.9)}50%{opacity:1;transform:scale(1.12)}100%{opacity:0;transform:scale(1.2)}}\n@keyframes discharge-trace{0%{opacity:0;clip-path:inset(-8px 0 -8px 100%)}35%{opacity:1;clip-path:inset(-8px 0 -8px 0)}65%{opacity:.9}100%{opacity:0;clip-path:inset(-8px 0 -8px 0)}}\n.dock-bolt svg,.dock-bolt:after{animation:none}\n.dock:hover .dock-bolt svg,.dock:focus-visible .dock-bolt svg{animation:bolt-wiggle 1s ease-in-out 1}\n.dock:hover .dock-bolt:after,.dock:focus-visible .dock-bolt:after{animation:spark 1s ease-in-out 1}\n@media(prefers-reduced-motion:reduce){.dock:hover .dock-bolt svg,.dock:focus-visible .dock-bolt svg,.dock:hover .dock-bolt:after,.dock:focus-visible .dock-bolt:after{animation:none}}\n@media(prefers-reduced-motion:reduce){.dock .dock-bolt .electric-field,.dock:hover .dock-bolt .electric-field,.dock:focus-visible .dock-bolt .electric-field,.dock.discharging .dock-bolt .electric-field,.dock.discharging .discharge-beam{animation:none;opacity:0}}\n@media(max-height:480px){.panel{top:12px;max-height:min(520px,calc(100dvh - 24px))}}\n.panel{width:320px;max-width:calc(100vw - 20px)}\n.panel-head{padding:12px 16px}\n.panel .body{padding:0 16px}\n.panel .footer{padding:10px 16px}\n.dock{touch-action:none;user-select:none;cursor:grab}\n.dock.dragging{cursor:grabbing}\n.dock.dragging .dock-bolt svg{animation:none!important}\n.dock.dragging .electric-field{opacity:0!important}\n\n:host{all:initial;font-family:Inter,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;font-size:14px;color:#24272e;letter-spacing:0}button,input,summary{font:inherit} .dock,.panel{pointer-events:auto} .panel[hidden]{display:none!important} .toast{position:absolute;top:auto;bottom:62px;left:12px;right:12px;transform:none;max-width:none;max-height:none;font-size:12px;z-index:40} .mode-current-note{font-size:12px;color:#747b85;margin-top:8px}</style><button class=\"dock\" id=\"dock\" title=\"打开调控台\" aria-label=\"打开调控台\" hidden=\"\"><span class=\"dock-bolt\" aria-hidden=\"true\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"zap\" class=\"lucide lucide-zap\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg><svg class=\"electric-field\" viewBox=\"0 0 44 48\"><path d=\"M14 3 8 10 13 14 4 22 10 24 6 32 M30 4 36 12 31 17 40 24 34 29 39 36 M15 34 11 40 19 39 23 46\"></path><path class=\"arc-core\" d=\"M14 3 8 10 13 14 4 22 10 24 6 32 M30 4 36 12 31 17 40 24 34 29 39 36 M15 34 11 40 19 39 23 46\"></path></svg></span><svg class=\"discharge-beam\" viewBox=\"0 0 116 32\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><path d=\"M116 16 L109 4 L103 29 L97 6 L91 26 L85 8 L79 24 L73 10 L67 22 L61 11 L55 21 L49 12 L43 20 L37 13 L31 19 L25 14 L19 18 L13 15 L7 17 L0 16\"></path><path class=\"beam-core\" d=\"M116 16 L109 4 L103 29 L97 6 L91 26 L85 8 L79 24 L73 10 L67 22 L61 11 L55 21 L49 12 L43 20 L37 13 L31 19 L25 14 L19 18 L13 15 L7 17 L0 16\"></path></svg></button><aside class=\"panel\" id=\"panel\" aria-label=\"Make Bilibili Better调控台\">\n <div class=\"panel-head\"><div class=\"logo\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"zap\" class=\"lucide lucide-zap\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg><svg viewBox=\"0 0 44 48\" class=\"header-electric\" aria-hidden=\"true\"><path d=\"M14 3 8 10 13 14 4 22 10 24 6 32 M30 4 36 12 31 17 40 24 34 29 39 36 M15 34 11 40 19 39 23 46\"></path><path class=\"arc-core\" d=\"M14 3 8 10 13 14 4 22 10 24 6 32 M30 4 36 12 31 17 40 24 34 29 39 36 M15 34 11 40 19 39 23 46\"></path></svg></div><div class=\"panel-title\"><span class=\"title-name\">Make Bilibili Better</span><span class=\"version\"></span></div><button class=\"icon-button\" id=\"close\" title=\"收起\" aria-label=\"收起\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"chevron-right\" class=\"lucide lucide-chevron-right\"><path d=\"m9 18 6-6-6-6\"></path></svg></button></div>\n <div class=\"tabs\" role=\"tablist\"><button role=\"tab\" id=\"tab-settings\" aria-controls=\"settings\" aria-selected=\"true\" data-tab=\"settings\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"sliders-horizontal\" class=\"lucide lucide-sliders-horizontal\"><line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\"></line><line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\"></line><line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\"></line><line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\"></line><line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\"></line><line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\"></line><line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\"></line><line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\"></line><line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\"></line></svg>功能设置</button><button role=\"tab\" id=\"tab-current\" aria-controls=\"current\" aria-selected=\"false\" data-tab=\"current\" tabindex=\"-1\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"activity\" class=\"lucide lucide-activity\"><path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"></path></svg>当前页面</button></div>\n <div class=\"body\">\n  <div class=\"tab-page\" id=\"settings\" role=\"tabpanel\" aria-labelledby=\"tab-settings\">\n   <section class=\"section\"><div class=\"row\"><div class=\"label-with-help\"><label class=\"label\" for=\"enabled\">播放地址优化</label><button class=\"icon-button feature-help\" id=\"mode-help\" aria-label=\"查看策略说明\" aria-expanded=\"false\" aria-controls=\"mode-hint\" aria-describedby=\"mode-hint\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div><input class=\"toggle\" type=\"checkbox\" id=\"enabled\" checked=\"\"></div><div class=\"segments\" aria-label=\"优化策略\"><button data-mode=\"auto\" aria-pressed=\"true\">自动</button><button data-mode=\"gentle\" aria-pressed=\"false\">温和</button><button data-mode=\"force\" aria-pressed=\"false\">增强</button></div><div class=\"hint\" id=\"mode-hint\" hidden=\"\" role=\"tooltip\">持续卡顿时自动增强优化。</div></section>\n   <section class=\"section compact-section\"><div class=\"row compact-row\"><div><div class=\"label-with-help\"><label class=\"label\" for=\"crop\">裁切模式</label><button id=\"crop-help\" class=\"icon-button feature-help\" type=\"button\" data-help=\"填满画面，可能裁掉边缘。\" aria-label=\"裁切模式说明\" aria-describedby=\"mode-hint\" aria-expanded=\"false\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div></div><input class=\"toggle\" type=\"checkbox\" id=\"crop\"></div><div class=\"row compact-row\"><label class=\"label\" for=\"wide\">动态宽屏</label><input type=\"checkbox\" class=\"toggle\" id=\"wide\" checked=\"\"></div></section>\n   <div id=\"feature-groups\"><section class=\"section\"><details class=\"advanced\"><summary class=\"label\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"chevron-right\" class=\"lucide lucide-chevron-right\"><path d=\"m9 18 6-6-6-6\"></path></svg>页面净化<span class=\"summary-state\" data-group=\"页面净化\">4 / 4 已开启</span></summary><div data-options=\"页面净化\"><div class=\"row compact-row\"><div><label class=\"label\" for=\"feature-ads\">首页广告清理</label></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-ads\"></div><div class=\"row compact-row\"><div><label class=\"label\" for=\"feature-spacing\">推荐间距优化</label></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-spacing\"></div><div class=\"row compact-row\"><div><label class=\"label\" for=\"feature-goods\">动态带货内容隐藏</label></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-goods\"></div><div class=\"row compact-row\"><div><div class=\"label-with-help\"><label class=\"label\" for=\"feature-liveClean\">直播界面精简</label><button id=\"feature-liveClean-help\" class=\"icon-button feature-help\" type=\"button\" data-help=\"隐藏欢迎区和部分状态图标，保留聊天区。\" aria-label=\"直播界面精简说明\" aria-describedby=\"mode-hint\" aria-expanded=\"false\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-liveClean\"></div></div></details></section></div>\n   <section class=\"section\"><details class=\"advanced\" id=\"advanced\"><summary class=\"label\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"chevron-right\" class=\"lucide lucide-chevron-right\"><path d=\"m9 18 6-6-6-6\"></path></svg>高级兼容设置<span class=\"summary-state\" id=\"advanced-state\">1 / 3已开启</span></summary><div class=\"advanced-content\"><div id=\"compatibility-options\"><div class=\"row compact-row\"><div><div class=\"label-with-help\"><label class=\"label\" for=\"feature-capability\">高画质能力声明</label><button id=\"feature-capability-help\" class=\"icon-button feature-help\" type=\"button\" data-help=\"声明杜比/8K/HDR能力，仍需设备支持和相应权限。需刷新。\" aria-label=\"高画质能力声明说明\" aria-describedby=\"mode-hint\" aria-expanded=\"false\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-capability\"></div><div class=\"row compact-row\"><div><div class=\"label-with-help\"><label class=\"label\" for=\"feature-hevc\">HEVC错误标记兼容</label><button id=\"feature-hevc-help\" class=\"icon-button feature-help\" type=\"button\" data-help=\"忽略HEVC错误标记，可能影响解码降级。需刷新。\" aria-label=\"HEVC错误标记兼容说明\" aria-describedby=\"mode-hint\" aria-expanded=\"false\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div></div><input type=\"checkbox\" class=\"toggle\" id=\"feature-hevc\"></div><div class=\"warning\" id=\"hint-hevc\" hidden=\"\">可能影响播放器解码降级。</div></div><div class=\"row compact-row\"><div><div class=\"label-with-help\"><label class=\"label\" for=\"safari\">Safari UA伪装</label><button id=\"safari-help\" class=\"icon-button feature-help\" type=\"button\" data-help=\"伪装为Safari，可能导致鼠标或点击异常。需刷新。\" aria-label=\"Safari UA伪装说明\" aria-describedby=\"mode-hint\" aria-expanded=\"false\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"info\" class=\"lucide lucide-info\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"M12 16v-4\"></path><path d=\"M12 8h.01\"></path></svg></button></div></div><input class=\"toggle\" type=\"checkbox\" id=\"safari\"></div><div class=\"warning\" id=\"ua-warning\" hidden=\"\">可能导致鼠标隐藏或点击异常。</div><div class=\"pending\" id=\"pending\" hidden=\"\">兼容性设置待应用 <button class=\"command\" id=\"apply\">刷新应用</button></div></div></details></section>\n  </div>\n  <div class=\"tab-page\" id=\"current\" role=\"tabpanel\" aria-labelledby=\"tab-current\" hidden=\"\">\n   <section class=\"section\"><div class=\"row\"><span class=\"label\">视频播放页</span></div><div class=\"status\"><b class=\"dot\"></b><span id=\"status-text\">正在监测播放</span><span class=\"tag\" id=\"strategy\">温和策略</span></div><div class=\"stats\"><div><div class=\"stat-number\" id=\"rewrites\">12<small>次</small></div><div class=\"stat-name\">地址优化</div></div><div><div class=\"stat-number\" id=\"issues\">0<small>次</small></div><div class=\"stat-name\">卡顿记录</div></div></div></section>\n   <section class=\"section feature-status\"><div class=\"section-heading\">当前页面功能</div><div class=\"kv\"><span>播放地址优化</span><span id=\"diagnostic-mode\">自动 · 温和策略</span></div><div class=\"kv\"><span>视频裁切</span><span id=\"crop-state\">未开启</span></div><div class=\"kv\"><span>Safari UA伪装</span><span id=\"diagnostic-ua\">未开启</span></div><div id=\"extra-status\"></div></section>\n   <section class=\"section\"><details class=\"records\"><summary class=\"label\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"chevron-right\" class=\"lucide lucide-chevron-right\"><path d=\"m9 18 6-6-6-6\"></path></svg>本次记录</summary><div id=\"logs\" aria-live=\"polite\"></div><div class=\"diagnostic-actions\"><button class=\"command\" id=\"clear\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"trash-2\" class=\"lucide lucide-trash-2\"><path d=\"M3 6h18\"></path><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"></path><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\"></path><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\"></line><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\"></line></svg>清空记录</button></div></details></section>\n  </div>\n </div><div class=\"toast\" role=\"status\" id=\"toast\" hidden=\"\"></div><footer class=\"footer\"><span class=\"footer-note\">设置自动保存</span><button class=\"command\" id=\"reset\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"rotate-ccw\" class=\"lucide lucide-rotate-ccw\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"></path><path d=\"M3 3v5h5\"></path></svg>恢复默认</button><button class=\"command\" id=\"copy\" hidden=\"\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-lucide=\"copy\" class=\"lucide lucide-copy\"><rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"></rect><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"></path></svg>复制诊断信息</button></footer>\n</aside><dialog id=\"reset-dialog\"><h2>恢复默认设置？</h2><p>恢复全部默认设置，清空本次统计。已应用的兼容性补丁需刷新后恢复。</p><div class=\"actions\"><button class=\"command\" id=\"cancel-reset\">取消</button><button class=\"command primary\" id=\"confirm-reset\">恢复默认</button></div></dialog>\n";
    function installControlPanel() {
        if (document.getElementById('mbb-control-panel')) return;
        const host = document.createElement('div');
        host.id = 'mbb-control-panel';
        host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;';
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = CONTROL_PANEL_TEMPLATE;
        root.querySelector('style').textContent += '\n.panel,.dock,dialog{font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;letter-spacing:0}dialog{pointer-events:auto}';
        root.querySelector('style').textContent += '\n.toast{position:fixed;top:12px;bottom:auto;left:50%;right:auto;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);max-height:56px;pointer-events:none}';
        document.documentElement.append(host);
        const $ = id => root.getElementById(id);
        const all = selector => [...root.querySelectorAll(selector)];
        const accelerator = modules.playbackCdnAccelerator;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const refreshKeys = ['capability', 'hevc', 'safari'];
        const labels = {
            enabled: '播放地址优化', crop: '裁切模式', wide: '动态宽屏', ads: '首页广告清理',
            spacing: '推荐间距优化', goods: '动态带货内容隐藏', liveClean: '直播界面精简',
            capability: '高画质能力声明', hevc: 'HEVC错误标记兼容', safari: 'Safari UA伪装',
        };
        const inputIds = { enabled: 'enabled', crop: 'crop', wide: 'wide', safari: 'safari',
            ads: 'feature-ads', spacing: 'feature-spacing', goods: 'feature-goods',
            liveClean: 'feature-liveClean', capability: 'feature-capability', hevc: 'feature-hevc' };
        const strategyHelp = {
            auto: '持续卡顿时自动增强优化。', gentle: '仅优化问题地址，不自动切换。', force: '替换更多播放地址，不一定更快。',
        };
        const mode = () => accelerator.config.autoAdapt ? 'auto' : accelerator.config.mode === 'force' ? 'force' : 'gentle';
        const cdnSignature = () => JSON.stringify(['enabled', 'autoAdapt', 'mode', 'rewriteAkamai'].map(key => accelerator.config[key]));
        const initialCdn = cdnSignature();
        let activeTab = 'settings', opened = false, hiddenForFullscreen = false;
        let dischargeTimer, toastTimer, hoverTimer, leaveTimer, helpButton;
        const scrollPositions = { settings: 0, current: 0 };
        const body = root.querySelector('.panel .body');
        root.append($('toast'));
        const bolt = root.querySelector('.panel-head .logo');
        root.querySelector('.version').textContent = `v${SCRIPT_VERSION}`;
        root.querySelectorAll('.stat-name')[1].textContent = '播放异常';
        const notice = document.createElement('div');
        notice.className = 'mode-current-note';
        notice.textContent = '新策略用于后续请求；当前播放可刷新应用。';
        root.querySelector('.segments').after(notice);
        // Keep a single tooltip outside the scroll container to avoid clipping.
        $('panel').append($('mode-hint'));
        $('dock').hidden = false;
        $('panel').hidden = true;
        $('panel').inert = true;
        $('panel').setAttribute('aria-hidden', 'true');
        $('panel').classList.remove('closed');
        $('dock').setAttribute('aria-controls', 'panel');
        $('dock').setAttribute('aria-expanded', 'false');

        function installDockDragging(read, write) {
            const dock = $('dock'), key = 'mbb-dock-position-v1';
            const saved = read(key);
            let ratio = saved === null ? null : Number(saved);
            if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) ratio = null;
            let drag = null, suppressClick = false;
            const maxTop = () => Math.max(8, innerHeight - 60);
            const clamp = y => Math.max(8, Math.min(maxTop(), y));
            function layout() {
                dock.style.top = `${clamp(ratio === null ? innerHeight * 0.3 : 8 + ratio * (maxTop() - 8))}px`;
            }
            dock.removeAttribute('title');
            dock.addEventListener('pointerdown', event => {
                if (!event.isPrimary || event.button !== 0) return;
                suppressClick = false;
                drag = { id: event.pointerId, x: event.clientX, y: event.clientY, top: parseFloat(dock.style.top), moved: false };
                dock.setPointerCapture(event.pointerId);
            });
            dock.addEventListener('pointermove', event => {
                if (!drag || drag.id !== event.pointerId) return;
                if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
                drag.moved = true;
                suppressClick = true;
                dock.classList.add('dragging');
                dock.style.top = `${clamp(drag.top + event.clientY - drag.y)}px`;
                event.preventDefault();
            });
            function finish(event) {
                if (!drag || drag.id !== event.pointerId) return;
                const current = drag;
                drag = null;
                dock.classList.remove('dragging');
                if (event.type !== 'pointerup') {
                    layout();
                } else if (current.moved) {
                    ratio = (parseFloat(dock.style.top) - 8) / Math.max(1, maxTop() - 8);
                    write(key, String(ratio));
                }
                if (dock.hasPointerCapture(event.pointerId)) dock.releasePointerCapture(event.pointerId);
            }
            dock.addEventListener('pointerup', finish);
            dock.addEventListener('pointercancel', finish);
            dock.addEventListener('lostpointercapture', finish);
            dock.addEventListener('click', event => {
                if (!suppressClick || event.detail === 0) return;
                suppressClick = false;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
            window.addEventListener('resize', () => {
                if (drag) finish({ pointerId: drag.id, type: 'pointercancel' });
                layout();
            });
            layout();
        }
        installDockDragging(key => settings.read(key), (key, value) => {
            if (!settings.write(key, value)) announce('位置仅在本次页面生效，无法保存。');
        });
        function announce(message) {
            $('toast').textContent = message;
            $('toast').hidden = false;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
        }
        function positionPanel() {
            const dock = $('dock'), panel = $('panel');
            const hidden = dock.hidden, visibility = dock.style.visibility;
            // Measure the anchor even while the panel has replaced the dock.
            dock.style.visibility = 'hidden'; dock.hidden = false;
            const anchor = dock.getBoundingClientRect();
            dock.hidden = hidden; dock.style.visibility = visibility;
            const logo = bolt.getBoundingClientRect();
            const offset = logo.top + logo.height / 2 - panel.getBoundingClientRect().top;
            const top = Math.max(12, Math.min(anchor.top + anchor.height / 2 - offset, window.innerHeight - 332));
            panel.style.top = `${top}px`;
            panel.style.maxHeight = `${Math.max(0, Math.min(520, window.innerHeight - top - 12))}px`;
        }
        function open() {
            if (hiddenForFullscreen) return;
            clearTimeout(dischargeTimer); dischargeTimer = null;
            $('dock').classList.remove('discharging');
            opened = true;
            $('panel').hidden = false; $('panel').inert = false;
            $('panel').removeAttribute('aria-hidden');
            $('dock').setAttribute('aria-expanded', 'true');
            const keyboard = root.activeElement === $('dock');
            $('dock').hidden = true;
            render();
            positionPanel();
            if (keyboard) $(`tab-${activeTab}`).focus();
        }
        function close() {
            hideHelp(); clearTimeout(dischargeTimer); dischargeTimer = null;
            $('dock').classList.remove('discharging');
            if ($('reset-dialog').open) $('reset-dialog').close();
            opened = false;
            $('dock').hidden = hiddenForFullscreen;
            if ($('panel').contains(root.activeElement) && !hiddenForFullscreen) $('dock').focus();
            $('panel').inert = true; $('panel').hidden = true;
            $('panel').setAttribute('aria-hidden', 'true');
            $('dock').setAttribute('aria-expanded', 'false');
        }
        $('dock').onclick = () => {
            if (dischargeTimer) return;
            if (reduced.matches) { open(); return; }
            $('dock').classList.add('discharging');
            dischargeTimer = setTimeout(open, 240);
        };
        $('close').onclick = close;
        document.addEventListener('pointerdown', event => {
            if (opened && !event.composedPath().includes(host) && !$('reset-dialog').open) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !opened || $('reset-dialog').open) return;
            if (!$('mode-hint').hidden) { const button = helpButton; hideHelp(); button?.focus(); hideHelp(); }
            else close();
            event.preventDefault(); event.stopPropagation();
        }, true);
        all('[data-tab]').forEach((button, index, tabs) => {
            const select = target => {
                scrollPositions[activeTab] = body.scrollTop;
                hideHelp(); activeTab = target.dataset.tab;
                tabs.forEach(tab => {
                    const selected = tab === target;
                    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
                    $(tab.dataset.tab).hidden = !selected;
                });
                $('reset').hidden = activeTab !== 'settings'; $('copy').hidden = activeTab !== 'current';
                render(); body.scrollTop = scrollPositions[activeTab];
            };
            button.onclick = () => select(button);
            button.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                select(tabs[next]); tabs[next].focus();
            };
        });
        function flash() {
            if (!reduced.matches && !bolt.classList.contains('is-charged')) bolt.classList.add('is-charged');
        }
        bolt.addEventListener('animationend', event => { if (event.target === bolt) bolt.classList.remove('is-charged'); });
        reduced.addEventListener('change', () => bolt.classList.remove('is-charged'));
        Object.entries(inputIds).forEach(([key, id]) => {
            $(id).onchange = () => {
                const enabled = $(id).checked;
                const saved = key === 'enabled'
                    ? accelerator.saveConfig(utils.getPageWindow(), { ...accelerator.config, enabled })
                    : settings.set(key, enabled);
                if (!saved) { render(); announce('无法保存设置，请检查浏览器存储权限。'); return; }
                settings.log(`${labels[key]}：${enabled ? '开启' : '关闭'}`);
                if (enabled) flash();
                render();
            };
        });
        all('[data-mode]').forEach(button => {
            button.onclick = () => {
                const nextMode = button.dataset.mode;
                const next = { ...accelerator.config, autoAdapt: nextMode === 'auto',
                    mode: nextMode === 'force' ? 'force' : 'bad-only', rewriteAkamai: nextMode === 'force',
                    adaptiveLevel: nextMode === 'force' ? 1 : 0, mcdnStrategy: 'proxy-all' };
                if (!accelerator.saveConfig(utils.getPageWindow(), next)) announce('策略保存失败。');
                else {
                    accelerator.state.playbackIssues = [];
                    accelerator.state.lastAdaptiveAt = 0;
                    settings.log(`播放策略：${button.textContent}`);
                }
                hideHelp(); render();
            };
        });
        $('apply').onclick = () => location.reload();
        $('reset').onclick = () => { hideHelp(); $('reset-dialog').showModal(); };
        $('cancel-reset').onclick = () => $('reset-dialog').close();
        $('confirm-reset').onclick = () => {
            let saved = true;
            const defaults = { ...settings.defaults, wide: true, crop: false, hevc: false, safari: false };
            for (const [key, value] of Object.entries(defaults)) if (!settings.set(key, value)) saved = false;
            if (!accelerator.saveConfig(utils.getPageWindow(), accelerator.defaultConfig)) saved = false;
            if (saved) {
                settings.issueCount = 0; settings.logs = [];
                Object.assign(accelerator.state, { rewrites: [], rewriteCount: 0, playbackIssues: [], lastAdaptiveAt: 0, adaptiveReason: '' });
                settings.log('已恢复默认设置');
            }
            $('reset-dialog').close(); render();
            announce(saved ? '已恢复默认；兼容设置如有变更需刷新。' : '部分设置保存失败，请检查存储权限。');
        };
        $('clear').onclick = () => { settings.logs = []; render(); };
        $('copy').onclick = async () => {
            // Never export signed playback URLs, user IDs, cookies or full page URLs.
            const diagnostic = {
                version: SCRIPT_VERSION, page: pageName(), settings: { ...settings.values },
                appliedCompatibility: Object.fromEntries(refreshKeys.map(key => [key, settings.applied[key]])),
                playback: { enabled: accelerator.config.enabled, strategy: mode(), adaptiveLevel: accelerator.config.adaptiveLevel,
                    rewrites: accelerator.state.rewriteCount, issues: settings.issueCount },
                events: settings.logs,
            };
            try { await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2)); announce('诊断信息已复制'); }
            catch { announce('复制失败，请允许剪贴板访问后重试。'); }
        };
        function pageName() {
            if (page.isHomepage()) return '首页';
            if (page.isDynamic()) return '动态页';
            if (page.isArticle()) return '专栏页';
            if (page.isVideo()) return '视频播放页';
            if (page.isLive()) return '直播间';
            if (page.isBangumi()) return '番剧页';
            if (page.needsPlaybackCapabilityPatch()) return '播放列表页';
            if (location.hostname.endsWith('.bilibili.tv')) return '国际站';
            return '其他页面';
        }
        const statusSection = $('diagnostic-mode').closest('section');
        statusSection.replaceChildren();
        function render() {
            if (!opened) return;
            const values = settings.values, config = accelerator.config;
            for (const [key, id] of Object.entries(inputIds)) $(id).checked = key === 'enabled' ? config.enabled : values[key];
            all('[data-mode]').forEach(button => {
                button.disabled = !config.enabled;
                button.setAttribute('aria-pressed', String(button.dataset.mode === mode()));
            });
            const pending = refreshKeys.some(key => values[key] !== settings.applied[key]);
            const cdnPending = initialCdn !== cdnSignature();
            notice.hidden = !cdnPending;
            $('pending').hidden = !(pending || cdnPending);
            $('advanced-state').textContent = pending ? '待刷新' : `${refreshKeys.filter(key => values[key]).length} / 3已开启`;
            $('advanced-state').classList.toggle('pending-state', pending);
            const count = ['ads', 'spacing', 'goods', 'liveClean'].filter(key => values[key]).length;
            root.querySelector('[data-group]').textContent = `${count} / 4已开启`;
            $('hint-hevc').hidden = !values.hevc; $('ua-warning').hidden = !values.safari;
            root.querySelector('.footer-note').textContent = settings.storageError ? '存储不可用' : '当前站点设置';
            root.querySelector('#current .label').textContent = pageName();
            const video = document.querySelector('video');
            const playbackPage = accelerator.shouldMonitorPlayback();
            $('status-text').textContent = !config.enabled ? '使用原始播放地址'
                : !playbackPage || !video ? '暂无播放任务' : video.paused ? '播放已暂停' : config.autoAdapt ? '正在监测播放' : '手动策略已启用';
            $('strategy').textContent = !config.enabled ? '已关闭' : config.mode === 'force' ? '增强策略' : '温和策略';
            root.querySelector('#current .stats').hidden = !playbackPage;
            $('rewrites').textContent = String(accelerator.state.rewriteCount);
            $('issues').textContent = String(settings.issueCount);
            const rows = [['播放地址优化', !config.enabled ? '已关闭' : `${mode() === 'auto' ? '自动 · ' : ''}${config.mode === 'force' ? '增强' : '温和'}策略`]];
            if (page.isVideo()) rows.push(['视频裁切', values.crop ? '已启用' : '未开启']);
            if (page.isDynamic()) rows.push(['动态宽屏', values.wide ? '已启用' : '已关闭'], ['动态带货内容隐藏', values.goods ? '已启用' : '已关闭']);
            if (page.isHomepage()) rows.push(['首页广告清理', values.ads ? '已启用' : '已关闭'], ['空白卡片清理', '自动运行'], ['推荐间距优化', values.spacing ? '已启用' : '已关闭']);
            if (page.isArticle()) rows.push(['专栏正文复制', '自动运行']);
            if (page.isLive()) rows.push(['直播界面精简', values.liveClean ? '已启用' : '已关闭'], ['直播异常提醒', '等待异常']);
            if (page.isBangumi()) rows.push(['番剧错误重试', '错误时自动重试一次']);
            if (page.needsPlaybackCapabilityPatch()) refreshKeys.forEach(key => {
                rows.push([labels[key], values[key] !== settings.applied[key]
                    ? `待刷新${values[key] ? '开启' : '关闭'}` : settings.applied[key] ? '已应用' : '未开启']);
            });
            rows.push(['链接跟踪参数清理', '自动运行']);
            const statusSignature = JSON.stringify(rows);
            if (statusSection.dataset.signature !== statusSignature) {
                statusSection.dataset.signature = statusSignature;
                statusSection.replaceChildren();
                rows.forEach(([name, state]) => {
                    const row = document.createElement('div'); row.className = 'kv';
                    for (const text of [name, state]) { const span = document.createElement('span'); span.textContent = text; row.append(span); }
                    statusSection.append(row);
                });
            }
            const logSignature = JSON.stringify(settings.logs);
            if ($('logs').dataset.signature !== logSignature) {
                $('logs').dataset.signature = logSignature; $('logs').replaceChildren();
                if (!settings.logs.length) $('logs').textContent = '暂无记录';
                settings.logs.forEach(entry => {
                    const line = document.createElement('div'); line.className = 'log';
                    const time = document.createElement('time'); time.textContent = new Date(entry.time).toLocaleTimeString();
                    line.append(time, document.createTextNode(entry.message)); $('logs').append(line);
                });
            }
        }
        function hideHelp() {
            clearTimeout(hoverTimer); clearTimeout(leaveTimer);
            $('mode-hint').hidden = true; helpButton?.setAttribute('aria-expanded', 'false');
        }
        function showHelp(button) {
            hideHelp(); helpButton = button;
            if (!opened || hiddenForFullscreen) return;
            const text = button.dataset.help || strategyHelp[mode()];
            const chars = Array.from(text), lines = [];
            for (let index = 0; index < chars.length;) {
                let end = Math.min(index + 18, chars.length);
                while (end < chars.length && /^[，。！？；：、,.!?;:…）】》」』”’％%]$/.test(chars[end])) end++;
                while (end < chars.length && end > index + 1 && /^[（【《「『“‘]$/.test(chars[end - 1])) end--;
                lines.push(chars.slice(index, end).join('')); index = end;
            }
            const tooltip = $('mode-hint'); tooltip.textContent = lines.join('\n');
            const measure = document.createElement('canvas').getContext('2d'); measure.font = getComputedStyle(tooltip).font;
            tooltip.style.width = `${Math.ceil(measure.measureText(lines[0]).width + 34)}px`;
            const bounds = $('panel').getBoundingClientRect(), anchor = button.getBoundingClientRect();
            tooltip.style.maxWidth = `${bounds.width - 24}px`; tooltip.style.maxHeight = `${bounds.height - 24}px`;
            tooltip.style.overflowY = 'auto'; tooltip.hidden = false;
            const box = tooltip.getBoundingClientRect();
            tooltip.style.left = `${Math.max(bounds.left + 12, Math.min(anchor.left, bounds.right - box.width - 12))}px`;
            const top = anchor.bottom + 8 + box.height > bounds.bottom - 12 ? anchor.top - box.height - 8 : anchor.bottom + 8;
            tooltip.style.top = `${Math.max(bounds.top + 12, Math.min(top, bounds.bottom - box.height - 12))}px`;
            button.setAttribute('aria-expanded', 'true');
        }
        function leaveHelp() { clearTimeout(hoverTimer); leaveTimer = setTimeout(hideHelp, 180); }
        all('.feature-help').forEach(button => {
            button.removeAttribute('title');
            button.addEventListener('pointerenter', event => {
                if (event.pointerType === 'touch') return;
                clearTimeout(leaveTimer); clearTimeout(hoverTimer);
                hoverTimer = setTimeout(() => showHelp(button), 250);
            });
            button.addEventListener('pointerleave', leaveHelp);
            button.addEventListener('focus', () => { if (button.matches(':focus-visible')) showHelp(button); });
            button.addEventListener('blur', hideHelp);
            button.onclick = () => {
                if (matchMedia('(hover: none)').matches) {
                    if (!$('mode-hint').hidden && helpButton === button) hideHelp(); else showHelp(button);
                }
            };
        });
        $('mode-hint').onpointerenter = () => clearTimeout(leaveTimer);
        $('mode-hint').onpointerleave = leaveHelp;
        root.addEventListener('click', event => { if (!event.target.closest('.feature-help,#mode-hint')) hideHelp(); });
        body.addEventListener('scroll', hideHelp);
        window.addEventListener('resize', () => { hideHelp(); if (opened) positionPanel(); });
        function checkFullscreen() {
            const fullscreen = !!document.fullscreenElement || !!document.querySelector('.bpx-state-web,.bpx-state-fullscreen,.webfullscreen');
            if (fullscreen !== hiddenForFullscreen) {
                hiddenForFullscreen = fullscreen;
                if (fullscreen) close();
                host.style.setProperty('visibility', fullscreen ? 'hidden' : 'visible', 'important');
                if (!fullscreen) $('dock').hidden = false;
            }
        }
        document.addEventListener('fullscreenchange', checkFullscreen);
        settings.listeners.add(render);
        setInterval(() => { checkFullscreen(); render(); }, 1000);
        checkFullscreen();
    }

    // END GENERATED CONTROL PANEL

    startup.boot();
})();
