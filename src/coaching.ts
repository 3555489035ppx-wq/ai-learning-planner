import { addDays, localDateISO, localTimestamp } from './dateUtils.ts'
import type { AppData, CoachingRequest, Course, MentorProfile } from './types.ts'

/**
 * Local demo catalog for the human-in-the-loop coaching flow.
 * These profiles are intentionally labelled as demo data until a real mentor
 * directory and permission model are connected.
 */
export const demoMentors = (): MentorProfile[] => {
  const today = localDateISO()
  return [
    {
      id: 'mentor-chen-math',
      name: '陈老师',
      role: '高中数学 · 基础重建',
      subjects: ['数学与统计', '高中数学'],
      expertise: ['函数与不等式', '错因分类', '基础题独立完成'],
      teachingStyle: '先定位卡点，再用一题一反馈建立稳定步骤。',
      intro: '适合“听懂但不会写”或基础题反复丢步骤的学习者。',
      verified: true,
      availability: [
        { id: 'chen-1', date: addDays(today, 1), start: '19:30', end: '20:15', status: 'available' },
        { id: 'chen-2', date: addDays(today, 3), start: '10:00', end: '10:45', status: 'available' },
        { id: 'chen-3', date: addDays(today, 5), start: '19:30', end: '20:15', status: 'available' },
      ],
    },
    {
      id: 'mentor-zhou-english',
      name: '周老师',
      role: '高中英语 · 阅读与写作',
      subjects: ['大学英语与语言考试', '高中英语'],
      expertise: ['词汇语法', '阅读定位', '写作结构'],
      teachingStyle: '先拆出失分环节，再用限时练习建立可复用的检查顺序。',
      intro: '适合词汇认识但阅读速度慢、写作不知道如何组织的学习者。',
      verified: true,
      availability: [
        { id: 'zhou-1', date: addDays(today, 2), start: '19:30', end: '20:15', status: 'available' },
        { id: 'zhou-2', date: addDays(today, 6), start: '10:00', end: '10:45', status: 'available' },
      ],
    },
    {
      id: 'mentor-li-chinese',
      name: '李老师',
      role: '高中语文 · 阅读与表达',
      subjects: ['新闻传播与汉语言文学', '高中语文'],
      expertise: ['文本理解', '古诗文阅读', '作文表达'],
      teachingStyle: '把模糊的“没读懂”拆成证据定位、结构判断和表达修订。',
      intro: '适合阅读题能看懂大意，但答题和作文缺少稳定方法的学习者。',
      verified: true,
      availability: [
        { id: 'li-1', date: addDays(today, 1), start: '14:00', end: '14:45', status: 'available' },
        { id: 'li-2', date: addDays(today, 4), start: '19:30', end: '20:15', status: 'available' },
      ],
    },
    {
      id: 'mentor-hu-geography',
      name: '胡老师',
      role: '高中地理 · 图表与区域分析',
      subjects: ['通用技能', '高中地理'],
      expertise: ['区域认知', '过程分析', '图表判读'],
      teachingStyle: '从图表信息出发，练习把观察、推理和结论写成完整链条。',
      intro: '适合地图和材料题信息抓不全、会背概念但不会迁移的学习者。',
      verified: true,
      availability: [
        { id: 'hu-1', date: addDays(today, 3), start: '19:30', end: '20:15', status: 'available' },
        { id: 'hu-2', date: addDays(today, 7), start: '10:00', end: '10:45', status: 'available' },
      ],
    },
    {
      id: 'mentor-sun-politics',
      name: '孙老师',
      role: '高中政治 · 材料分析',
      subjects: ['经济金融会计与管理', '高中思想政治'],
      expertise: ['概念框架', '材料分析', '规范表达'],
      teachingStyle: '先搭概念框架，再训练从材料中提取有效论据并完成规范表达。',
      intro: '适合知识点记过但材料题不会组织答案的学习者。',
      verified: true,
      availability: [
        { id: 'sun-1', date: addDays(today, 2), start: '14:00', end: '14:45', status: 'available' },
        { id: 'sun-2', date: addDays(today, 5), start: '19:30', end: '20:15', status: 'available' },
      ],
    },
    {
      id: 'mentor-wang-physics',
      name: '王老师',
      role: '高中物理 · 基础模型训练',
      subjects: ['物理', '高中物理'],
      expertise: ['受力分析', '运动学图像', '牛顿运动定律'],
      teachingStyle: '从画图、列条件到选择定律，先稳定每道基础题的起点。',
      intro: '适合概念能听懂，但题目变化后不知道如何建立模型的学生。',
      verified: true,
      availability: [
        { id: 'wang-1', date: addDays(today, 2), start: '10:00', end: '10:45', status: 'available' },
        { id: 'wang-2', date: addDays(today, 5), start: '14:00', end: '14:45', status: 'available' },
      ],
    },
    {
      id: 'mentor-qian-history',
      name: '钱老师',
      role: '高中历史 · 史料与论证',
      subjects: ['新闻传播与汉语言文学', '高中历史'],
      expertise: ['时空线索', '史料分析', '论证表达'],
      teachingStyle: '用时间线和史料证据连接知识点，避免只背结论不理解因果。',
      intro: '适合历史知识点零散、材料题缺少时空和因果线索的学习者。',
      verified: true,
      availability: [
        { id: 'qian-1', date: addDays(today, 3), start: '14:00', end: '14:45', status: 'available' },
        { id: 'qian-2', date: addDays(today, 6), start: '19:30', end: '20:15', status: 'available' },
      ],
    },
    {
      id: 'mentor-lin-design',
      name: '林老师',
      role: '产品设计 · 作品反馈',
      subjects: ['平面与图像设计', 'UIUX与交互设计', '产品设计理论与项目'],
      expertise: ['作品拆解', '设计过程表达', '可编辑文件检查'],
      teachingStyle: '围绕交付标准做批注，不替你完成作品。',
      intro: '适合需要把“会一点软件”转化成可展示作品的学习者。',
      verified: true,
      availability: [
        { id: 'lin-1', date: addDays(today, 2), start: '14:00', end: '14:45', status: 'available' },
        { id: 'lin-2', date: addDays(today, 4), start: '19:30', end: '20:15', status: 'available' },
      ],
    },
    {
      id: 'mentor-wu-code',
      name: '吴老师',
      role: '编程基础 · 独立调试',
      subjects: ['编程语言与Web开发', '计算机系统网络与数据库'],
      expertise: ['函数与数据结构', '边界测试', '调试思路'],
      teachingStyle: '让你先说出输入、输出和失败边界，再一起缩小问题。',
      intro: '适合能跟着教程完成，但离开示例后无法独立实现的学习者。',
      verified: true,
      availability: [
        { id: 'wu-1', date: addDays(today, 1), start: '20:00', end: '20:45', status: 'available' },
        { id: 'wu-2', date: addDays(today, 6), start: '10:00', end: '10:45', status: 'available' },
      ],
    },
  ]
}

