# AI Learning Planner User Flow

```mermaid
flowchart TD
  A[Landing] --> B[体验高中生 Demo]
  B --> C[课程诊断]
  C --> D[生成总课表]
  D --> E[预览并确认计划]
  E --> F[今日执行]
  F --> G[记录 Evidence]
  G --> H[周复盘]
  H --> I[Plan Recovery 预览]
  I -->|确认| J[写入可撤销 ChangeSet]
  I -->|拒绝| E
```

## Stage contract

| Stage | Input | Output | User control |
| --- | --- | --- | --- |
| Course diagnosis | score, self-assessment, goal | current strength, problem, confidence, next action | run again, add evidence, read limitations |
| Priority | diagnosis, target, dependencies, deadline | ordered learning focus | change course priority |
| Plan | stages, Task Pool, capacity, timetable | draft and weekly schedule | inspect diff, activate, restore version |
| Today | scheduled task | completion, actual minutes, self-check | start, edit, defer, skip, complete |
| Recovery | execution Evidence, missed tasks, constraints | comparable adjustment candidates | compare, confirm, cancel, undo |

## Failure states

- Incomplete course data: ask for the missing score or self-assessment.
- Low-confidence diagnosis: keep the baseline plan available and suggest a small diagnostic step.
- Capacity conflict: keep the task in Task Pool instead of pretending the schedule is complete.
- Interrupted plan: preserve task intent and propose a reversible adjustment.
- No verified resource: show an honest empty state or a user-provided link path.
