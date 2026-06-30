# Make Bilibili Better

`Make Bilibili Better` 是一个用于优化哔哩哔哩网页体验的用户脚本。

当前版本提供首页净化、动态页宽屏、专栏复制、视频裁切模式、链接参数清理、自适应海外播放 CDN 加速，以及杜比全景声 / 8K / HDR / 直播高画质能力补丁、轻量级直播 / 番剧增强。

## 功能

- 隐藏首页广告卡片和空白占位卡片
- 收紧首页推荐流的卡片间距
- 为 `动态页` 提供宽屏模式切换按钮（右下角）
- 恢复专栏页面正文复制
- 自动清理常见的 B 站跟踪参数
- 为普通视频播放器增加“裁切模式”开关
- 启用播放地址 CDN 优化（海外的一定要试试）
- 提前启用杜比全景声 / 8K / HDR / 直播高画质相关能力声明
- 隐藏直播间部分无用界面元素
- 连续播放失败时提示直播清晰度可能不可用
- 番剧播放报错时进行一次轻量重试

## 安装

先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。

然后通过 Greasy Fork 安装脚本：

[安装 Make Bilibili Better](https://greasyfork.org/zh-CN/scripts/572675-make-bilibili-better)

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

## 最近更新

### 1.2.1

- 新增无悬浮按钮的自适应播放 CDN 加速模块
- 默认保守重写慢速播放地址，检测到卡顿后自动升级为更激进的 CDN 重写策略
- 支持 `bilibili.tv` 播放相关页面
- 提供 `MBBPlaybackAccelerator` 控制台接口用于查看配置和重写统计

### 1.1.2

- 修正脚本版本号和描述文案
- 明确首页广告净化、杜比高画质与直播 / 番剧增强等功能说明

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 致谢

部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`。

参考项目：
https://greasyfork.org/zh-CN/scripts/415714-make-bilibili-great-again
