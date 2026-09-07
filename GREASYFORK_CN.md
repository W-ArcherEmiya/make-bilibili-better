## 简介

Make Bilibili Better（海外优化版）是一个用于优化哔哩哔哩网页体验的用户脚本。

优化哔哩哔哩网页体验，支持海外播放地址优化，适合留学生和海外用户观看 B 站。

当前版本主要提供以下功能：

- 隐藏首页广告卡片和空白占位卡片
- 优化首页推荐流间距
- 为 `动态页` 提供宽屏模式按钮（右下角）
- 恢复专栏正文复制
- 自动清理常见链接跟踪参数
- 为普通视频播放器增加“裁切模式”
- 启用播放地址 CDN 优化（海外的一定要试试）
- 提前启用杜比全景声 / 8K / HDR / 直播高画质相关能力声明
- 提供轻量级直播 / 番剧播放增强

除上述主要页面外，部分播放能力补丁还会在 `watchlater`、`watchroom`、`medialist`、`list`、`festival`、`blackboard` 等播放相关页面生效。播放地址优化也支持 `bilibili.tv` 播放页面。

项目地址：
https://github.com/W-ArcherEmiya/make-bilibili-better

致谢：
部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`
https://github.com/kookxiang/Make-BiliBili-Great-Again

## 版本说明

当前发布版本：`v1.2.3`

本次更新包含：

- 默认关闭 Safari UA 伪装，修复部分 Chromium 浏览器播放页鼠标隐藏或点击异常
- 如需手动启用，在控制台执行 `localStorage.setItem('mbb-safari-ua-patch-enabled', '1')` 后刷新页面
