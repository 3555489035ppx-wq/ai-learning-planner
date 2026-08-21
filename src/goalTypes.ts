import type { GoalType } from './types.ts'

/** Shared so every course editor exposes the same, complete goal vocabulary. */
export const goalTypes: GoalType[] = [
  '补弱', '补考', '巩固', '拔高', '四六级', '考研', '考证', '技能提升', '完成作品', '项目交付',
]
