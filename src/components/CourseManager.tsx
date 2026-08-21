import { useMemo, useState } from 'react'
import { applyNormalizationToCourse } from '../courseCatalog.ts'
import { createCourse, reconcileCourseStage } from '../data.ts'
import { getCourseIntelligence } from '../courseIntelligence.ts'
import { buildGlobalPlanDraft } from '../globalPlanner.ts'
import { createCourseChangeSet, revertChangeSet } from '../changeSets.ts'
import { courseFieldErrors, goalFieldErrors } from '../providers.ts'
import { useStore } from '../store.tsx'
import type { Course, GlobalPlanDraft } from '../types.ts'
import { Icon, InlineNotice, Modal } from '../components.tsx'
import { OnboardingCourseForm } from './OnboardingCourseForm.tsx'
import { goalTypes } from '../goalTypes.ts'


const inheritedStage = (courses: Course[]): Course['stage'] => {
  const values = [...new Set(courses.filter(course => !course.archivedAt).map(course => course.stage).filter(Boolean))]
  return values.length === 1 ? values[0] : ''
}

const initialCourse = (courses: Course[]) => {
  const stage = inheritedStage(courses)
  return createCourse({
    stage,
    curriculum: { ...createCourse().curriculum, stage },
    courseType: stage === '高中' ? '学科课程' : '',
    examType: '期末考试',
  })
}

