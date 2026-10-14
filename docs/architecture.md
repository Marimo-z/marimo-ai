# 架构说明

## 技术栈与版本

| 领域       | 选型                                 | 说明                                                                |
| ---------- | ------------------------------------ | ------------------------------------------------------------------- |
| 桌面容器   | Electron 44                          | 透明置顶窗口、全局光标、托盘都有成熟 API；本机无 Rust，Tauri 不适用 |
| 构建       | electron-vite 5 + Vite 7.3           | electron-vite 5 只支持 Vite 5–7，因此未使用 Vite 8                  |
| 前端       | Vue 3.5 + `<script setup lang="ts">` |                                                                     |
| 状态       | Pinia 4                              | 桌宠状态集中在 `usePetStore`                                        |
| 语言       | TypeScript 6.0                       | typescript-eslint 8 要求 TS < 6.1，因此未使用 TS 7                  |
| 运行时校验 | zod 4                                | 校验配置文件；阶段 3 用于校验模型的结构化回复                       |
| 测试       | Vitest 5                             | 纯函数单元测试                                                      |
| 代码质量   | ESLint 10（flat config）+ Prettier 3 |                                                                     |

按阶段引入：Vue Router 与 Element Plus（阶段 2 控制面板）、Phaser（阶段 6 坦克大战）、electron-builder（阶段 6 打包）。

## 目录

```text
electron/
  main/
    index.ts                 应用入口：单实例锁、创建窗口/托盘、退出流程
    windows/pet-window.ts    桌宠窗口：透明置顶、鼠标穿透、拖动、位置恢复
    ipc/pet-ipc.ts           桌宠 IPC：校验发送方与参数
    menus.ts                 托盘菜单与右键菜单（原生 Menu）
    tray.ts                  托盘图标（运行时由 logo 几何光栅化）
    services/
      config-schema.ts       配置 schema（zod，按字段容错）
      config-store.ts        JSON 配置读写（原子写入、防抖保存）
      pointer-tracker.ts     全局光标轮询（位置不变则不发 IPC）
      window-bounds.ts       多显示器可见性修正（纯函数）
      logo-bitmap.ts         logo 光栅化（纯函数）
  preload/index.ts           contextBridge 暴露受限 API：window.marimo.pet
shared/                      主进程与渲染进程共用的类型与 IPC 契约
src/
  app/pet/                   桌宠窗口入口（PetApp.vue、bridge.ts）
  app/stores/pet.ts          桌宠状态（情绪、拖动、说话、对话）
  components/pet/            PetOrb / PetEyes / PetBubble
  composables/               光标追踪、手势、眨眼、交互区域、待机浮动
  services/mock-dialogue.ts  阶段 1 本地模拟台词
  utils/                     纯函数：眼睛偏移、外观解析、手势判定、气泡时长、浮动曲线
tests/                       Vitest 单元测试
pet.html                     桌宠窗口 HTML（含 CSP）
```

与规格书第 9 节的差异：

- 新增 `shared/`：主进程和渲染进程都需要的类型（`PetSettings`、IPC 通道）放在这里，避免主进程反向依赖 `src/`。
- 不创建 `PetContextMenu.vue`：右键菜单使用 Electron 原生 `Menu.popup`。HTML 菜单会被 280×340 的透明窗口裁切，而原生菜单不会。
- 阶段 1 只有一个渲染入口 `pet.html`。阶段 2 新增 `settings.html` 作为控制面板入口，桌宠窗口因此不必加载 Element Plus 和路由。
- AI Provider 将放在主进程（`electron/main/services/ai/`），渲染进程只保留调用门面。规格书把 `services/ai` 放在 `src/` 下，这与"敏感请求经主进程发起"的要求矛盾。

## 进程与安全

