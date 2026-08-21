# GitHub 学习产品与 1 对 1 辅导研究

日期：2026-08-02

## 结论

没有一个仓库适合直接替换当前“假期跃迁”产品。最可行的方式是组合式借鉴：保留当前项目的证据驱动学习计划与计划恢复作为核心；借鉴成熟项目的知识上下文、学习内容生成、预约排班和会话记录模式；1 对 1 辅导作为“学习困难出现后的人工介入闭环”，而不是泛聊天或独立的家教市场。

## 项目解析

| 项目 | 可借鉴部分 | 不建议直接复用的原因 | 许可证核验 |
| --- | --- | --- | --- |
| [DeepTutor](https://github.com/HKUDS/DeepTutor) | 持久化学习上下文、知识库、记忆、可追溯证据、从问答到练习和掌握路径的统一运行时 | 规模很大，架构与当前 Vite 本地优先应用不兼容；它主要是 AI 导师，不是人类 1 对 1 辅导 | README 标注 Apache-2.0，但仍需按实际复制范围保留声明 |
| [PageLM](https://github.com/CaviraOSS/PageLM) | 从学习材料生成测验、闪卡、笔记、播客；文档上下文问答；Homework Planner / ExamLab 等内容到学习行为的转化 | 需要独立 Node/TS/LangChain/LangGraph 后端，且不适合直接塞进现有本地数据模型 | CaviraOSS Community License；商业使用/转售需书面许可，不建议直接复制代码 |
| [BiLearnHub](https://github.com/dabster108/BiLearnHub-AI-Powered-Learning-Platform) | 课程隔离的 RAG、学习历史上下文、个性化路径、测验生成 | Next.js + FastAPI + Firebase + Pinecone + Groq，云依赖和数据层成本明显超出当前 MVP | README 提及 LICENSE.md，但抓取时未找到文件，不能视为已核验 |
| [Studiq AI Tutor](https://github.com/devvsin/studiq-ai-tutor) | 文档上传→上下文辅导→测验/知识图谱的产品链路 | Flask/Mongo 单体；会话和文档内容有内存存储；实现较像演示项目 | README 声称 MIT，但抓取时未找到 LICENSE 文件，不能直接复制 |
| [Smart AI Planner](https://github.com/GhanshyamJha05/smart-ai-planner) | 考试日期、学科难度、可用时间、生产力与疲劳信号驱动的动态排程 | 实现可验证性有限，仓库页面未显示许可证；与当前已有的计划恢复能力重叠 | 未核验，不建议复制 |
| [AI/ML Adaptive Learning Platform](https://github.com/Sanjayt215/AI-ML-Adaptive-Learning-Platform) | 目标→学习路径、先修关系、弱项检测、资源推荐、LLM tutor + 本地检索 fallback | 提交数量少、成熟度有限，且没有可核验许可证 | 未显示许可证，只作竞品参考 |
| [mentor_booking_system](https://github.com/Long9904/mentor_booking_system) | mentor/student/slot/booking 领域模型、角色 API、冲突检查、预约更新事件 | .NET 多微服务，明显过重；仓库页面未显示许可证 | 未核验，只借鉴数据模型和状态机 |
| [Tutor-Uberization](https://github.com/M1sh13l/Tutor-Uberization) | 找导师→查看档案→选择时段→预约→消息的页面流程 | 静态 PHP/MySQL 演示；支付明确是模拟，消息没有真实持久化 | 未显示许可证，只借鉴 UX 结构 |
| [CodeMentor AI Platform](https://github.com/NickScherbakov/codementor-ai-platform) | AI 服务边界、Socket.IO 会话房间、实时消息/协作、前后端分层 | 面向编程辅导；部分后端能力明确是 mock；对当前本地优先产品过重 | MIT，适合阅读架构，但不应照搬整套系统 |
| [Frappe LMS](https://github.com/frappe/lms) | 课程/章节/课次、直播课、作业、测验、认证和批次角色 | Frappe + Vue 体系很重；AGPL-3.0 对闭源或商业产品有合规影响 | AGPL-3.0，不能无条件复制到当前产品 |
| [studyield](https://github.com/studyield/studyield) | 自适应评估、智能辅导、知识图谱、教回（teach-back）、多代理和实时能力 | NestJS/Postgres/Redis/Qdrant/ClickHouse 等完整平台化架构，远超当前 P0 | AGPL-3.0，只作架构参考 |
| [adaptive-knowledge-graph](https://github.com/MysterionRise/adaptive-knowledge-graph) | 带来源片段和引用的知识图谱 RAG、先修关系、混合检索、掌握度评估 | 是受控的本地 demo，未覆盖完整身份、租户和 LMS；技术栈仍需重建 | MIT；可借鉴评估与证据设计，不能直接接入现有前端 |

## 对当前项目的判断

当前项目已经有更强的差异化：学习概况、课程诊断、优先级、任务池、周课表、今日执行、学习证据、周复盘和计划恢复。直接引入一个完整 LMS 或“左聊天右回答”的 AI tutor，会稀释“证据驱动计划恢复”这个作品集主线，并立即引入账号、后端、权限、多用户同步和实时服务等成本。

最值得复用的是模式，不是代码：

1. 从 DeepTutor / BiLearnHub 借鉴“上下文范围明确、结果带证据”的 AI 交互。
2. 从 mentor_booking_system 借鉴预约领域模型和状态转换。
3. 从 Tutor-Uberization 借鉴导师档案、时段选择和预约流程的信息架构。
4. 从 CodeMentor 借鉴未来实时会话的服务边界，但不把 Socket.IO 作为当前 P0 依赖。
5. 从 adaptive-knowledge-graph 借鉴知识点、先修关系和学习证据之间的映射。

## 1 对 1 辅导产品定义

建议名称：**1 对 1 学习辅导 / Learning Support Session**。

核心闭环：

`学习困难或计划风险 → 申请辅导 → 匹配导师与时段 → 会前目标 → 辅导会话 → 导师记录与微测 → 学习证据 → 计划调整预览 → 学生确认`

AI 不直接代替导师，也不直接修改计划。AI 负责从已有课程、任务、诊断和证据中识别辅导需求、准备会前材料、生成会后草稿；导师和学生共同完成关键确认。

### AI Flow

- Input：课程、知识点/任务、学生的问题描述、已有学习证据、目标日期、可用时间。
- Context：课程结构、任务优先级依据、诊断结果、历史辅导记录和最近的计划执行状态。
- Processing：识别问题类型（概念、方法、时间、动力或策略），给出导师匹配依据，生成会前议程；会后根据导师记录和学生微测生成跟进任务草稿。
- Output：导师候选、可用时段、会前问题清单、结构化会后记录、下一步任务和计划调整预览。
- Interaction：学生可编辑、拒绝或重新生成；导师确认会前目标和会后记录；学生确认是否把跟进任务写入计划。
- State：无辅导需求、待补充信息、等待导师确认、已确认、改期、进行中、已完成、未出席、取消、无可用导师、失败。
- Persistence：辅导申请、预约、会话消息/记录、关联课程/任务/证据、跟进任务、计划 ChangeSet。
- Human-in-the-loop：导师确认学习判断和会后建议；学生确认任何计划变更；AI 不能成为最终裁决者。