export function CourseManager({ className = 'button secondary', label = '添加课程' }: { className?: string; label?: string }) {
  const { data, updateData, notify } = useStore()
  const [open, setOpen] = useState(false)
  const [course, setCourse] = useState(() => initialCourse(data.courses))
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GlobalPlanDraft | null>(null)

  const lastCourseChange = useMemo(() => [...data.changeSets].reverse().find(change => change.scope === 'course' && !change.revertedAt), [data.changeSets])

  const reset = () => {
    setCourse(initialCourse(data.courses))
    setShowErrors(false)
    setError('')
    setPreview(null)
  }

  const close = () => { setOpen(false); reset() }

  const updateCourse = (patch: Partial<Course>) => {
    setCourse(current => {
      let next = { ...current, ...patch }
      if ('stage' in patch) {
        const reconciled = reconcileCourseStage(next, patch.stage ?? '')
        next = { ...reconciled.course, curriculum: { ...next.curriculum, stage: patch.stage ?? '' } }
      }
      if ('name' in patch) {
        next = applyNormalizationToCourse({ ...next, canonicalId: '', ambiguityResolved: false }, '')
        const intelligence = getCourseIntelligence(next, data.schedule)
        next = { ...next, goalSuggestions: intelligence.suggestedGoals, suggestionSource: next.name }
        if (!next.desiredResultEdited) next.desiredResult = intelligence.suggestedGoals[0] ?? ''
      }
      return next
    })
    setPreview(null)
  }

  const updateCurriculum = (patch: Partial<Course['curriculum']>) => {
    setCourse(current => ({ ...current, curriculum: { ...current.curriculum, ...patch } }))
    setPreview(null)
  }

  const resolveCourse = (canonicalId: string) => {
    setCourse(current => applyNormalizationToCourse(current, canonicalId))
    setPreview(null)
  }

  const duplicateMessage = () => {
    const normalizedName = (course.canonicalName || course.name).trim().toLocaleLowerCase('zh-CN')
    const duplicate = data.courses.find(item => !item.archivedAt && (
      course.canonicalId && item.canonicalId === course.canonicalId
      || (item.canonicalName || item.name).trim().toLocaleLowerCase('zh-CN') === normalizedName
    ))
    return duplicate ? `“${duplicate.name}”已经在课程列表中，请编辑现有课程，不要重复添加。` : ''
  }

  const generatePreview = async () => {
    if (loading) return
    setShowErrors(true)
    const fieldErrors = { ...courseFieldErrors(course), ...goalFieldErrors(course) }
    const duplicate = duplicateMessage()
    if (Object.keys(fieldErrors).length || duplicate) {
      setError(duplicate || Object.values(fieldErrors)[0])
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.course-manager [aria-invalid="true"]')?.focus())
      return
    }
    setLoading(true); setError('')
    try {
      await Promise.resolve()
      const temporary = { ...data, courses: [...data.courses, { ...course, displayOrder: data.courses.length }] }
      const draft = buildGlobalPlanDraft(temporary)
      setPreview(draft)
      if (!draft.validation.valid) setError(draft.validation.reasons[0] || '新总课表草案未通过校验，请调整课程或时间。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法生成课表变化预览。')
    } finally { setLoading(false) }
  }

  const confirm = () => {
    if (!preview || !preview.validation.valid) return
    const added = { ...course, displayOrder: data.courses.length }
    const nextCourses = [...data.courses, added]
    const changeSet = createCourseChangeSet(data.courses, nextCourses, `添加课程“${added.name}”`, added.id)
    updateData(current => ({
      ...current,
      courses: [...current.courses, added],
      planningBases: { ...current.planningBases, ...preview.planningBases },
      globalPlanDraft: preview,
      globalPlanHistory: [...current.globalPlanHistory.filter(item => item.id !== preview.id), preview],
      changeSets: [...current.changeSets, changeSet],
      planChanges: [`已加入“${added.name}”并保存总课表变化草案；当前启用计划尚未替换。`, ...current.planChanges].slice(0, 50),
    }))
    notify(`已加入“${added.name}”。新课表仍需在学习计划页确认启用。`)
    close()
  }

  const undoLast = () => {
    if (!lastCourseChange) return
    updateData(current => revertChangeSet(current, lastCourseChange.id))
    notify(`已撤销：${lastCourseChange.reason}`)
  }

  const oldTaskCount = data.tasks.filter(task => task.status !== '已完成' && task.status !== '进行中').length
  const newCourseTaskCount = preview?.tasks.filter(task => task.courseId === course.id).length ?? 0

  return <>
    <span className="course-manager-trigger">
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="plus" /> {label}</button>
      {lastCourseChange && <button type="button" className="text-button course-undo" onClick={undoLast} title={lastCourseChange.reason}><Icon name="undo" size={15} /> 撤销最近课程变更</button>}
    </span>
    {open && <Modal title="添加课程" description="先补充课程事实和目标，再预览它对全部课程课表的影响。" onClose={close} footer={preview ? <><button type="button" className="button secondary" onClick={() => setPreview(null)}>返回修改</button><button type="button" className="button primary" disabled={!preview.validation.valid} onClick={confirm}>确认加入课程</button></> : <><button type="button" className="button secondary" onClick={close}>取消</button><button type="button" className="button primary" disabled={loading} onClick={generatePreview}>{loading ? '正在校验课表…' : '预览课表变化'}</button></>}>
      <div className="course-manager">
        {!preview ? <>
          <OnboardingCourseForm course={course} errors={courseFieldErrors(course)} showErrors={showErrors} onUpdate={updateCourse} onCurriculum={updateCurriculum} onResolve={resolveCourse} onDelete={close} onArchive={close} />
          <section className="course-manager-goal" aria-labelledby="new-course-goal-title"><h3 id="new-course-goal-title">目标与完成结果</h3><div className="option-group"><span>当前目标</span><div>{goalTypes.map(goal => <button type="button" key={goal} className={course.goalType === goal ? 'selected' : ''} aria-pressed={course.goalType === goal} onClick={() => updateCourse({ goalType: goal })}>{goal}</button>)}</div></div><div className="form-grid two">{course.assessmentMode === 'score' && <label className="field"><span>目标分数</span><input type="number" min="0" max={course.maxScore || undefined} value={course.targetScore} onChange={event => updateCourse({ targetScore: event.target.value === '' ? '' : Number(event.target.value) })} /></label>}<label className="field"><span>目标日期</span><input type="date" value={course.targetDate} onInput={event => updateCourse({ targetDate: event.currentTarget.value })} onChange={event => updateCourse({ targetDate: event.target.value })} /></label><label className="field full-span"><span>希望达到的结果</span><textarea rows={3} value={course.desiredResult} onChange={event => updateCourse({ desiredResult: event.target.value, desiredResultEdited: true })} /></label></div></section>
        </> : <section className="course-impact-preview"><span className="section-kicker">加入课程后课表变化</span><h3>“{course.name}”会追加到课程末尾</h3><dl><div><dt>课程数量</dt><dd>{data.courses.filter(item => !item.archivedAt).length} → {data.courses.filter(item => !item.archivedAt).length + 1}</dd></div><div><dt>当前未完成任务</dt><dd>{oldTaskCount} 项保持不变</dd></div><div><dt>新课程候选任务</dt><dd>{newCourseTaskCount} 项</dd></div><div><dt>新总课表</dt><dd>{preview.tasks.length} 项 · 第 {preview.version} 版草案</dd></div></dl><InlineNotice tone={preview.validation.valid ? 'success' : 'error'}>{preview.validation.valid ? '草案已通过日期、节次、容量、冲突、课程和资源统一校验。确认后只保存草案，不会静默替换当前计划。' : preview.validation.reasons[0]}</InlineNotice></section>}
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
      </div>
    </Modal>}
  </>
}

