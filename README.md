# Make Bilibili Better（海外优化版）

`Make Bilibili Better（海外优化版）` 是一个用于优化哔哩哔哩网页体验的用户脚本。

优化哔哩哔哩网页体验，支持海外播放地址优化，适合留学生和海外用户观看 B 站。

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
- 番剧播放报错时进行一次轻量重试

## 安装

先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。

然后通过 Greasy Fork 安装脚本：

[安装 Make Bilibili Better（海外优化版）](https://greasyfork.org/zh-CN/scripts/572675-make-bilibili-better)

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

## 最近更新

### 1.2.3

- 默认关闭 Safari UA 伪装，修复部分 Chromium 浏览器播放页鼠标隐藏或点击异常
- 保留手动 opt-in 开关：`localStorage.setItem('mbb-safari-ua-patch-enabled', '1')`

### 1.2.2

- 标题更新为 `Make Bilibili Better（海外优化版）`
- 更新脚本描述，突出海外播放地址优化和留学生 / 海外用户使用场景

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 致谢

部分功能思路参考自 kookxiang 的 `Make BiliBili Great Again`。

参考项目：
https://greasyfork.org/zh-CN/scripts/415714-make-bilibili-great-again
