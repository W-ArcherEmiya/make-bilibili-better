# Make Bilibili Better（海外优化版）

`Make Bilibili Better（海外优化版）` 是一个用于优化哔哩哔哩网页体验的用户脚本。

优化哔哩哔哩网页体验，支持海外播放地址优化，适合留学生和海外用户观看 B 站。

## 功能

- 隐藏首页广告卡片和空白占位卡片
- 收紧首页推荐流的卡片间距
- 通过侧边调控台切换动态宽屏、裁切和页面净化设置
- 恢复专栏页面正文复制
- 自动清理常见的 B 站跟踪参数
- 为普通视频播放器增加“裁切模式”开关
- 启用播放地址 CDN 优化（海外的一定要试试）
- 提前启用杜比全景声 / 8K / HDR / 直播高画质相关能力声明
- 隐藏直播间部分无用界面元素
- 番剧播放报错时进行一次轻量重试

## 安装

先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。

然后通过 Greasy Fork 安装脚本：

[安装 Make Bilibili Better（海外优化版）](https://greasyfork.org/zh-CN/scripts/572675-make-bilibili-better)

## 侧边调控台

![Make Bilibili Better侧边调控台演示](https://raw.githubusercontent.com/W-ArcherEmiya/Images/main/make-bilibili-better/ezgif-15a3ef23b8220d92.gif)

点击右侧闪电打开面板。“功能设置”提供10个开关及自动 / 温和 / 增强播放策略；“当前页面”显示本页相关功能、地址优化次数和播放异常记录，可复制诊断信息。

设置按当前站点保存，`www.bilibili.com`、动态站、直播站和国际站各自独立。普通设置即时生效；高画质声明、HEVC和Safari UA变更需点击“刷新应用”。播放策略用于后续请求，当前视频可刷新应用。全屏观看时隐藏入口。

HEVC和Safari UA默认关闭，可在“高级兼容设置”中手动开启。空白卡片清理、链接清理、专栏复制、直播异常提醒和番剧重试自动运行，无需额外开关。

## 主要支持页面

- `https://www.bilibili.com/`
- `https://t.bilibili.com/`
- `https://www.bilibili.com/read/cv*`
- `https://www.bilibili.com/video/*`
- `https://www.bilibili.com/bangumi/play/*`
- `https://live.bilibili.com/*`
- `https://*.bilibili.tv/*`

## 附加生效页面

以下页面不会启用全部功能，但会应用播放能力或播放地址相关补丁：

- `https://www.bilibili.com/watchlater*`
- `https://www.bilibili.com/watchroom*`
- `https://www.bilibili.com/medialist*`
- `https://www.bilibili.com/list/*`
- `https://www.bilibili.com/festival/*`
- `https://www.bilibili.com/blackboard/*`

## 可选 Safari UA 伪装

默认不启用 Safari UA 伪装，避免 Chromium 浏览器进入 B 站播放器的 Safari 模式后出现鼠标隐藏或点击异常。

如果仍然需要手动启用，在 B 站页面控制台执行：

```js
localStorage.setItem('mbb-safari-ua-patch-enabled', '1');
location.reload();
```

关闭时执行：

```js
localStorage.removeItem('mbb-safari-ua-patch-enabled');
location.reload();
```

## 可选 HEVC 错误标记兼容

默认关闭，保留播放器原生的 HEVC 错误处理。仅在需要排查兼容问题时手动开启；此补丁不增加 HEVC 解码能力，可能影响播放器降级。

在 B 站页面控制台执行以下命令并刷新后启用：

```js
localStorage.setItem('mbb-hevc-patch-enabled', '1');
location.reload();
```

关闭并恢复原生错误处理：

```js
localStorage.removeItem('mbb-hevc-patch-enabled');
location.reload();
```

## 最近更新

### 1.3.0

- 新增侧边闪电调控台，支持功能设置、当前页面状态和诊断复制
- HEVC兼容补丁默认关闭，兼容设置支持手动开启并刷新应用

### 1.2.3

- 默认关闭 Safari UA 伪装，修复部分 Chromium 浏览器播放页鼠标隐藏或点击异常
- 保留手动 opt-in 开关：`localStorage.setItem('mbb-safari-ua-patch-enabled', '1')`

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 本地开发

正式脚本为单文件，不依赖远程UI资源。调控台模板和逻辑位于 `src/control-panel.html` 与 `src/control-panel.js`；修改后运行 `node scripts/build-control-panel.cjs` 生成到用户脚本。`preview/control-panel.html` 仍保留为独立设计预览。

验证：`node --check "Make Bilibili Better.user.js"`。安装Playwright且本机有Edge时，可运行 `node tests/control-panel.cjs`；也可通过 `PLAYWRIGHT_PATH` 指定已有Playwright模块路径。测试使用隔离页面，不访问真实账号。

## 第三方许可证

内置图标来自Lucide（ISC许可证），见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
