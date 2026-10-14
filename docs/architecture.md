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

| 控制面板 | Vue Router 5（hash 模式）+ Element Plus 2.14 | 只在 `settings.html` 中加载，桌宠窗口不引入 |

按阶段引入：Phaser（阶段 6 坦克大战）、electron-builder（阶段 6 打包）。

## 目录

```text
electron/
  main/
    index.ts                 应用入口：单实例锁、创建窗口/托盘、退出流程
    windows/pet-window.ts    桌宠窗口：透明置顶、鼠标穿透、拖动、位置恢复
    windows/settings-window.ts 控制面板窗口：单例、隐藏标题栏 + 系统按钮覆盖层、主题同步
    ipc/pet-ipc.ts           桌宠 IPC：校验发送方与参数
    ipc/settings-ipc.ts      控制面板 IPC：只接受面板窗口的请求
    menus.ts                 托盘菜单与右键菜单（原生 Menu）
    tray.ts                  托盘图标（运行时由 logo 几何光栅化）
    services/
      config-schema.ts       配置 schema（zod：更新时严格校验，读取时按字段容错）
      config-store.ts        JSON 配置读写（原子写入、防抖保存）
      settings-service.ts    设置的唯一入口：按分区读取/更新/恢复默认，并广播变化
      secure-storage.ts      safeStorage（DPAPI）加密的密钥存储
      ai/connection-test.ts  OpenAI 兼容接口的连接测试
      pointer-tracker.ts     全局光标轮询（位置不变则不发 IPC）
      window-bounds.ts       多显示器可见性修正（纯函数）
      logo-bitmap.ts         logo 光栅化（纯函数）
  preload/index.ts           contextBridge 暴露受限 API：window.marimo.pet / window.marimo.settings
shared/                      主进程与渲染进程共用的类型、默认值与 IPC 契约（pet / settings / theme / ipc）
src/
  app/pet/                   桌宠窗口入口（PetApp.vue、bridge.ts）
  app/settings/              控制面板入口（SettingsApp.vue、bridge.ts）
  app/router/                面板路由与导航项
  app/stores/                pet.ts（桌宠状态）、settings.ts（主进程设置的镜像）
  components/pet/            PetOrb / PetEyes / PetBubble
  components/common/         SettingsCard / PageHeader / PetPreview
  composables/               光标追踪、手势、眨眼、交互区域、待机浮动、表单草稿、主题
  views/                     控制面板的 6 个页面
  services/mock-dialogue.ts  本地模拟台词
  styles/panel.css           面板主题变量（浅色 / 深色）
  utils/                     纯函数：眼睛偏移、外观解析、手势判定、气泡时长、浮动曲线、纯数据克隆
tests/                       Vitest 单元测试
pet.html / settings.html     两个窗口的 HTML（含 CSP）
```

与规格书第 9 节的差异：

- 新增 `shared/`：主进程和渲染进程都需要的类型（`PetSettings`、IPC 通道）放在这里，避免主进程反向依赖 `src/`。
- 不创建 `PetContextMenu.vue`：右键菜单使用 Electron 原生 `Menu.popup`。HTML 菜单会被 280×340 的透明窗口裁切，而原生菜单不会。
- 两个渲染入口：`pet.html`（桌宠）和 `settings.html`（控制面板），桌宠窗口因此不必加载 Element Plus 和路由。规格书中的 `SettingsView.vue` 拆分为"桌宠设置"和"外观"（侧栏切换）。
- AI Provider 将放在主进程（`electron/main/services/ai/`），渲染进程只保留调用门面。规格书把 `services/ai` 放在 `src/` 下，这与"敏感请求经主进程发起"的要求矛盾。

## 进程与安全

- 所有窗口：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 两个窗口共用一个 preload，只暴露 `window.marimo.pet` 和 `window.marimo.settings` 上的固定方法，不暴露 `ipcRenderer`，也不把 IPC event 对象转发给页面。
- 主进程的每个 IPC 处理器都会校验 `event.sender`：桌宠通道只接受桌宠窗口，面板通道只接受面板窗口。因此即使桌宠页面被注入脚本，也无法修改 AI 配置或写入密钥。
- 设置更新使用严格的 zod schema（未知字段、越界值直接拒绝并返回错误信息）；读取配置文件时则按字段容错，坏字段回退到默认值，不影响其他字段。
- 禁止新窗口（`setWindowOpenHandler` → deny）和页面导航（`will-navigate` → preventDefault）。
- CSP：`default-src 'self'; script-src 'self'`。
- 气泡文本使用 `{{ }}` 渲染（纯文本），全项目不使用 `v-html`。
- 配置 schema 会剥离未知字段，所以即使有人往 `config.json` 里写入 `apiKey`，也不会被保留或回写。

### 密钥

