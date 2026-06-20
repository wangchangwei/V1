# Vite + Vue 3 极简模板

## 使用场景

本模板是 V1 项目的轻量级前端脚手架，专为快速启动、低资源占用设计。

**适用场景：**
- 纯前端项目（HTML/CSS/JS 单页应用）
- Vue 3 单文件组件（SFC）开发
- 快速原型验证
- AI 辅助编程（V1 Workspace）

**不适合：**
- 需要服务端渲染（SSR）— 使用 Next.js 模板
- 需要 Express/Koa 等 Node.js 后端 — 使用 Full-stack 模板

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | ^3.5 | 响应式 UI 框架 |
| TypeScript | ^5.7 | 类型安全 |
| Vite | ^6.0 | 构建工具 + Dev Server |
| vue-i18n | ^9.14 | 国际化 |

## 项目结构

```
/workspace
├── index.html          # Vue SPA 入口（可被 login.html 等覆盖）
├── src/
│   ├── main.ts        # Vue 应用启动
│   ├── App.vue        # 根组件（空白，等待 AI 生成）
│   ├── i18n.ts       # vue-i18n 配置 + locale 持久化
│   ├── style.css      # 全局样式
│   ├── shims-vue.d.ts # Vue SFC TypeScript 模块声明
│   └── locales/
│       ├── en.json    # 英文翻译
│       └── zh.json    # 中文翻译
├── vite.config.ts     # Vite 配置（含 login.html 插件）
├── tsconfig.json
└── package.json
```

## 预览行为

Vite dev server 监听 `PORT` 环境变量（由 V1 后端分配）。

**`/` 路由规则：**
1. 若 `/workspace/login.html` 存在 → 返回 `login.html`（供 AI 生成独立页面时预览）
2. 否则 → 返回 Vue SPA（`src/main.ts` 挂载到 `#app`）

**这意味着：**
- AI 生成独立 HTML 页面时，预览会自动显示该页面
- AI 生成 Vue 组件时，需要确保入口正确挂载

## 开发命令

```bash
bun install     # 安装依赖
bun run dev     # 启动 dev server（PORT 环境变量决定端口）
bun run build   # 生产构建
```

## AI 开发规范

1. **页面入口优先 Vue SFC** — 优先在 `src/App.vue` 中编写组件，而非独立 HTML 文件
2. **国际化** — 使用 `vue-i18n`，翻译键定义在 `src/locales/en.json` 和 `zh.json`
3. **语言切换** — 使用 `useI18n()` + `locale.value = "en"|"zh"`
4. **TypeScript** — Vue 组件使用 `<script setup lang="ts">`
5. **不要硬编码页面标题** — `index.html` 的 `<title>` 留空，由 Vue 组件动态设置

## 已知约束

- 本模板仅包含前端构建，无后端依赖
- V1 Workspace 通过 iframe 嵌入预览，预览 URL = `http://127.0.0.1:<PORT>/`
- 热更新（HMR）由 Vite 自动处理
