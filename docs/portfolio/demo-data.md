# 本地作品集演示数据

通过 `node --experimental-strip-types scripts/create-portfolio-seed.mjs <scenario>` 生成 JSON。

| 场景 | 参数 | 用途 |
|---|---|---|
| `high-school-recovery` | 高中数学 9/100、目标 60、六周、每天两小时 | 低置信度诊断、Task Pool、Evidence、Recovery |
| `high-school-six` | 高中语文、数学、英语、地理、政治、历史 | 六科计划、差异化诊断和课程上下文隔离 |
| `product-design-isolation` | Photoshop、Illustrator、Rhino | 设计课程隔离和资源匹配 |
| `computer-science-isolation` | Python、数据结构、高等数学 | 多学科计划与 courseId 隔离 |

脚本只输出 JSON，不写入浏览器和项目默认数据。E2E 或手动调试时应注入独立浏览器上下文的 localStorage；真实用户的默认空状态不受影响。