export function CourseEditorDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const { data, updateData, notify } = useStore()
  const original = data.courses.find(item => item.id === courseId)
  const [draftCourse, setDraftCourse] = useState<Course | null>(() => original ? { ...original, curriculum: { ...original.curriculum, syllabusUnits: original.curriculum.syllabusUnits.map(unit => ({ ...unit, prerequisites: [...unit.prerequisites] })) } } : null)
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState('')
  const [planPreview, setPlanPreview] = useState<GlobalPlanDraft | null>(null)
  const [loading, setLoading] = useState(false)
  if (!original || !draftCourse) return null

  const update = (patch: Partial<Course>) => {
    setDraftCourse(current => {
      if (!current) return current
      let next = { ...current, ...patch }
      if ('stage' in patch) {
        const reconciled = reconcileCourseStage(next, patch.stage ?? '')
        next = { ...reconciled.course, curriculum: { ...next.curriculum, stage: patch.stage ?? '' } }
      }
      if ('name' in patch) next = applyNormalizationToCourse({ ...next, canonicalId: '', ambiguityResolved: false }, '')
      return next
    })
    setPlanPreview(null)
  }

  const previewChanges = async () => {
    if (loading) return
    setShowErrors(true)
    const errors = { ...courseFieldErrors(draftCourse), ...goalFieldErrors(draftCourse) }
    const duplicate = data.courses.find(item => item.id !== draftCourse.id && !item.archivedAt && (
      draftCourse.canonicalId && item.canonicalId === draftCourse.canonicalId
      || (item.canonicalName || item.name).trim().toLocaleLowerCase('zh-CN') === (draftCourse.canonicalName || draftCourse.name).trim().toLocaleLowerCase('zh-CN')
    ))
    if (duplicate || Object.keys(errors).length) return setError(duplicate ? `课程与“${duplicate.name}”重复。` : Object.values(errors)[0])
    setLoading(true); setError('')
    try {
      await Promise.resolve()
      const nextCourse = { ...draftCourse, revision: original.revision + 1 }
      const temporary = { ...data, courses: data.courses.map(item => item.id === nextCourse.id ? nextCourse : item) }
      const preview = buildGlobalPlanDraft(temporary)
      setPlanPreview(preview)
      if (!preview.validation.valid) setError(preview.validation.reasons[0] || '更新后的总课表未通过校验。')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法生成课程变更预览。') }
    finally { setLoading(false) }
  }

  const confirm = () => {
    if (!planPreview || !planPreview.validation.valid) return
    const nextCourse = { ...draftCourse, revision: original.revision + 1 }
    const nextCourses = data.courses.map(item => item.id === nextCourse.id ? nextCourse : item)
    const changeSet = createCourseChangeSet(data.courses, nextCourses, `编辑课程“${original.name}”`, original.id)
    updateData(current => ({ ...current, courses: current.courses.map(item => item.id === nextCourse.id ? nextCourse : item), globalPlanDraft: planPreview, globalPlanHistory: [...current.globalPlanHistory.filter(item => item.id !== planPreview.id), planPreview], planningBases: { ...current.planningBases, ...planPreview.planningBases }, changeSets: [...current.changeSets, changeSet] }))
    notify('课程修改已保存，新总课表草案需确认后才会替换当前计划。')
    onClose()
  }

  return <Modal title={`编辑“${original.name}”`} description="课程事实变化会影响诊断置信度和总课表；先预览，再保存。" onClose={onClose} footer={planPreview ? <><button className="button secondary" onClick={() => setPlanPreview(null)}>返回修改</button><button className="button primary" disabled={!planPreview.validation.valid} onClick={confirm}>确认保存</button></> : <><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={loading} onClick={previewChanges}>{loading ? '正在校验…' : '预览计划变化'}</button></>}>
    <div className="course-manager">
      {!planPreview ? <><OnboardingCourseForm course={draftCourse} errors={courseFieldErrors(draftCourse)} showErrors={showErrors} onUpdate={update} onCurriculum={patch => { setDraftCourse(current => current ? { ...current, curriculum: { ...current.curriculum, ...patch } } : current); setPlanPreview(null) }} onResolve={canonicalId => setDraftCourse(current => current ? applyNormalizationToCourse(current, canonicalId) : current)} onDelete={onClose} onArchive={onClose} /><section className="course-manager-goal"><h3>目标与完成结果</h3><div className="option-group"><span>当前目标</span><div>{goalTypes.map(goal => <button type="button" key={goal} className={draftCourse.goalType === goal ? 'selected' : ''} aria-pressed={draftCourse.goalType === goal} onClick={() => update({ goalType: goal })}>{goal}</button>)}</div></div><div className="form-grid two">{draftCourse.assessmentMode === 'score' && <label className="field"><span>目标分数</span><input type="number" min="0" max={draftCourse.maxScore || undefined} value={draftCourse.targetScore} onChange={event => update({ targetScore: event.target.value === '' ? '' : Number(event.target.value) })} /></label>}<label className="field"><span>目标日期</span><input type="date" value={draftCourse.targetDate} onChange={event => update({ targetDate: event.target.value })} /></label><label className="field full-span"><span>希望达到的结果</span><textarea rows={3} value={draftCourse.desiredResult} onChange={event => update({ desiredResult: event.target.value, desiredResultEdited: true })} /></label></div></section></> : <section className="course-impact-preview"><span className="section-kicker">课程修改后的课表变化</span><h3>第 {planPreview.version} 版总课表草案</h3><dl><div><dt>当前课程任务</dt><dd>{data.tasks.filter(task => task.courseId === original.id && task.status !== '已完成').length} 项保持启用</dd></div><div><dt>新草案课程任务</dt><dd>{planPreview.tasks.filter(task => task.courseId === original.id).length} 项</dd></div><div><dt>全部课程任务</dt><dd>{planPreview.tasks.length} 项</dd></div><div><dt>诊断状态</dt><dd>课程事实变化后待复核</dd></div></dl><InlineNotice tone={planPreview.validation.valid ? 'success' : 'error'}>{planPreview.validation.valid ? '新草案已通过统一校验；保存后仍需在计划页确认启用。' : planPreview.validation.reasons[0]}</InlineNotice></section>}
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
    </div>
  </Modal>
}
