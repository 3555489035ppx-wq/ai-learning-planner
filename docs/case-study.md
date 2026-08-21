# AI Learning Planner · Case Study

## 1. Project Background

Holiday planning is a constrained decision problem. Students need to balance course gaps, targets, available time, and interruptions rather than simply collect more tasks.

## 2. User Problem

Students cannot easily turn scores or self-assessments into priorities, explain why a task is scheduled, or recover when the original plan no longer fits reality.

## 3. Product Goal

Build a local-first personal learning system that creates explainable plans, captures execution evidence, and proposes reversible recovery.

## 4. My Responsibilities

Product framing, information architecture, diagnosis and planning flow, AI interaction contract, data model, frontend implementation, accessibility states, demo content, and project documentation.

## 5. Product Flow

Learning profile → Course diagnosis → Priority → Stages / Task Pool → Weekly Schedule → Today → Evidence → Weekly Review → Plan Recovery.

## 6. AI Workflow

Input: courses, scores, self-assessment, goals, deadlines, and available time.

Context: course domain, diagnosis history, existing tasks, execution evidence, and constraints.

Processing: diagnose candidate gaps, rank priorities, place tasks, and generate recovery options.

Output: diagnosis cards, plan draft, task rationale, recovery diff, and ChangeSet.

Human review: inspect confidence, edit or reject, activate, cancel, or undo.

## 7. Design Decisions

The design separates learning intent from calendar placement, keeps explanations next to actions, treats backlog as a valid state, and requires review before plan changes are applied.

## 8. Demo Result

The [Live Demo](https://ai-learning-planner-sepia.vercel.app/) opens the product homepage. Click **体验高中生 Demo** to load the high-school case, then reach diagnosis, the 30-day plan, daily execution, and recovery preview in about three minutes.

## 9. Future Plan

The next product questions are real user research, longer-term outcome evidence, authenticated sync, and a server-side AI provider with model-quality evaluation. These are future work, not current demo claims.
