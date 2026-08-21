# GitHub 与 Demo 发布清单

这份清单把本地作品集项目发布为公开仓库和可访问 Demo。发布动作需要你自己的 GitHub、Vercel 或 Cloudflare 账号授权；源码不包含任何账号凭据。

## 1. 发布前检查

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:e2e
pnpm run test:visual
pnpm run build
```

同时确认：

- `.env`、Token、API Key 和个人配置没有进入 Git；
- `.env.example` 只包含 mock provider 占位说明；
- README 中没有虚构的在线地址、用户研究结果或成绩提升结果；
- `playwright-report/`、`test-results/` 和本地工具目录已被 `.gitignore` 忽略。

## 2. 建议仓库信息

- Repository：`ai-learning-planner`
- Description：`AI personalized holiday learning planner for portfolio demo`
- Visibility：Public（如果用于求职展示）
- README：使用根目录 README，不要把压缩包或其他作品放入仓库。

## 3. 本地提交建议

```bash
git add .
git commit -m "chore: prepare AI Learning Planner portfolio release"
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

如果当前仓库已经存在 `origin`，先核对它是否指向你准备公开的仓库，不要直接覆盖陌生远程地址。

## 4. 部署选项

### Vercel

- Framework Preset：Vite
- Install Command：`pnpm install --frozen-lockfile`
- Build Command：`pnpm run build`
- Output Directory：`dist`
- `vercel.json` 已提供 SPA 深链接 fallback。

### Cloudflare Pages

- Build command：`pnpm run build`
- Build output directory：`dist`
- `public/_redirects` 会在构建时复制到输出目录，支持 SPA 深链接。

## 5. 上线后真实验证

- 打开根地址，确认首次访问是空白用户状态。
- 点击“体验高中生 Demo”，确认六科、诊断、计划和今日流程可进入。
- 直接打开 `/diagnosis`、`/plan`、`/today`、`/weekly-review`，确认刷新后不返回 404。
- 用手机宽度检查首页、诊断、计划、今日、周复盘和设置无横向滚动。
- 在 README 的 `GitHub 与部署` 小节填入真实 URL，并记录部署日期。
