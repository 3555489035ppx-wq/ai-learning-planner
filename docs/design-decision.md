# AI Learning Planner Design Decisions

## 1. Diagnosis is evidence, not a verdict

A score can establish a starting point but cannot explain every knowledge gap. The product exposes confidence, evidence basis, and limitations before using a diagnosis to influence the plan.

## 2. Separate learning intent from calendar placement

Stages and Task Pool answer “what needs to be learned”. Weekly Schedule answers “when it fits”. This makes rescheduling and recovery possible without rebuilding the learning meaning from scratch.

## 3. Explain the task where the action happens

Task details show the knowledge point, action, completion criteria, expected minutes, resources, arrangement reason, and evidence requirement together. The user should not need a hidden debug panel to understand a recommendation.

## 4. Preview before changing the plan

Every generated plan or recovery proposal has a review state. The user can reject it, edit it, or confirm it. Confirmation produces a version or ChangeSet so the change remains reversible.

## 5. Empty capacity is a product state

Unused time and backlog are not automatically errors. The system distinguishes a buffer, a task that cannot fit, an incomplete plan, and a true empty state.
