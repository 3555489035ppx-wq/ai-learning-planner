# 假期跃迁 GPT 源码包说明

本压缩包是 2026-07-18 第二轮回归修改后的纯源码交付包，不包含 `node_modules`、`dist`、旧压缩包、Playwright 报告或截图二进制文件。

## 主要内容

- `src/`：React、TypeScript 业务源码与数据模型
- `server/`：Provider 服务端接口骨架
- `tests/`：81 项单元与逻辑回归测试
- `e2e/`：12 项 Playwright 完整流程与视觉断言
- `public/`、`scripts/`、`specs/`：公共资源、构建脚本和规范
- `package.json`、`pnpm-lock.yaml`：依赖与锁文件
- `CHANGELOG-regression-2.md`：本轮修改记录
- `TEST-RESULTS-regression-2.md`：最终测试结果
- `docs/product-logic.md`：规划、诊断、排程和版本逻辑
- `docs/resource-coverage.md`：109 门课程的资源覆盖报告

## 本地运行

```bash
pnpm install
pnpm run dev
```

## 验证

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:e2e
pnpm run build
```

最终结果：ESLint 通过、TypeScript 通过、单元测试 81/81、端到端测试 12/12、生产构建通过。