- 所有窗口：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload 只暴露 `window.marimo.pet` 上的固定方法，不暴露 `ipcRenderer`，也不把 IPC event 对象转发给页面。
- 主进程的每个 IPC 处理器都会校验 `event.sender` 必须是桌宠窗口，并对参数做类型检查。
- 禁止新窗口（`setWindowOpenHandler` → deny）和页面导航（`will-navigate` → preventDefault）。
- CSP：`default-src 'self'; script-src 'self'`。
- 气泡文本使用 `{{ }}` 渲染（纯文本），全项目不使用 `v-html`。
- 配置 schema 会剥离未知字段，所以即使有人往 `config.json` 里写入 `apiKey`，也不会被保留或回写。密钥将在阶段 2 通过 Electron `safeStorage`（Windows DPAPI）单独存储。

## 关键实现

### 透明窗口与点击穿透

窗口为 280×340 DIP（乘以缩放比例），机器人在底部，上方空间留给气泡。Windows 上透明像素默认仍会拦截点击，因此：

- 默认 `setIgnoreMouseEvents(true, { forward: true })`：点击穿透到下层窗口，但 mousemove 仍转发给页面。
- 页面监听 mousemove。指针进入带 `data-interactive` 的元素（机器人主体、气泡）时，通知主进程把窗口切换为可点击；离开后恢复穿透。
- 用户开启"鼠标穿透模式"后调用 `setIgnoreMouseEvents(true)`，不再转发事件，渲染进程的请求也会被忽略；只能通过托盘恢复。

### 全局光标与眼睛追踪

Electron 没有全局 mousemove 事件。主进程以 30Hz 轮询 `screen.getCursorScreenPoint()`，**只在坐标变化时**发送窗口相对坐标（DIP）。窗口隐藏或关闭眼睛跟随时停止轮询。渲染进程用 `computeEyeOffset` 计算偏移：

- 最大偏移 6px × 缩放比例；纵向乘以 0.8。
- 光标在机器人内部时偏移按距离线性减小，避免"斗鸡眼"。
- 360px 内全力追踪，并视为"靠近"（触发 curious）；距离越远追踪强度越低，最低保留 45%。
- 偏移量化到 0.25px，配合 180ms CSS 过渡实现平滑效果。

### 拖动与点击区分

不使用 `-webkit-app-region: drag`，因为它会吞掉点击和右键事件。改为：

1. `pointerdown` 时 `setPointerCapture`，并记录屏幕坐标。
2. 移动超过 4px 才判定为拖动，通知主进程 `startDrag`。主进程以 16ms 间隔按"光标 − 初始偏移"调用 `setBounds`，并始终显式传入宽高，规避 Windows 上透明窗口跨不同 DPI 显示器时尺寸漂移的问题。
3. `pointerup` 时，如果发生过拖动则 `endDrag` 并保存位置，否则按单击处理（260ms 内的第二次点击判定为双击）。

### 状态模型

规格书中的 `PetEmotion` 把情绪（happy/angry…）和活动（talking/playing/dragging）混在一起。这里拆成两部分：

- `PetEmotion`（idle/curious/happy/angry/sad/thinking）：可以由应用、游戏或经校验的 AI 回复设置。
- 活动标记 `isDragging` / `isSpeaking` / `isPlaying`：由交互和服务自动维护。

`resolvePetAppearance` 把以上信息统一映射为：

- `state`：规格书中的 9 个视觉状态之一，作为 `data-state` 输出；
- `expression`：决定眼睛形状；
- `motion`：决定身体动画；
- `trackCursor`：happy / sad / thinking 和拖动期间关闭眼睛追踪，避免动画冲突。

这样，"边说话边生气"可以自然表达（state = talking，expression = angry），AI 也无法输出 `dragging` 这类不该由它控制的状态。

### 性能

在 Windows 上，透明窗口的每一帧都要整窗合成；如果 GPU 合成不可用，会退回软件渲染，一个 60fps 的 CSS 动画就能占掉大半个 CPU 核。因此：

- 待机浮动由 10fps 定时器驱动（正弦曲线，位移只有几个像素），浮动层设置 `will-change: transform`，只做合成、不重新光栅化。
- 眨眼、表情切换、点击回弹都是短暂动画，结束后不再产生帧。
- 窗口隐藏时停止光标轮询；页面不可见时跳过浮动更新。