- API Key 通过 `safeStorage.encryptString`（Windows 上为 DPAPI）加密，以 base64 存入 `userData/secrets.json`，与普通配置分开。每个 AI 配置一条，键名为 `ai:<配置 ID>`；读取时会丢弃不符合该格式的条目。
- 渲染进程只有 `getAIKeyStatus / setAIKey(profileId) / deleteAIKey(profileId)` 三个方法，**没有读取明文的接口**；状态只返回"哪些配置 ID 有密钥"。明文只在主进程发请求时解密使用。
- 只能为已保存的配置写入密钥。配置从列表中删除时，主进程在 `onChange` 中对比新旧列表，删除被移除配置的密钥。启动时不会清理"孤儿"密钥，以免配置文件损坏导致密钥被误删。
- 旧版本的单个 `aiApiKey` 在首次加载时迁移为 `ai:default`，与配置迁移后的 `default` 配置对应。
- 写入前校验：去除首尾空白，长度 1–512，不能包含空白字符。
- `safeStorage` 不可用时拒绝保存（不会退回明文存储），面板会提示原因。
- Pinia 状态只保存 `hasKey` 布尔值，不持久化任何东西。
- 局限：DPAPI 绑定的是系统用户，同一用户下运行的其他程序仍可请求解密。这是本地桌面应用的普遍限制。

### 连接测试

`testConnection` 在主进程中请求 `GET {baseUrl}/models`（OpenAI 兼容接口的标准端点，DeepSeek、通义千问兼容模式、OpenAI、Ollama 都支持）：

- 除 `localhost / 127.0.0.1 / ::1` 外必须是 HTTPS，否则直接拒绝，避免密钥被明文发送。
- 测试对象是一个 AI 配置的表单内容（先经严格 schema 校验），所以无需保存就能测试；使用的是该配置 ID 名下已保存的密钥。
- 按状态码与异常归类为：地址格式错误、非 HTTPS、未保存密钥、密钥无效或无权限（401/403）、地址不存在（404）、限流（429）、服务端错误（5xx）、超时、网络错误。成功时返回延迟，以及所填模型是否在模型列表中（响应不是标准格式时显示为"未知"）。
- 返回给页面的消息只包含类别和状态码，不包含密钥和服务器原始响应。

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

### 设置的数据流

主进程的 `SettingsService` 是唯一的数据源：

1. 面板调用 `settings.update(section, patch)`；主进程按严格 schema 校验，失败时返回错误信息，页面用 `ElMessage` 提示。
2. 校验通过后写入 `config.json`（防抖 + 原子写入），并触发 `onChange`：
   - 桌宠窗口：应用置顶、缩放、穿透模式，推送新的 `PetViewSettings`（含宠物名字）；
   - 控制面板：广播 `settings:changed`，Pinia store 同步；
   - 应用层：更新 `nativeTheme.themeSource`、开机启动项（仅打包版本）。
3. 托盘或右键菜单修改开关也走同一个入口，所以面板中的状态始终与菜单一致。

表单分两种：人设使用 `useSectionDraft`、AI 配置页对选中的单个配置维护草稿（"保存 / 撤销修改"；没有本地修改时会自动同步外部变化），其他页面即时生效。

### AI 配置列表

```ts
interface AISettings {
  activeProfileId: string | null // null = 未启用 AI
  profiles: AIProfile[] // 最多 20 个
}
interface AIProfile {
  id: string // 面板用 crypto.randomUUID() 生成，主进程校验 /^[a-z0-9-]{1,40}$/
  name: string
  providerId: AIProviderId
  baseUrl: string
  model: string
  timeoutMs: number
  temperature: number
  maxTokens: number
}
```

- 严格校验（更新时）：ID 格式、ID 不重复、`activeProfileId` 必须为 null 或指向存在的配置。
- 读取容错：缺少可用 ID 的条目和重复 ID 被丢弃；其余字段逐个回退到该服务商预设的默认值；`activeProfileId` 指向不存在的配置时变为 null。空列表会被保留（用户可能删掉了所有配置）。
- 迁移：旧的单配置格式（`ai.providerId / baseUrl / model …`）读取时转换为 ID 为 `default` 的配置并设为启用。
- 列表操作（添加、复制、删除、启用 / 停用）立即保存；表单编辑需要点"保存"，有未保存的修改时切换配置会先确认。
- 阶段 3 的对话服务通过 `getActiveAIProfile` 取得当前配置及其密钥。
- "恢复默认配置"不包含 AI 配置列表，避免一并删除用户的密钥；AI 配置只能在 AI 配置页逐个删除。

Vue 的响应式对象是 Proxy，无法通过 `structuredClone` 或 IPC 的结构化克隆传输，所以所有发往 bridge 的数据都先经过 `plainClone`（JSON 往返）。

### 主题

- 三种模式：系统 / 浅色 / 深色，保存在 `appearance.theme`。
- 主进程设置 `nativeTheme.themeSource`，使原生菜单、标题栏覆盖层按钮（`titleBarOverlay`）跟随主题；渲染进程根据模式（"系统"时读取 `prefers-color-scheme`）切换 `html.dark`，启用 Element Plus 的暗色变量。
- 配色：浅色为蓝白（背景 `#f4f6fb`，强调色 `#4f68b0`，即 logo 的蓝色）；深色为深蓝黑（背景 `#101217`，强调色提亮为 `#7d93e0` 以保证对比度）。
- 没有采用"橙黑"方案：桌宠本体是蓝色，橙色强调色会让面板和桌宠看起来像两个产品；深色主题下继续使用蓝色强调色，桌宠预览也更协调。

### 控制面板窗口

- 单例：再次打开时聚焦已有窗口，并通过 `panel:navigate` 跳转到指定页面。
- `titleBarStyle: 'hidden'` + `titleBarOverlay`：保留系统的最小化、最大化、关闭按钮，标题栏颜色随主题更新。
- 程序被再次启动时（`second-instance`），显示桌宠并打开控制面板总览。
