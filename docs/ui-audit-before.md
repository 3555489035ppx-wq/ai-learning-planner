# 假期跃迁修改前审查

审查日期：2026-07-16。范围：现有 9 个路由、全局组件、数据模型、排程、Provider、localStorage 与现有测试。

## 基线

- `pnpm test`：35/35 通过。
- `pnpm build`：通过；43 个模块，CSS 48.00 kB（gzip 10.65 kB），JS 436.98 kB（gzip 132.81 kB）。
- 浏览器控制台：1 个 error，`/favicon.ico` 404；无 warning。
- 桌面截图：`docs/screenshots/before/`，包含首页、首次规划、今日、诊断、计划、资源、进展、设置。
- 受保护页面以隔离 Playwright 会话的空数据状态记录，没有改写用户浏览器数据。

## Hallmark audit

### Critical

1. **Tell：AI landing template fingerprint**  
   **Where：** `src/pages/Landing.tsx:9`、`src/index.css:70-84`。  
   **Severity：** critical。  
   **Fix：** 保留任务书指定的居中 Hero，但删除无效锚点，把三列改为有方向和分隔的真实输入→判断→执行流程，使结构服务于产品而非模板。

2. **Tell：dashboard card monoculture**  
   **Where：** `src/index.css:512-538`，并影响今日、资源、进展。  
   **Severity：** critical。  
   **Fix：** 今日改为单一下一任务，进展改为摘要→证据→调整的连续结构，卡片只用于需要边界的可操作对象。

### Major

1. **Tell：tiny utility type**  
   **Where：** `src/index.css:47-617` 共 50 余处 10–12px 文本。  
   **Severity：** major。  
   **Fix：** 交互文字统一 15–16px，非交互元信息不低于 13px，阶段正文 15–16px。

2. **Tell：tight tracking as polish**  
   **Where：** `src/index.css:72,106,134,139,158,218,477,527,545`。  
   **Severity：** major。  
   **Fix：** 中文标题字距收敛到 `0` 至 `-0.02em`。

3. **Tell：equal-card stage wall**  
   **Where：** `src/pages/Diagnosis.tsx:126`、`src/index.css:193-197`。  
   **Severity：** major。  
   **Fix：** 当前阶段展开，完成/未来阶段进入紧凑轨道，点击查看具体知识点、练习与成果。

4. **Tell：admin board masquerading as a plan**  
   **Where：** `src/pages/Plan.tsx`、`src/index.css:233-257,496-510`。  
   **Severity：** major。  
   **Fix：** 七列任务板改为每日 4＋4＋2 节次表，任务详情收进弹层，空节保持安静但可操作。

### Minor

1. **Tell：decorative numbering**  
   **Where：** `src/pages/Progress.tsx:89`。  
   **Severity：** minor。  
   **Fix：** 移除 01–04 模板编号，按真实周数据和下一步行动排序。

统计：2 critical · 4 major · 1 minor。

## Web Design Guidelines

### P0 / P1

- `src/components.tsx` 有 `main#main-content`，但没有“跳到主要内容”链接。
- 多数表单虽有可见 label，但缺少稳定 `name`、`autocomplete`、`aria-describedby`；提交失败仅显示顶部错误，没有聚焦第一个错误字段。
- `src/index.css:599` 在 380px 下允许 `.button` 换行，违反主按钮和导航 affordance 单行要求。
- 图标按钮有 `aria-label`，但没有统一 Tooltip；菜单容器声明 `role=menu`，子项未完成对应菜单语义。
- 资源筛选只保存在组件状态，URL、返回键和可分享链接无法还原筛选。
- 计划拖动有点击替代路径，但当前替代路径只选日期，不选择 4＋4＋2 节次。
- favicon 404 是现存唯一控制台错误。

### 已有良好基础

- Modal 已实现 Tab 焦点循环、Escape、焦点恢复与背景滚动锁定。
- 全局已有 `focus-visible`、44px 基础控件、reduced-motion 和 Toast live region。
- 设置页 section 查询参数已同步浏览器地址。

## React Best Practices

### High

- `src/pages/Today.tsx:33-35` 直接轮播首次诊断题，今日自检不绑定任务且可在短周期重复。
- `src/pages/Onboarding.tsx:122` 串行生成各课程诊断；课程之间独立，应并行并防陈旧请求覆盖。
- `src/providers.ts` 同时承担诊断、计划、资源、进展、教练和事件记录，已成为高耦合巨型模块。

### Medium

- `src/pages/Resources.tsx:17-24` 将多个筛选保存为页面 state，既不是 URL 事实，也可能在课程变化后保留旧筛选。
- 多处渲染循环重复 `find(course.id)`，计划和进展应建立 `Map` 索引。
- Store 已使用 schema key、迁移、try/catch 与 storage 监听，这是可保留的正确方向；需要把新课程目录、课表模板、每日自检和撤销状态纳入迁移与 hydrate。

## 可点击元素和死入口基线

- 一级导航：今日、课程诊断、学习计划、学习资源、学习进展、设置；学习教练为全局抽屉。
- 首页：产品理念锚点、开始规划；“产品理念”只执行页内滚动，信息价值弱。
- 首次规划：添加/删除课程、三步前后切换、诊断生成；现有字段不含完整教材与 4＋4＋2 节次设置。
- 今日、计划、资源、进展、设置中的可见按钮均能找到事件处理器，未发现纯装饰 `<button>`；但 `/weekly-review` 被重定向到进展，属于缺失的产品入口。
- 禁用按钮普遍只有 opacity，没有就近说明禁用原因。

