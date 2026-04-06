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

## 项目结构

当前脚本采用“模块化单文件”结构，仍然只维护一个 userscript 文件，但内部按职责拆成四层：

- `CONFIG`：统一管理站点、路径、存储键、UA 和参数规则
- `page / utils / urlTools`：页面判断、通用工具和 URL 处理
- `modules`：每个功能一个独立模块，统一实现 `shouldRun()` 和 `install()`
- `startup`：分成“早期补丁”和“DOM 就绪后模块”两阶段启动

这样的组织方式可以保持发布文件仍然只有一个，同时让后续加功能、排查问题和做页面适配更清晰。

## 1.1.0 新增内容

- 新增杜比全景声 / 8K / HDR / 直播高画质能力补丁
- 统一早期补丁与 DOM 功能的启动流程，便于后续继续扩展

## 开发说明

- 许可证：MIT
- 主文件：[`Make Bilibili Better.user.js`](./Make%20Bilibili%20Better.user.js)
- 当前版本：`1.1.0`
- 当前版本为独立重写后的发布候选版本，后续建议继续沿用“模块化单文件”结构维护

## 项目地址

https://github.com/W-ArcherEmiya/make-bilibili-better

## 致谢

部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`。

参考项目：
https://greasyfork.org/zh-CN/scripts/415714-make-bilibili-great-again
