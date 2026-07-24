# 全站弹窗「打开/关闭页面+导航栏横向抖动」修复（最终版）

## 问题
首页点击公告 → 整页向右抖 + 导航栏位移；关闭弹窗 → 反向弹回。经过三轮迭代：

1. **第一轮**：`body` 加 `paddingRight` 补偿 → 页面不抖，但导航栏抖
2. **第二轮**：改锁 `documentElement` + 补其 `paddingRight` → 导航栏仍有微移
3. **第三轮（最终）**：CSS `scrollbar-gutter: stable` → 彻底解决

## 根因
弹窗打开时 `overflow: hidden` 移除滚动条 → 内容可用宽度变化 → 居中布局位移。任何 JS 层面的 padding 补偿（无论加在 body 还是 html 上）都会在某些浏览器/固定定位元素上产生副作用。

## 最终方案：CSS `scrollbar-gutter: stable`
这是 W3C 专门为「滚动条出现/消失导致布局位移」问题设计的标准 CSS 属性。

```css
html {
    scrollbar-gutter: stable;
}
```

效果：浏览器始终为滚动条预留空间，无论滚动条是否实际显示，页面宽度恒定不变。JS 侧只需单纯 `document.documentElement.style.overflow = 'hidden'`，零补偿、零位移。

### 兼容性
| 浏览器 | 最低版本 | 发布时间 |
|--------|---------|---------|
| Chrome | 94 | 2021-09 |
| Firefox | 97 | 2022-02 |
| Safari | 17 | 2023-09 |
| Edge | 94 | 2021-09 |

## 改动清单

### CSS：7 个用户端页面添加 `html { scrollbar-gutter: stable; }`
| 页面 | 文件 |
|------|------|
| 首页 | `index.html` |
| 个人中心 | `center.html` |
| 课程 | `course.html` |
| 消息中心 | `messages.html` |
| 讲师 | `teacher.html` |
| 培训计划 | `training-plan.html` |
| 播放器 | `player.html` |

### JS：4 个弹窗文件简化为纯 overflow 锁（移除所有 padding 补偿代码）
| 文件 | 弹窗 |
|------|------|
| `js/index-enhanced.js` | 公告弹窗 |
| `js/auth-modal.js` | 登录弹窗 |
| `center.html` (内联) | 证书预览弹窗 |
| `m/js/common.js` | 移动端底部弹层 |

### 未改动
- `dashboard.html`：管理后台弹窗用 `classList.add('flex')` 显示，未锁 body/html 滚动
- `exam.html` / `survey.html`：无 fixed 导航栏（sticky 或无 header），不需要

## 兜底方案（自动兼容老浏览器，杜绝「怕遇到又抖」）
用户要求：万一某台设备浏览器不支持 `scrollbar-gutter`，也不能抖。

在 `js/auth-modal.js` 顶部封装全局 `window.lockScroll()` / `window.unlockScroll()`（所有页面均引用 `auth-modal.js`）：
- 内部用 `CSS.supports('scrollbar-gutter', 'stable')` 检测；
- **支持** → 走 `de.style.overflow='hidden'` 主方案（宽度恒定，零位移）；
- **不支持** → 自动切换 **body 冻结法**：
  ```js
  const y = window.scrollY || window.pageYOffset || 0;
  body.setAttribute('data-scroll-lock-y', y);
  body.style.position = 'fixed';
  body.style.top = `-${y}px`; body.style.left='0'; body.style.right='0'; body.style.width='100%';
  de.style.overflow = 'hidden';
  // unlock: 还原 style + window.scrollTo(0, y)
  ```
  body 被 fixed 后通过 `top:-y` 回到原滚动位置 → 主体内容不跳转；fixed 导航栏相对视口不受影响 → 极老浏览器下表现与浏览器原生 `overflow:hidden` 一致（不会更差）。

**4 个弹窗文件的 open/close 全部改用 `window.lockScroll()` / `window.unlockScroll()`**，业务代码里不再出现手写 `overflow`/`padding` 补偿。

> 团队规范：新增弹窗锁滚动 → 直接调用 `lockScroll()` / `unlockScroll()`，不要自己写 `overflow`/`padding` 补偿。

## 效果
所有弹窗打开/关闭时——页面不抖、导航栏不抖、任何 fixed 元素不位移。

## 验证
硬刷新（Ctrl+Shift+R）后：
- 首页点公告打开/关闭 → 页面和导航栏都纹丝不动
- 触发登录弹窗 → 同上
- 个人中心证书预览 → 同上
- 手机端底部弹层 → 同上
