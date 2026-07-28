# 修复：点击「我的」瞬间闪现两份导航链接

## 现象
用户页（如首页）点击「我的」跳转到个人中心等页面时，加载瞬间出现**两组导航链接**（桌面横向导航 + 移动端纵向下拉菜单），约一瞬后消失。

## 根因：Tailwind Play CDN 的 FOUC（样式闪现）
- 全部用户页使用 `cdn.tailwindcss.com`，该 CDN 是**在浏览器端动态生成 CSS** 的。
- 导航/移动菜单的初始隐藏态依赖 Tailwind 的 `hidden` / `md:hidden` 工具类。
- 页面 HTML 解析完成、但 CDN 尚未生成并注入样式之间存在一个时间窗——此窗口内 `hidden` 不生效，于是本应隐藏的 `#mobile-menu`（移动端下拉）以及移动端下本应隐藏的桌面 `<nav>` **同时可见**，等 Tailwind 就绪后又隐藏，表现为"两个页面链接一闪而过"。
- 排除项（已穷举）：并非 JS 重复注入导航。`auth-guard.js / data-sync.js / data-api.js / notification.js / index-enhanced.js` 均不重建导航；各页静态 HTML 仅一套导航。

## 修复方案（零 JS 改动、不破坏现有逻辑）
在 7 个用户页 `<head>` 各加一段**原生 `<style>`**（即时生效，不依赖 Tailwind CDN）：

```css
#mobile-menu.hidden { display: none !important; }
@media (max-width: 767px) { nav.hidden { display: none !important; } }
```

为何安全：
- `#mobile-menu.hidden` 仅在元素**带 `hidden` 类**时生效；JS 打开菜单时移除 `hidden`，规则失效、菜单照常弹出。
- `nav.hidden` 被 `@media(max-width:767px)` 限定在移动端；桌面端 `<nav>` 由 Tailwind `md:flex` 正常显示，无回归。

## 改动文件
`index.html`、`center.html`、`course.html`、`teacher.html`、`messages.html`、`player.html`、`training-plan.html`（均为 `<head>` 插入一段原生兜底 CSS）

## 验证
硬刷新（Ctrl+Shift+R）后：首页/个人中心等页面加载瞬间不再出现两份导航；移动端点击汉堡菜单仍可正常展开/收起。