export const coachingStatusLabel: Record<CoachingRequest['status'], string> = {
  requested: '等待导师确认',
  confirmed: '已确认',
  rescheduled: '待重新选择时段',
  in_progress: '辅导进行中',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未出席',
}

export const mentorForRequest = (request: CoachingRequest, mentors = demoMentors()) => mentors.find(mentor => mentor.id === request.mentorId)

export const mentorsForCourse = (course: Course | undefined, mentors = demoMentors()) => {
  if (!course) return []
  const courseTerms = [course.name, course.canonicalName, course.subjectDomain].filter(Boolean)
  return mentors.filter(mentor => mentor.subjects.some(subject => courseTerms.some(term => subject === term || subject.includes(term) || term.includes(subject))))
}

export const buildCoachingAgenda = (courseName: string, point: string, problem: string, goal: string) => [
  `用 3 分钟复述“${point || courseName}”目前卡在哪里`,
  `拆解一个与“${point || courseName}”对应的最小任务，观察是概念、步骤还是检查环节出错`,
  `完成一个不看示例的微型练习，并确认下一步如何放回学习计划`,
  goal.trim() ? `回到本次目标：${goal.trim()}` : '确定下一次独立练习的完成标准',
  problem.trim() ? `保留问题记录：${problem.trim()}` : '记录仍需补充的问题',
]

export const createCoachingRequest = (data: AppData, input: Pick<CoachingRequest, 'courseId' | 'taskId' | 'knowledgePoint' | 'problem' | 'goal' | 'urgency' | 'preferredDate' | 'preferredSlotId' | 'mentorId' | 'source'>): CoachingRequest => {
  const course = data.courses.find(item => item.id === input.courseId)
  return {
    id: crypto.randomUUID(),
    ...input,
    status: 'requested',
    agenda: buildCoachingAgenda(course?.name ?? '当前课程', input.knowledgePoint, input.problem, input.goal),
    studentNote: '',
    mentorNote: '',
    createdAt: localTimestamp(),
    updatedAt: localTimestamp(),
  }
}
