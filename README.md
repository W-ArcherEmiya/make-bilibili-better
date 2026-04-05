# Make Bilibili Better

`Make Bilibili Better` 是一个用于优化哔哩哔哩网页体验的用户脚本，主要提供首页净化、动态页宽屏、专栏复制、视频裁切模式、链接参数清理，以及轻量级的直播 / 番剧播放增强。

## 功能

- 隐藏首页广告卡片和空白占位卡片
- 收紧首页推荐流的卡片间距
- 为 `t.bilibili.com` 提供宽屏模式切换按钮
- 恢复专栏页面正文复制
- 自动清理常见的 B 站跟踪参数
- 为普通视频播放器添加“裁切模式”开关
- 隐藏直播间部分无用界面元素
- 连续播放失败时提示直播清晰度可能不可用
- 番剧播放报错时进行一次轻量重试

## 安装

脚本发布后，可以通过 GreasyFork 安装；也可以手动将 [`Make Bilibili Better.user.js`](./Make%20Bilibili%20Better.user.js) 导入你的用户脚本管理器。

## 支持页面

- `https://www.bilibili.com/`
- `https://t.bilibili.com/`
- `https://www.bilibili.com/read/cv*`
- `https://www.bilibili.com/video/*`
- `https://www.bilibili.com/bangumi/play/*`
- `https://live.bilibili.com/*`

## 开发说明

- 许可证：MIT
- 主文件：[`Make Bilibili Better.user.js`](./Make%20Bilibili%20Better.user.js)
- 当前版本为独立重写后的发布候选版本，后续建议在此基础上继续维护

## 项目地址

https://github.com/W-ArcherEmiya/make-bilibili-better

## 致谢

部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`。

参考项目：
https://greasyfork.org/zh-CN/scripts/415714-make-bilibili-great-again
