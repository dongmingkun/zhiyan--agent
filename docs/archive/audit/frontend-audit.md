# 前端版本、依赖及重复代码审核

审核基准：`work/original/05—作品代码`。清理目标：`outputs/zhiyan-agent`。原始目录未修改。只将包内文档作为材料阅读，未执行其中部署、认证或其他指令。

## 结论及已完成操作

1. 实际主页使用带 `v3.19` 的 app、auth、quiz-system、quiz-ui 和 style。无版本的 5 个同名文件是历史版本，当前主页不加载，且并非字节相同副本。已从整理输出删除这 5 个文件，保留原始快照。
2. 活动 JavaScript 的 AST 发现 2 个同一对象内被后定义覆盖的纯方法，已只删除早期定义；实际生效的后期定义原样保留。
3. 活动 CSS 发现 8 个同一父级作用域内语义完全相同的规则，另有 1 个同一规则内重复声明。已只删除早期定义。未跨 `@media` 合并，未改变任何剩余规则顺序，未将不同值的覆盖规则误判为冗余。
4. 保留当前 `v3.19` 文件名、公共 `js/css/lib` 路径及加载顺序。未重写 App 巨型对象，未删除兜底逻辑或不同 UI 入口。
5. 本次删除 372,848 字节历史文件，精确删除 1,333 字节冗余代码，共 374,181 字节。图片、字体补齐及首页/SW 修改由根代理完成，不计入此处减量。

## 实际加载顺序及分类

主页共加载 14 个第一方 JS、4 个第三方本地 JS、1 个远程 JS、3 个 CSS，以及 7 段内联脚本。

| 分类 | 文件及顺序 |
|---|---|
| 核心样式 | `css/style.v3.19.css` → `lib/katex/katex.min.css` → `css/ui-polish.css` |
| 第三方 | KaTeX 本体及 auto-render 为 defer；ECharts、Tesseract CDN、Three.js 保持原顺序 |
| 基础配置、知识及数学 | `js/config.js` → `knowledge.js` → `math-tools.js` → `visualizer.js` → `chat.js` |
| 题库、资源及练习 | `quiz-bank.js` → `exam-papers.js` → `resources.js` → `quiz-system.v3.19.js` → `quiz-ui.v3.19.js` |
| 认证及主控制器 | `auth.v3.19.js` → `app.v3.19.js` |
| 社交和装饰 | `social.js` → defer `floating-formulas.js` |
| PWA | `manifest.json`、图标、`sw.js`，首页通过 load 事件注册 SW |

`chat.js` 提供 `ChatEngine`，主程序实际使用例如 `ChatEngine.handleGreeting()`；不能因为问答也出现在 App 内就删除。`social.js` 等同理应保留。

`App`、`Auth`、`QuizSystem` 等使用全局对象。`index.html` 大量内联事件依赖这些名称，不能直接将脚本改为 module。主程序注册 `DOMContentLoaded` 初始化，随后显式 `window.App = App`，最后注册 PWA 安装逻辑；顺序保留。

## 已删除的历史文件

| 已删除文件 | 原始大小（字节） | 保留版本大小（字节） |
|---|---:|---:|
| `js/app.js` | 146941 | `app.v3.19.js`：660673 |
| `js/auth.js` | 5740 | `auth.v3.19.js`：33307 |
| `js/quiz-system.js` | 9887 | `quiz-system.v3.19.js`：13330 |
| `js/quiz-ui.js` | 54428 | `quiz-ui.v3.19.js`：102983 |
| `css/style.css` | 155852 | `style.v3.19.css`：497755 |

上述大小为清理前字节数。4 个 JS 新旧版本都不是相同文件或简单追加关系；判定保留版本依据是当前主页引用及根代理完成的线上字节核对，而非文件名或注释日期。源码存在晚于当前日期的版本注释，不能据此声称比线上更新。

README 的部分部署说明仍引用旧 `app.js`，而真实配置入口已是 `js/config.js`；应在整理后的入口说明中更正。`social.js` 开头旧名称仅是注释，不是运行时引用。

## JavaScript 精确清理

所有行号指原始快照。

| 文件 / 方法 | 删除的早定义 | 保留的生效定义 | 依据 |
|---|---|---|---|
| `js/app.v3.19.js` / `scrollToBubbleTop` | 6128–6134（及其过期说明） | 6575–6578 | 同一 `App` 对象的静态纯方法，早定义必然被后定义覆盖；保留 `_scrollToElement` 版本 |
| `js/quiz-ui.v3.19.js` / `_esc` | 1979–1981 | 2385–2387 | 同一 `QuizUI` 对象的静态纯方法；保留含双引号转义的最终版本 |

原始 `quiz-ui.js` 也有 `_esc` 重复，但该历史文件已整体删除。其余活动第一方 JS 未发现重复静态对象属性。

