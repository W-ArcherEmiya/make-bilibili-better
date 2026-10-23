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
        function installPanelTheme(targets, samplePage = true) {
            const preference = matchMedia('(prefers-color-scheme: dark)');
            function updateTheme() {
                const elements = [document.documentElement, document.body].filter(Boolean);
                let theme;
                for (const element of elements) {
                    const declared = element.getAttribute('data-theme') || element.getAttribute('data-color-mode') || element.getAttribute('theme');
                    if (declared === 'dark' || declared === 'light') { theme = declared; break; }
                    if (element.classList.contains('dark') || element.classList.contains('light')) {
                        theme = element.classList.contains('dark') ? 'dark' : 'light'; break;
                    }
                }
                if (!theme && samplePage) {
                    for (const element of elements.slice().reverse()) {
                        const style = getComputedStyle(element);
                        if (style.colorScheme === 'dark' || style.colorScheme === 'light') { theme = style.colorScheme; break; }
                        const rgb = style.backgroundColor.match(/^rgba?\(([^)]+)\)$/);
                        if (!rgb) continue;
                        const parts = rgb[1].split(',').map(Number);
                        if (parts.length === 4 && parts[3] < 0.95) continue;
                        theme = (parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722) < 128 ? 'dark' : 'light';
                        break;
                    }
                }
                theme ||= preference.matches ? 'dark' : 'light';
                targets.forEach(element => { if (element.dataset.theme !== theme) element.dataset.theme = theme; });
            }
            const observer = new MutationObserver(updateTheme);
            [document.documentElement, document.body].filter(Boolean).forEach(element => observer.observe(element, {
                attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'theme']
            }));
            preference.addEventListener('change', updateTheme);
            window.addEventListener('load', updateTheme);
            updateTheme();
        }
        installPanelTheme([$('panel'), $('reset-dialog')]);
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
            const contentHeight = root.querySelector('.panel-head').offsetHeight + root.querySelector('.tabs').offsetHeight
                + root.querySelector('.footer').offsetHeight + $(activeTab).offsetHeight + 2;
            const height = Math.min(520, contentHeight, window.innerHeight - 24);
            const top = Math.max(12, Math.min(anchor.top + anchor.height / 2 - offset, window.innerHeight - height - 12));
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
            const playbackState = !config.enabled ? '已关闭' : !playbackPage || !video ? '已开启 · 暂无播放任务'
                : cdnSignature() !== initialCdn ? '策略已修改 · 用于后续请求'
                    : `已开启 · ${mode() === 'auto' ? '自动 · ' : ''}${config.mode === 'force' ? '增强' : '温和'}策略`;
            const rows = [['播放地址优化', playbackState]];
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
        const panelResize = new ResizeObserver(() => { if (opened) { hideHelp(); positionPanel(); } });
        panelResize.observe($('settings'));
        panelResize.observe($('current'));
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
