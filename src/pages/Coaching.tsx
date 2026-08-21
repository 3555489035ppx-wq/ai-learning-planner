import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createTask, CURRENT_SCHEMA_VERSION } from '../data.ts'
import { addDays, localDateISO, localTimestamp } from '../dateUtils.ts'
import { coachingStatusLabel, createCoachingRequest, demoMentors, mentorForRequest, mentorsForCourse } from '../coaching.ts'
import { Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { highSchoolDemoTutorRecommendations, isHighSchoolDemo } from '../demoData.ts'
import { useStore } from '../store.tsx'
import type { CoachingRequest, MentorProfile } from '../types.ts'

const allMentors = demoMentors()

const formatDate = (date: string) => date ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00`)) : '未选择日期'

const activeStatus = new Set<CoachingRequest['status']>(['requested', 'confirmed', 'rescheduled', 'in_progress'])

export default function Coaching() {
  const { data, updateData, notify } = useStore()
  const [searchParams] = useSearchParams()
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedMentorId, setSelectedMentorId] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [mentorFilter, setMentorFilter] = useState('')
  const [form, setForm] = useState({ courseId: searchParams.get('course') || data.courses[0]?.id || '', taskId: searchParams.get('task') || '', knowledgePoint: '', problem: '', goal: '', urgency: '本周需要' as const, preferredDate: '', preferredSlotId: '' })
  const [sessionNote, setSessionNote] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [videoReady, setVideoReady] = useState(false)
  const [error, setError] = useState('')

  const activeRequest = data.coachingRequests.find(request => request.id === selectedRequestId) ?? data.coachingRequests.find(request => activeStatus.has(request.status))
  const selectedCourse = data.courses.find(course => course.id === form.courseId) ?? data.courses[0]
  const selectedTask = data.tasks.find(task => task.id === form.taskId)
  const matchingMentors = useMemo(() => mentorsForCourse(selectedCourse, allMentors), [selectedCourse])
  const mentorCatalog = matchingMentors
  const selectedMentor = matchingMentors.find(mentor => mentor.id === selectedMentorId)
  useEffect(() => {
    if (selectedMentorId && !matchingMentors.some(mentor => mentor.id === selectedMentorId)) {
      queueMicrotask(() => {
        setSelectedMentorId('')
        setSelectedSlotId('')
        setForm(current => ({ ...current, preferredDate: '', preferredSlotId: '' }))
      })
    }
  }, [matchingMentors, selectedMentorId])
  const suggestedTask = data.tasks.find(task => task.status === '进行中' || (task.status === '待完成' && task.difficulty === '进阶')) ?? data.tasks.find(task => task.status === '待完成')
  const filteredMentors = useMemo(() => matchingMentors.filter(mentor => !mentorFilter || mentor.subjects.includes(mentorFilter) || mentor.expertise.some(item => item.includes(mentorFilter))), [matchingMentors, mentorFilter])

  const openRequest = (mentor?: MentorProfile, slot?: MentorProfile['availability'][number], task = suggestedTask) => {
    const course = data.courses.find(item => item.id === task?.courseId) ?? data.courses[0]
    setSelectedMentorId(mentor?.id ?? '')
    setSelectedSlotId(slot?.id ?? '')
    setForm(current => ({
      ...current,
      courseId: course?.id ?? current.courseId,
      taskId: task?.id ?? '',
      knowledgePoint: task?.knowledgePoint ?? course?.mainDifficulty ?? '',
      problem: task?.changeNote?.includes('未完成') ? task.changeNote : '',
      goal: task?.completionCriteria ? `完成后能够：${task.completionCriteria}` : course?.desiredResult ?? '',
      preferredDate: slot?.date ?? '',
      preferredSlotId: slot?.id ?? '',
    }))
    setError('')
    setRequestOpen(true)
  }

  const submitRequest = () => {
    if (!selectedCourse || !selectedMentor || !form.preferredDate || !form.preferredSlotId || !form.problem.trim() || !form.goal.trim()) {
      setError('请补充课程、导师时段、具体卡点和本次目标。')
      return
    }
    const request = createCoachingRequest(data, {
      courseId: selectedCourse.id,
      taskId: form.taskId || undefined,
      knowledgePoint: form.knowledgePoint.trim() || selectedCourse.mainDifficulty || selectedCourse.name,
      problem: form.problem.trim(),
      goal: form.goal.trim(),
      urgency: form.urgency,
      preferredDate: form.preferredDate,
      preferredSlotId: form.preferredSlotId,
      mentorId: selectedMentorId,
      source: searchParams.get('task') ? 'today' : 'user',
    })
    updateData(current => ({
      ...current,
      coachingRequests: [request, ...current.coachingRequests],
      coachingMessages: [...current.coachingMessages, { id: crypto.randomUUID(), requestId: request.id, role: 'system', text: `已提交 ${selectedMentor?.name ?? '导师'} 的辅导申请。当前是本地演示，确认状态由你手动推进。`, createdAt: localTimestamp() }],
      planChanges: [`已为“${request.knowledgePoint}”创建 1 对 1 辅导申请，后续跟进任务需要会后确认。`, ...current.planChanges],
    }))
    setSelectedRequestId(request.id)
    setRequestOpen(false)
    notify('辅导申请已保存。')
  }

  const patchRequest = (id: string, patch: Partial<CoachingRequest>) => updateData(current => ({ ...current, coachingRequests: current.coachingRequests.map(request => request.id === id ? { ...request, ...patch, updatedAt: localTimestamp() } : request) }))

  const confirmRequest = () => {
    if (!activeRequest) return
    patchRequest(activeRequest.id, { status: 'confirmed' })
    updateData(current => ({ ...current, coachingMessages: [...current.coachingMessages, { id: crypto.randomUUID(), requestId: activeRequest.id, role: 'mentor', text: '已确认本次目标和时段。请在会前准备一个最想解决的具体例子。', createdAt: localTimestamp() }] }))
    notify('已模拟导师确认。')
  }

  const startSession = () => {
    if (!activeRequest) return
    patchRequest(activeRequest.id, { status: 'in_progress' })
    updateData(current => ({ ...current, coachingMessages: [...current.coachingMessages, { id: crypto.randomUUID(), requestId: activeRequest.id, role: 'system', text: '会话已开始。先完成会前目标，再记录一个可验证的下一步。', createdAt: localTimestamp() }] }))
    notify('已进入本地演示辅导工作区。')
  }

  const sendMessage = () => {
    if (!activeRequest || !messageDraft.trim()) return
    const text = messageDraft.trim()
    updateData(current => ({ ...current, coachingMessages: [...current.coachingMessages, { id: crypto.randomUUID(), requestId: activeRequest.id, role: 'student', text, createdAt: localTimestamp() }, { id: crypto.randomUUID(), requestId: activeRequest.id, role: 'mentor', text: '收到。我会围绕这个例子追问你的判断步骤，不直接替你完成。', createdAt: localTimestamp() }] }))
    setMessageDraft('')
  }

  const completeSession = () => {
    if (!activeRequest) return
    if (!sessionNote.trim()) { setError('请先写下导师确认的结论或下一步，避免会话只留下“聊过了”。'); return }
    const course = data.courses.find(item => item.id === activeRequest.courseId)
    if (!course) return
    const followUpTask = createTask({
      id: crypto.randomUUID(), planId: `coaching:${activeRequest.id}`, date: '', originalPlannedDate: '', time: '', slotId: '',
      title: `${course.name} · 辅导后跟进：${activeRequest.knowledgePoint}`,
      action: `根据辅导结论完成一次独立练习：${sessionNote.trim()}`,
      courseId: course.id, stageLabel: '辅导后跟进', stageStartDate: localDateISO(), stageEndDate: addDays(localDateISO(), 7), knowledgePoint: activeRequest.knowledgePoint, unitId: activeRequest.knowledgePoint,
      estimatedMinutes: 25, minimumViableMinutes: 15, practiceMinutes: 20, quizMinutes: 5, practiceCount: 1,
      quizTask: '完成后记录：是否能独立完成、哪里仍需追问。', completionCriteria: '独立完成一次练习，并记录结果、用时和仍然不确定的步骤。', completionCriteriaItems: ['独立完成一次练习', '记录结果和用时', '记录仍不确定的步骤'],
      arrangementReason: '来自 1 对 1 辅导会后的人工确认，不自动占用已有节次。', rationale: { summary: `导师建议先验证“${activeRequest.knowledgePoint}”的独立完成能力。`, reasonCodes: ['diagnosis', 'user_priority'], evidenceIds: [], dependencyTaskIds: [], factors: [{ key: 'coaching', weight: .9, explanation: '基于本次辅导的人工记录。' }], confidence: .75, limitations: ['需要完成跟进任务后，才能判断辅导是否转化为稳定能力。'] }, evidenceRequirement: { acceptedTypes: ['task_completion', 'self_check', 'time_spent'], minimumCount: 1, completionRule: '完成独立练习并记录结果，不能只标记已读。' },
      status: '待确认', scheduleStatus: 'needs-confirmation', scheduleIssue: '辅导后跟进任务已进入任务池，请选择合适节次。', source: 'user', taskType: 'review', phaseId: `${course.id}:coaching`, weeklyGoalId: `${course.id}:coaching`, changeNote: '1 对 1 辅导后生成，等待学生确认排程。', reviewAt: addDays(localDateISO(), 2),
    })
    const now = localTimestamp()
    updateData(current => ({
      ...current,
      tasks: [...current.tasks, followUpTask],
      coachingRequests: current.coachingRequests.map(request => request.id === activeRequest.id ? { ...request, status: 'completed' as const, mentorNote: sessionNote.trim(), followUpTaskId: followUpTask.id, updatedAt: now } : request),
      coachingMessages: [...current.coachingMessages, { id: crypto.randomUUID(), requestId: activeRequest.id, role: 'mentor', text: `会后记录：${sessionNote.trim()}`, createdAt: now }],
      evidenceRecords: [...current.evidenceRecords, { id: crypto.randomUUID(), courseId: course.id, taskId: activeRequest.taskId, knowledgePointId: activeRequest.knowledgePoint, type: 'self_check' as const, source: 'user' as const, value: `1 对 1 辅导完成：${sessionNote.trim()}`, unit: 'text' as const, observedAt: now, provenance: { provider: 'user' as const, schemaVersion: CURRENT_SCHEMA_VERSION }, confidence: .75 }],
      planChanges: [`辅导已完成；跟进任务“${followUpTask.title}”进入任务池，等待你确认节次。`, ...current.planChanges],
    }))
    setError('')
    notify('辅导已完成，跟进任务已进入任务池。')
  }

  const currentMentor = activeRequest ? mentorForRequest(activeRequest, allMentors) : undefined
  const currentSlot = currentMentor?.availability.find(slot => slot.id === activeRequest?.preferredSlotId)
  const sessionMessages = activeRequest ? data.coachingMessages.filter(message => message.requestId === activeRequest.id) : []
  const activeCourse = activeRequest ? data.courses.find(course => course.id === activeRequest.courseId) : undefined
  const activeFollowUp = activeRequest?.followUpTaskId ? data.tasks.find(task => task.id === activeRequest.followUpTaskId) : undefined
  const demoMode = isHighSchoolDemo(data)

  return <div className="page coaching-page">
    <PageHeader eyebrow="1 对 1 学习辅导" title="把一个具体卡点，带到一次有结果的会话里" description="导师确认学习目标，系统整理上下文与会后跟进。当前导师、时段和会话状态是本地演示数据，不会伪装成真实在线服务。" actions={<Link className="button secondary" to="/today">回到今日执行</Link>} />
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {demoMode && <section className="demo-coaching-recommendations" aria-labelledby="demo-coaching-title"><div className="section-title"><div><span className="section-kicker">学习规划后的辅助服务推荐</span><h2 id="demo-coaching-title">只推荐与当前薄弱点相关的辅导</h2><p>这是 Demo 中的本地服务建议，不是购买页；真实接入需要导师资质、可用时段与隐私流程。</p></div></div><div>{highSchoolDemoTutorRecommendations.map(recommendation => { const course = data.courses.find(item => item.canonicalId === recommendation.courseCanonicalId); const mentor = allMentors.find(item => item.subjects.some(subject => subject === course?.subjectDomain)); return <article key={recommendation.courseCanonicalId}><span>{recommendation.title}</span><h3>{course?.canonicalName} · {course?.score}/{course?.maxScore} 分</h3><dl><div><dt>适合学生</dt><dd>{recommendation.suitable}</dd></div><div><dt>推荐原因</dt><dd>{recommendation.reason}</dd></div><div><dt>目标提升方向</dt><dd>{recommendation.goal}</dd></div></dl><button className="button secondary" onClick={() => openRequest(mentor, mentor?.availability[0], data.tasks.find(task => task.courseId === course?.id))}>查看辅导会话目标</button></article> })}</div></section>}

    {suggestedTask && <section className="coaching-bridge"><div><span className="section-kicker">来自你的学习证据</span><h2>这项任务值得一次人工确认吗？</h2><p><strong>{suggestedTask.title}</strong> · {suggestedTask.knowledgePoint}。如果你已经看过材料仍无法独立开始，可以把卡点带给导师，而不是继续堆更多资源。</p></div><button className="button primary" onClick={() => openRequest(undefined, undefined, suggestedTask)}>带这个卡点去辅导 <Icon name="arrow" /></button></section>}

    {activeRequest && <section className="coaching-session"><header><div><span className="section-kicker">当前辅导</span><h2>{activeCourse?.name ?? '课程'} · {activeRequest.knowledgePoint}</h2><p>{currentMentor?.name ?? '待确认导师'} · {formatDate(activeRequest.preferredDate)} {currentSlot ? `· ${currentSlot.start}–${currentSlot.end}` : ''}</p></div><span className={`status-pill ${activeRequest.status === 'completed' ? 'success' : activeRequest.status === 'requested' ? 'warning' : ''}`}>{coachingStatusLabel[activeRequest.status]}</span></header><div className="coaching-session-grid"><div><h3>本次目标</h3><p>{activeRequest.goal}</p><h3>会前卡点</h3><p>{activeRequest.problem}</p><h3>会前提纲</h3><ol className="clean-list">{activeRequest.agenda.map(item => <li key={item}>{item}</li>)}</ol></div><div className="coaching-session-actions">{activeRequest.status === 'requested' && <><InlineNotice>演示状态：真实产品这里会等待导师确认；现在可以推进到下一状态。</InlineNotice><button className="button primary" onClick={confirmRequest}>模拟导师确认</button></>}{activeRequest.status === 'confirmed' && <><button className="button primary" onClick={startSession}>进入辅导工作区</button><button className="button secondary" onClick={() => setVideoReady(true)}>模拟进入视频准备室</button></>}{activeRequest.status === 'in_progress' && <><div className="coaching-messages" aria-live="polite">{sessionMessages.map(message => <div className={`coaching-message ${message.role}`} key={message.id}><span>{message.role === 'mentor' ? currentMentor?.name ?? '导师' : message.role === 'student' ? '你' : '系统'}</span><p>{message.text}</p></div>)}</div><div className="coaching-message-compose"><input aria-label="发送会前或会中消息" value={messageDraft} onChange={event => setMessageDraft(event.target.value)} placeholder="例如：我在第二步不知道该检查什么" onKeyDown={event => { if (event.key === 'Enter') sendMessage() }} /><button className="button secondary" onClick={sendMessage} disabled={!messageDraft.trim()}>发送</button></div><label className="field"><span>导师确认的结论与下一步</span><textarea rows={4} value={sessionNote} onChange={event => setSessionNote(event.target.value)} placeholder="例如：先用 3 道同类题练习“写出定义域”，完成后再进入综合题。" /></label><button className="button primary" onClick={completeSession}>完成会话并生成跟进任务</button></>}{activeRequest.status === 'completed' && <><InlineNotice tone="success">会话记录已保存，人工建议已经转成学习证据。</InlineNotice><p className="coaching-follow-up">{activeRequest.mentorNote}</p>{activeFollowUp ? <Link className="button primary" to="/plan">去计划页确认跟进任务 <Icon name="arrow" /></Link> : null}</>}</div></div></section>}

    <section className="coaching-directory"><div className="section-title"><div><span className="section-kicker">导师目录 · 演示数据</span><h2>按你的学习问题选择会话类型</h2></div><select aria-label="按领域筛选导师" value={mentorFilter} onChange={event => setMentorFilter(event.target.value)}><option value="">全部领域</option>{[...new Set(data.courses.map(course => course.subjectDomain).filter(Boolean))].map(domain => <option key={domain} value={domain}>{domain}</option>)}</select></div><div className="mentor-list">{filteredMentors.map(mentor => <article className="mentor-row" key={mentor.id}><div className="mentor-identity"><div className="mentor-avatar">{mentor.name.slice(0, 1)}</div><div><h3>{mentor.name} <span className="verified-mark">已核验</span></h3><p>{mentor.role}</p><small>{mentor.intro}</small></div></div><div className="mentor-expertise"><div className="tag-list">{mentor.expertise.map(item => <span key={item}>{item}</span>)}</div><p>{mentor.teachingStyle}</p></div><div className="mentor-slots"><span>可选时段</span><div>{mentor.availability.filter(slot => slot.status === 'available').map(slot => <button type="button" key={slot.id} onClick={() => openRequest(mentor, slot)}>{formatDate(slot.date)}<strong>{slot.start}–{slot.end}</strong></button>)}</div></div></article>)}</div></section>

    <section className="coaching-roadmap"><div><span className="section-kicker">从演示到真实服务</span><h2>这项功能的产品边界</h2><p>当前版本先验证“困难出现后，人工辅导能否改变下一步学习行为”。真正接入多用户前，需要账号、权限、导师可用时间冲突检查、通知和隐私审计。</p></div><div className="coaching-roadmap-items"><article><strong>P0 · 有结果的辅导</strong><span>申请、预约、会前目标、会话记录、跟进任务</span></article><article><strong>P1 · 可持续协作</strong><span>真实导师确认、异步消息、日历提醒、历史反馈</span></article><article><strong>P2 · 服务化扩展</strong><span>视频、支付、导师撮合和家长/导师协作</span></article></div></section>

    {videoReady && <Modal title="视频准备室（本地演示）" description="真实接入时这里会创建带权限的会议房间；当前只验证进入前的状态与信息。" onClose={() => setVideoReady(false)} footer={<button className="button primary" onClick={() => setVideoReady(false)}>返回辅导</button>}><div className="video-room-preview"><div className="video-room-stage"><Icon name="coach" size={30} /><strong>等待双方进入</strong><span>{currentMentor?.name ?? '导师'} · {activeCourse?.name ?? '当前课程'}</span></div><dl className="task-detail-grid"><div><span>会前目标</span><strong>{activeRequest?.goal}</strong></div><div><span>权限状态</span><strong>仅学生与导师可见</strong></div></dl></div></Modal>}
    {requestOpen && <Modal title="申请一次有目标的辅导" description="请描述一个具体卡点。越具体，导师越能在 45 分钟内给出可执行反馈。" onClose={() => setRequestOpen(false)} footer={<><button className="button secondary" onClick={() => setRequestOpen(false)}>取消</button><button className="button primary" onClick={submitRequest}>提交辅导申请</button></>}><div className="form-grid two"><label className="field"><span>关联课程</span><select value={form.courseId} onChange={event => setForm(current => ({ ...current, courseId: event.target.value, taskId: '' }))}>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="field"><span>关联任务（可选）</span><select value={form.taskId} onChange={event => { const task = data.tasks.find(item => item.id === event.target.value); setForm(current => ({ ...current, taskId: event.target.value, knowledgePoint: task?.knowledgePoint ?? current.knowledgePoint })) }}><option value="">不关联具体任务</option>{data.tasks.filter(task => task.courseId === form.courseId).slice(0, 20).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className="field full-span"><span>知识点或技能卡点</span><input value={form.knowledgePoint} onChange={event => setForm(current => ({ ...current, knowledgePoint: event.target.value }))} placeholder="例如：函数定义域、蒙版边缘、函数调用" /></label><label className="field full-span"><span>我现在具体卡在哪里</span><textarea rows={3} value={form.problem} onChange={event => setForm(current => ({ ...current, problem: event.target.value }))} placeholder="不要只写“不会”。请写出你已经尝试过什么，以及在哪一步停住。" /></label><label className="field full-span"><span>这次辅导结束时，我希望能够</span><textarea rows={3} value={form.goal} onChange={event => setForm(current => ({ ...current, goal: event.target.value }))} placeholder="例如：能独立完成 3 道同类题，并知道如何检查定义域" /></label><label className="field"><span>紧急程度</span><select value={form.urgency} onChange={event => setForm(current => ({ ...current, urgency: event.target.value as typeof current.urgency }))}><option>本周需要</option><option>下周安排</option><option>暂不确定</option></select></label><label className="field"><span>导师与时段</span><select value={selectedMentorId} onChange={event => { setSelectedMentorId(event.target.value); setSelectedSlotId(''); setForm(current => ({ ...current, preferredDate: '', preferredSlotId: '' })) }}><option value="">请选择导师</option>{mentorCatalog.map(mentor => <option key={mentor.id} value={mentor.id}>{mentor.name} · {mentor.role}</option>)}</select></label><label className="field"><span>可用时段</span><select value={form.preferredSlotId || selectedSlotId} onChange={event => { const slot = selectedMentor?.availability.find(item => item.id === event.target.value); setSelectedSlotId(event.target.value); setForm(current => ({ ...current, preferredSlotId: event.target.value, preferredDate: slot?.date ?? '' })) }}><option value="">请选择时段</option>{selectedMentor?.availability.filter(slot => slot.status === 'available').map(slot => <option key={slot.id} value={slot.id}>{formatDate(slot.date)} · {slot.start}–{slot.end}</option>)}</select></label></div><InlineNotice>当前为本地演示：提交后会出现“等待导师确认”，你可以推进到确认、会话和跟进任务状态。</InlineNotice></Modal>}
  </div>
}