`app.v3.19.js` 顶层仅有 5 条语句：API_BASE 声明、13423 行的 App 对象声明、DOMContentLoaded 初始化绑定、window 导出、末尾 87 行 PWA IIFE。因此“按顶层 IIFE 拆分 app”基本不会实现功能分类。真正拆分需拆对象属性并保持 this、全局引用及初始化时机，超出本次可证明等价的去重范围，已保持原结构。

## CSS 精确清理

只删除表中较早规则，保留较晚规则。PostCSS 验证每对规则属于同一个父节点，选择器、声明顺序、属性、值、important 均相同。

| 文件 | 选择器 | 删除原始行 | 保留原始行 | 作用域 |
|---|---|---|---|---|
| style.v3.19.css | `.app-container.fullscreen ~ .bottom-nav` | 434 | 13056 | 根 |
| style.v3.19.css | `#chat-send:active` | 726 | 733 | 根 |
| style.v3.19.css | `.mobile-mode .knowledge-layout` | 7062 | 7134 | 根 |
| style.v3.19.css | 管理员页两种分页按钮选择器 | 11926–11929 | 11935–11938 | 同一个 `@media (max-width: 768px)` |
| style.v3.19.css | `.sidebar .nav-group.open .nav-chevron` | 14381 | 15217 | 根 |
| style.v3.19.css | 暗色主题侧边栏子导航 `.nav-item` | 14414–14416 | 15237 | 根 |
| ui-polish.css | `.snotes-header` | 587–593 | 1055–1061 | 根 |
| ui-polish.css | `.snotes-toc-chapter-title:hover` | 622 | 1160 | 根 |

额外删除 `#chat-input` 内原始第 676 行的 `font-family: inherit;`，保留同一块第 685 行相同声明。其他移动端、深色模式、主题、知识导航和抽屉修复虽多次出现选择器，其声明或作用域不同，保留现有层叠顺序。

## 资源和 PWA

- 原压缩包缺失 `/icon-180.png`、`/icon-192.png`、`/icon-512.png`；根代理已负责补齐。512 图标同时参与 manifest 及 SW 的 `cache.addAll`。任一预缓存 URL 失败可能使整组预缓存未完成；原 SW 还静默吞掉安装缓存错误，应由根代理修复。
- KaTeX CSS 引用 20 个 `.ttf` 后备字体，原包不存在，现有 `.woff`、`.woff2` 存在。根代理确认线上 TTF 也 404，正在从匹配版本官方包补齐。不能删整个 KaTeX 字体目录。
- 页面 APK 下载链接的 URL 编码解码后对应 `uploads/apk/秩研Agent-1.0.6.apk`，包内存在（147142 字节）。原包还有 1.0.0–1.0.5 历史 APK，由根代理按发布资源策略整理。
- `about:blank` 是合法 iframe 空白页，不是缺失本地文件。
- Tesseract 使用固定版本 `5.0.4` CDN，本身及识别 worker/模型需要网络。这是当前系统依赖，不可把全站描述为完全离线独立。
- 首页内联 PWA 与 app 末尾 PWA 各自监听 `beforeinstallprompt`，分别控制悬浮安装按钮和首页安装卡。二者功能重叠但 UI 不同，不应简单删掉某一监听来“去重”。可在未来统一保存 prompt 并让两种按钮共享服务；本次原样保留。
- 知识体系应急骨架、侧栏定位、关闭抽屉捕获阶段兜底、WelcomeLogin 独立登录代码都有不同失败场景或不同入口。不能仅因主 App 有对应功能即删除。

## 验证及边界

- 清理前逐文件断言输出文件等于原始快照，避免覆盖其他代理变动。
- Acorn 成功解析原始全部 18 个第一方 JS；活动文件中两处删除均是无计算 key、kind=init 的纯方法。
- 对 2 个修改 JS，以原始 AST 仅移除对应早定义后的结构为期望值，忽略位置/原始字面量格式信息后，与整理文件重新解析的 AST 完全相同，证明没有其他表达式或方法改变。
- 14 个剩余第一方 JS 全部运行 `node --check` 通过。
- 对 2 个修改 CSS，每次删节点前断言同一父作用域及声明结构相等；重新解析输出与原树只移除这些节点后的 AST 相等，规则顺序与剩余声明均保持。
- 完整逐项机器记录在 `work/frontend-cleanup-results.json`，首次分析在 `work/frontend-inspect.json`。清理脚本为 `work/frontend-cleanup.cjs`，仅用于本次有固定快照断言的整理，不建议作为一般自动去重工具。
- 上述是静态资源/语法/结构等价验证，不替代登录、管理员、后端真实模型服务等运行态测试；根代理负责浏览器与全项目验收。网页比对只能证明可访问前端与线上一致，不能据此证明未公开的后端源码就是服务器的最新提交。
