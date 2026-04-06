# Make Bilibili Better

`Make Bilibili Better` 是一个用于优化哔哩哔哩网页体验的用户脚本。

当前版本提供首页净化、动态页宽屏、专栏复制、视频裁切模式、链接参数清理，以及杜比全景声 / 8K / HDR / 直播高画质能力补丁、轻量级直播 / 番剧增强。

## 功能

- 隐藏首页广告卡片和空白占位卡片
- 收紧首页推荐流的卡片间距
- 为 `动态页` 提供宽屏模式切换按钮（右下角）
- 恢复专栏页面正文复制
- 自动清理常见的 B 站跟踪参数
- 为普通视频播放器增加“裁切模式”开关
- 提前启用杜比全景声 / 8K / HDR / 直播高画质相关能力声明
- 隐藏直播间部分无用界面元素
- 连续播放失败时提示直播清晰度可能不可用
- 番剧播放报错时进行一次轻量重试

## 安装

脚本发布后，可以通过 GreasyFork 安装；也可以手动将 [`Make Bilibili Better.user.js`](./Make%20Bilibili%20Better.user.js) 导入你的用户脚本管理器。

## 主要支持页面

- `https://www.bilibili.com/`
- `https://t.bilibili.com/`
- `https://www.bilibili.com/read/cv*`
- `https://www.bilibili.com/video/*`
- `https://www.bilibili.com/bangumi/play/*`
- `https://live.bilibili.com/*`

## 附加生效页面

以下页面不会启用全部功能，但会应用播放能力相关补丁：

- `https://www.bilibili.com/watchlater*`
- `https://www.bilibili.com/watchroom*`
- `https://www.bilibili.com/medialist*`
- `https://www.bilibili.com/list/*`
- `https://www.bilibili.com/festival/*`
- `https://www.bilibili.com/blackboard/*`

## 1.1.1 新增内容

- 新增杜比全景声 / 8K / HDR / 直播高画质能力补丁
- 统一早期补丁与 DOM 功能的启动流程，便于后续继续扩展

## 致谢

部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`。

参考项目：
https://greasyfork.org/zh-CN/scripts/415714-make-bilibili-great-again
