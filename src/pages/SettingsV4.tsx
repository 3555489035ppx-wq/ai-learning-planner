import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon, InlineNotice, Modal, PageHeader } from '../components.tsx'
import { CourseEditorDialog, CourseManager } from '../components/CourseManager.tsx'
import { createCourseChangeSet, createTaskChangeSet } from '../changeSets.ts'
import { MIGRATION_BACKUP_KEY, SCHEMA_MIGRATION_BACKUP_KEY, V3_MIGRATION_BACKUP_KEY, V6_MIGRATION_BACKUP_KEY, V7_MIGRATION_BACKUP_KEY } from '../data.ts'
import { localDateISO, localTimestamp } from '../dateUtils.ts'
import { migrateV2ToV4, migrateV3ToV4, migrateV4ToV6, migrateV6ToV7, validateV6Data, validateV7Data } from '../migration.ts'
import { useStore } from '../store.tsx'
import { cloneDefaultTimeSlots as defaultTimeSlots, slotsForTemplate } from '../timetable.ts'
import { archiveActivePlans } from '../versioning.ts'
import type { AppData, Course, ResourceContentType, ResourceDifficulty, ResourcePlatform } from '../types.ts'
import { goalTypes } from '../goalTypes.ts'

const sections = [
  { id: 'profile', label: '个人资料' },
  { id: 'education', label: '教育阶段与教材' },
  { id: 'courses', label: '课程与目标' },
  { id: 'time', label: '假期和 4＋4＋2 时间表' },
  { id: 'resources', label: '资源偏好' },
  { id: 'reminders', label: '提醒' },
  { id: 'data', label: '数据与隐私' },
]
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const resourceTypes: ResourceContentType[] = ['系统课程', '视频', '文章/讲义', '练习题', '项目任务', '模板']
const resourceDifficulties: ResourceDifficulty[] = ['入门', '基础', '进阶', '综合']
const resourcePlatforms: ResourcePlatform[] = ['国家智慧教育平台', '中国大学 MOOC', '学堂在线', '哔哩哔哩', 'Adobe Learn', 'Rhino Learn', 'British Council', 'Python 文档', 'MDN', 'MIT OpenCourseWare', '抖音', '用户提供', '站内任务']
const schedulePresets = [
  { id: 'light' as const, label: '轻量', description: '每天约 2 项，适合恢复节奏', weekdayMinutes: 60, weekendMinutes: 90, maxAutoTasksPerDay: 2 },
  { id: 'standard' as const, label: '标准', description: '每天约 3 项，六门课更均衡', weekdayMinutes: 120, weekendMinutes: 150, maxAutoTasksPerDay: 3 },
  { id: 'sprint' as const, label: '加密', description: '每天约 5 项，适合短期集中推进', weekdayMinutes: 210, weekendMinutes: 240, maxAutoTasksPerDay: 5 },
]
const periodOptions = ['上午', '下午', '晚上'] as const

export default function SettingsV4() {
  const { data, updateData, replaceData, resetData, notify, saveStatus } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedSection = new URLSearchParams(location.search).get('section') || 'profile'
  const section = sections.some(item => item.id === requestedSection) ? requestedSection : 'profile'
  const [courseId, setCourseId] = useState(data.courses.find(course => course.priority)?.id ?? data.courses[0]?.id ?? '')
  const [clearOpen, setClearOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteCourseId, setDeleteCourseId] = useState('')
  const [editCourseId, setEditCourseId] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const course = data.courses.find(item => item.id === courseId) ?? data.courses[0]

  const chooseSection = (id: string) => navigate(`/settings?section=${id}`, { replace: true })
  const updateSetting = <K extends keyof AppData['settings']>(key: K, value: AppData['settings'][K]) => updateData(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
  const updateSchedule = (patch: Partial<AppData['schedule']>) => updateData(current => ({ ...current, schedule: { ...current.schedule, ...patch } }))
  const applySchedulePreset = (preset: typeof schedulePresets[number]) => updateSchedule({ template: preset.id, weekdayMinutes: preset.weekdayMinutes, weekendMinutes: preset.weekendMinutes, maxAutoTasksPerDay: preset.maxAutoTasksPerDay, timeSlots: slotsForTemplate(preset.id), useDefaultTimetable: true })
  const updateCourse = (patch: Partial<Course>) => {
    if (!course) return
    updateData(current => ({ ...current, courses: current.courses.map(item => item.id === course.id ? { ...item, ...patch, revision: item.revision + 1 } : item) }))
  }
  const updateCurriculum = (patch: Partial<Course['curriculum']>) => {
    if (!course) return
    updateData(current => ({ ...current, courses: current.courses.map(item => item.id === course.id ? { ...item, curriculum: { ...item.curriculum, ...patch }, revision: item.revision + 1 } : item) }))
  }

  const uploadAvatar = (file?: File) => {
    if (!file) return
    setAvatarError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setAvatarError('仅支持 JPG、PNG 或 WebP。')
    if (file.size > 2 * 1024 * 1024) return setAvatarError('头像文件不能超过 2 MB。')
    setAvatarLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        if (image.width > 4096 || image.height > 4096) { setAvatarError('图片尺寸不能超过 4096 × 4096。'); setAvatarLoading(false); return }
        const side = Math.min(image.width, image.height)
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320
        canvas.getContext('2d')?.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 320, 320)
        updateSetting('avatarDataUrl', canvas.toDataURL('image/webp', .86))
        setAvatarLoading(false); notify('头像已裁切并保存在当前设备。')
      }
      image.onerror = () => { setAvatarError('无法读取这张图片。'); setAvatarLoading(false) }
      image.src = String(reader.result)
    }
    reader.onerror = () => { setAvatarError('头像读取失败。'); setAvatarLoading(false) }
    reader.readAsDataURL(file)
  }

  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `假期跃迁数据-${localDateISO()}.json`; anchor.click(); URL.revokeObjectURL(url)
    notify('数据导出已开始。')
  }

  const importData = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const value = JSON.parse(String(reader.result)) as { version?: number }
        const imported = value.version === 2
          ? migrateV6ToV7(migrateV4ToV6(migrateV2ToV4(value)))
          : value.version === 3
            ? migrateV6ToV7(migrateV4ToV6(migrateV3ToV4(value)))
            : value.version === 4
              ? migrateV6ToV7(migrateV4ToV6(value as AppData))
              : value.version === 6
                ? migrateV6ToV7(validateV6Data(value))
                : validateV7Data(value)
        replaceData(imported)
        notify(value.version === 2 || value.version === 3 ? '旧版数据已迁移并导入。' : '数据导入成功。')
      } catch (reason) { notify(reason instanceof Error ? reason.message : '数据文件无效。', 'error') }
    }
    reader.onerror = () => notify('数据文件读取失败。', 'error')
    reader.readAsText(file)
  }

  const restoreMigrationBackup = () => {
    const raw = localStorage.getItem(SCHEMA_MIGRATION_BACKUP_KEY)
      ?? localStorage.getItem(V7_MIGRATION_BACKUP_KEY)
      ?? localStorage.getItem(V6_MIGRATION_BACKUP_KEY)
      ?? localStorage.getItem(V3_MIGRATION_BACKUP_KEY)
      ?? localStorage.getItem(MIGRATION_BACKUP_KEY)
    if (!raw) {
      setRestoreOpen(false)
      notify('当前设备没有可恢复的迁移前备份。', 'error')
      return
    }
    try {
      const value = JSON.parse(raw) as { version?: number }
      const restored = value.version === 2
        ? migrateV6ToV7(migrateV4ToV6(migrateV2ToV4(value, raw), raw), raw)
        : value.version === 3
          ? migrateV6ToV7(migrateV4ToV6(migrateV3ToV4(value, raw), raw), raw)
          : value.version === 4
            ? migrateV6ToV7(migrateV4ToV6(value as AppData, raw), raw)
            : value.version === 6
              ? migrateV6ToV7(validateV6Data(value), raw)
              : validateV7Data(value)
      replaceData(restored)
      setRestoreOpen(false)
      notify('已恢复迁移前备份，并按当前数据模型重新整理。')
    } catch (reason) {
      setRestoreOpen(false)
      notify(reason instanceof Error ? reason.message : '迁移前备份无法读取。', 'error')
    }
  }

  const restartPlanning = () => {
    updateData(current => ({ ...archiveActivePlans(current), onboardingStep: 1, planChanges: ['重新规划前已归档当前计划。', ...current.planChanges] }))
    navigate('/onboarding')
  }

  const deleteCourse = () => {
    if (!deleteCourseId) return
    updateData(current => {
      const nextCourses = current.courses.filter(item => item.id !== deleteCourseId)
      const nextTasks = current.tasks.filter(task => task.courseId !== deleteCourseId)
      const courseChange = createCourseChangeSet(current.courses, nextCourses, `删除课程“${current.courses.find(item => item.id === deleteCourseId)?.name || '未命名课程'}”`, deleteCourseId)
      const taskChange = createTaskChangeSet(current.tasks, nextTasks, courseChange.reason, { scope: 'course', courseId: deleteCourseId })
      const diagnosis = current.diagnoses[deleteCourseId]
      const changeSet = { ...courseChange, changes: [...courseChange.changes, ...taskChange.changes, { entityId: '__plans', before: { value: current.plans }, after: { value: current.plans.filter(plan => plan.courseId !== deleteCourseId) } }, ...(diagnosis ? [{ entityId: `__diagnosis:${deleteCourseId}`, before: diagnosis as unknown as Record<string, unknown>, after: { __exists: false } }] : [])] }
      return { ...current, courses: nextCourses, tasks: nextTasks, plans: current.plans.filter(plan => plan.courseId !== deleteCourseId), diagnoses: Object.fromEntries(Object.entries(current.diagnoses).filter(([id]) => id !== deleteCourseId)), changeSets: [...current.changeSets, changeSet] }
    })
    setDeleteCourseId(''); notify('课程和当前任务已删除，可用“撤销最近课程变更”恢复。')
  }

  return <div className="page settings-page">
    <PageHeader eyebrow="设置" title="偏好会自动保存在当前设备" description="本地版不会上传头像、课程或学习记录；页面顶部会显示真实保存状态。" actions={<div className={`save-status ${saveStatus}`} role="status" aria-live="polite">{saveStatus === 'saving' ? '正在保存…' : saveStatus === 'error' ? '保存失败，请重试' : '所有更改已保存'}</div>} />
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="设置分类">{sections.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} aria-pressed={section === item.id} onClick={() => chooseSection(item.id)}>{item.label}</button>)}</nav>
      <div className="settings-panel">
        {section === 'courses' && <div className="settings-course-action"><CourseManager /><button type="button" className="button secondary" disabled={!course} onClick={() => course && setEditCourseId(course.id)}>编辑课程事实</button><button type="button" className="button secondary" disabled={!course} onClick={() => course && updateData(current => ({ ...current, courses: current.courses.map(item => item.id === course.id ? { ...item, archivedAt: item.archivedAt ? undefined : localTimestamp(), priority: item.archivedAt ? item.priority : false } : item) }))}>{course?.archivedAt ? '恢复课程' : '暂停课程'}</button></div>}
        {section === 'profile' && <section><span className="section-kicker">个人资料</span><h2>头像与显示名称</h2><div className="avatar-editor"><div className="avatar-preview">{data.settings.avatarDataUrl ? <img src={data.settings.avatarDataUrl} width="112" height="112" alt="头像预览" /> : <span>{data.settings.displayName.slice(0, 1) || '学'}</span>}</div><div><p>图片会居中裁切，仅保存在当前浏览器。</p><div className="data-actions"><label className={`button secondary ${avatarLoading ? 'disabled' : ''}`}>{avatarLoading ? '正在处理…' : '上传头像'}<input className="visually-hidden" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" disabled={avatarLoading} onChange={event => uploadAvatar(event.target.files?.[0])} /></label><button className="button secondary" disabled={!data.settings.avatarDataUrl} onClick={() => updateSetting('avatarDataUrl', '')}>删除头像</button></div></div></div>{avatarError && <InlineNotice tone="error">{avatarError}</InlineNotice>}<label className="field"><span>显示名称</span><input name="display-name" autoComplete="name" value={data.settings.displayName} onChange={event => updateSetting('displayName', event.target.value)} /></label></section>}

        {section === 'education' && <section><span className="section-kicker">教育阶段与教材</span><h2>只使用高中或大学课程上下文</h2>{course ? <><label className="field setting-course-select"><span>要编辑的课程</span><select name="education-course" value={course.id} onChange={event => setCourseId(event.target.value)}>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{course.stageStatus === 'needs-reconfirmation' && <InlineNotice tone="error">旧版阶段“{course.legacyStage || '未识别'}”需要改为高中或大学，也可以在“课程与目标”中归档。</InlineNotice>}<div className="form-grid two"><label className="field"><span>教育阶段</span><select name="education-stage" value={course.stage} onChange={event => { const stage = event.target.value as Course['stage']; updateCourse({ stage, stageStatus: 'confirmed', curriculum: { ...course.curriculum, stage } }) }}><option value="">请选择</option>{['高中', '大学'].map(value => <option key={value}>{value}</option>)}</select></label>{course.stage === '高中' && <><label className="field"><span>省份</span><input name="province" value={course.curriculum.province} onChange={event => updateCurriculum({ province: event.target.value })} /></label><label className="field"><span>城市（可选）</span><input name="city" value={course.curriculum.city} onChange={event => updateCurriculum({ city: event.target.value })} /></label><label className="field"><span>年级</span><input name="grade" value={course.curriculum.grade} onChange={event => updateCurriculum({ grade: event.target.value })} placeholder="例如：高二" /></label><label className="field"><span>教材版本</span><input name="textbook-version" value={course.curriculum.textbookVersion} onChange={event => updateCurriculum({ textbookVersion: event.target.value })} placeholder="例如：人教 A 版" /></label></>}{course.stage === '大学' && <><label className="field"><span>学校</span><input name="school" value={course.curriculum.school} onChange={event => updateCurriculum({ school: event.target.value })} /></label><label className="field"><span>专业</span><input name="major" value={course.curriculum.major} onChange={event => updateCurriculum({ major: event.target.value })} /></label><label className="field"><span>学期</span><select name="university-semester" value={course.curriculum.semester} onChange={event => updateCurriculum({ semester: event.target.value as Course['curriculum']['semester'] })}><option value="">请选择</option><option>上学期</option><option>下学期</option><option>其他</option></select></label><label className="field"><span>任课教师（可选）</span><input name="instructor" value={course.curriculum.instructor} onChange={event => updateCurriculum({ instructor: event.target.value })} /></label><label className="field full-span"><span>教材或课程目录</span><textarea name="syllabus" rows={6} value={course.curriculum.syllabusTitle} onChange={event => updateCurriculum({ syllabusTitle: event.target.value, textbookVersion: event.target.value, source: 'user-input' })} placeholder="填写教材名称；真实章节请在重新规划时逐行录入。" /></label></>}</div><InlineNotice>教材或课程目录变化后，旧计划会标记为需要重新诊断，不会静默套用旧章节。</InlineNotice></> : <InlineNotice>还没有课程，请先完成首次规划。</InlineNotice>}</section>}

        {section === 'courses' && <section><span className="section-kicker">课程与目标</span><h2>管理优先级、目标与课程状态</h2>{data.courses.length ? <><div className="form-grid two"><label className="field"><span>优先课程</span><select name="priority-course" value={data.courses.find(item => item.priority)?.id || ''} onChange={event => updateData(current => ({ ...current, courses: current.courses.map(item => ({ ...item, priority: item.id === event.target.value })) }))}>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>编辑课程</span><select name="goal-course" value={course?.id || ''} onChange={event => setCourseId(event.target.value)}>{data.courses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>目标类型</span><select name="goal-type" value={course?.goalType || ''} onChange={event => updateCourse({ goalType: event.target.value as Course['goalType'] })}><option value="">请选择</option>{goalTypes.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>目标日期</span><input name="target-date" type="date" value={course?.targetDate || ''} onInput={event => updateCourse({ targetDate: event.currentTarget.value.replace(/\//g, '-').slice(0, 10) })} onChange={event => updateCourse({ targetDate: event.target.value.replace(/\//g, '-').slice(0, 10) })} /></label><label className="field full-span"><span>希望达到的结果</span><textarea name="desired-result" rows={4} value={course?.desiredResult || ''} onChange={event => updateCourse({ desiredResult: event.target.value, desiredResultEdited: true })} /></label></div><div className="setting-rows">{data.courses.map(item => <div className="setting-row" key={item.id}><span><strong>{item.name}</strong><small>{item.archivedAt ? `已暂停于 ${item.archivedAt}` : `${item.stage || '未设阶段'} · ${item.goalType || '未设目标'}`}</small></span><div className="data-actions"><button className="button secondary" onClick={() => updateData(current => ({ ...current, courses: current.courses.map(value => value.id === item.id ? { ...value, archivedAt: item.archivedAt ? undefined : localTimestamp(), priority: item.archivedAt ? item.priority : false } : value) }))}>{item.archivedAt ? '恢复' : '暂停'}</button><button className="button danger" onClick={() => setDeleteCourseId(item.id)}>删除</button></div></div>)}</div></> : <InlineNotice>还没有课程。完成首次规划后可在这里管理。</InlineNotice>}</section>}

        {section === 'time' && <section><span className="section-kicker">假期和 4＋4＋2 时间表</span><h2>先定每周学习量，再细调时间段</h2><div className="schedule-budget-panel"><div><span>当前每周可安排</span><strong>{((data.schedule.weekdayMinutes * 5 + data.schedule.weekendMinutes * 2) / 60).toFixed(1)} 小时</strong><small>工作日 {data.schedule.weekdayMinutes} 分钟 × 5 · 周末 {data.schedule.weekendMinutes} 分钟 × 2</small></div><div className="schedule-budget-actions"><span>快速切换安排密度</span><div>{schedulePresets.map(preset => <button type="button" key={preset.id} className={data.schedule.template === preset.id ? 'selected' : ''} aria-pressed={data.schedule.template === preset.id} onClick={() => applySchedulePreset(preset)}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</div></div></div><InlineNotice>建议先选择安排密度，再点击计划页“重新生成总课表”。系统会增加真实任务，不会用空白格伪装学习量。</InlineNotice><div className="form-grid two"><label className="field"><span>假期开始</span><input name="holiday-start" type="date" value={data.schedule.holidayStart} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, holidayStart: event.target.value } }))} /></label><label className="field"><span>假期结束</span><input name="holiday-end" type="date" value={data.schedule.holidayEnd} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, holidayEnd: event.target.value } }))} /></label><label className="field"><span>工作日每日分钟</span><input name="weekday-minutes" type="number" min="0" max="720" value={data.schedule.weekdayMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekdayMinutes: Number(event.target.value) } }))} /></label><label className="field"><span>周末每日分钟</span><input name="weekend-minutes" type="number" min="0" max="720" value={data.schedule.weekendMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, weekendMinutes: Number(event.target.value) } }))} /></label><label className="field"><span>单次最长专注（分钟）</span><input name="max-focus" type="number" min="15" max="180" value={data.schedule.maxFocusMinutes} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, maxFocusMinutes: Number(event.target.value) } }))} /></label><label className="field"><span>最容易中断的原因</span><input name="interruption" value={data.schedule.interruptionReason} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, interruptionReason: event.target.value } }))} /></label><label className="field"><span>每天最多自动安排任务</span><input name="max-auto-tasks" type="number" min="1" max="6" value={data.schedule.maxAutoTasksPerDay ?? 3} onChange={event => updateSchedule({ maxAutoTasksPerDay: Math.max(1, Math.min(6, Number(event.target.value))) })} /></label></div><div className="option-group"><span>每周休息日</span><div>{weekDays.map(day => <button key={day} aria-pressed={data.schedule.restDays.includes(day)} className={data.schedule.restDays.includes(day) ? 'selected' : ''} onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, restDays: current.schedule.restDays.includes(day) ? current.schedule.restDays.filter(item => item !== day) : [...current.schedule.restDays, day] } }))}>{day}</button>)}</div></div><div className="option-group"><span>优先安排时段</span><div>{periodOptions.map(period => <button type="button" key={period} aria-pressed={data.schedule.preferredTimes.includes(period)} className={data.schedule.preferredTimes.includes(period) ? 'selected' : ''} onClick={() => updateSchedule({ preferredTimes: data.schedule.preferredTimes.includes(period) ? data.schedule.preferredTimes.filter(item => item !== period) : [...data.schedule.preferredTimes, period] })}>{period}</button>)}</div><small className="field-help">不选择时，系统会在上午、下午、晚上自动分散安排。</small></div><div className="timetable-settings-header"><div><h3>可用时间段</h3><p>按 4＋4＋2 分为上午、下午、晚上；课表仍会保留全部节次，并把已安排课程放入对应时间段。</p></div><button className="button secondary" onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, useDefaultTimetable: true, timeSlots: defaultTimeSlots() } }))}>恢复默认时间</button></div><div className="slot-settings">{data.schedule.timeSlots.map(slot => <div className="slot-setting-row" key={slot.id}><button className={`switch ${slot.enabled ? 'on' : ''}`} role="switch" aria-label={`${slot.label}是否可用`} aria-checked={slot.enabled} onClick={() => updateData(current => ({ ...current, schedule: { ...current.schedule, useDefaultTimetable: false, timeSlots: current.schedule.timeSlots.map(item => item.id === slot.id ? { ...item, enabled: !item.enabled } : item) } }))}><i /></button><strong>{slot.label}</strong><label><span className="visually-hidden">{slot.label}开始时间</span><input type="time" name={`${slot.id}-start`} value={slot.start} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, useDefaultTimetable: false, timeSlots: current.schedule.timeSlots.map(item => item.id === slot.id ? { ...item, start: event.target.value } : item) } }))} /></label><span>至</span><label><span className="visually-hidden">{slot.label}结束时间</span><input type="time" name={`${slot.id}-end`} value={slot.end} onChange={event => updateData(current => ({ ...current, schedule: { ...current.schedule, useDefaultTimetable: false, timeSlots: current.schedule.timeSlots.map(item => item.id === slot.id ? { ...item, start: item.start, end: event.target.value } : item) } }))} /></label></div>)}</div></section>}

        {section === 'resources' && <section><span className="section-kicker">资源偏好</span><h2>控制平台、语言、形式与学习成本</h2><div className="form-grid two"><label className="field"><span>难度上限</span><select name="resource-difficulty" value={data.settings.resourceDifficulty} onChange={event => updateSetting('resourceDifficulty', event.target.value as ResourceDifficulty)}>{resourceDifficulties.map(value => <option key={value}>{value}</option>)}</select></label><label className="field"><span>单条最长时长（分钟）</span><input name="resource-duration" type="number" min="5" max="240" value={data.settings.maxResourceMinutes} onChange={event => updateSetting('maxResourceMinutes', Number(event.target.value))} /></label></div><div className="option-group"><span>平台来源</span><div>{resourcePlatforms.map(value => <button key={value} aria-pressed={data.settings.resourcePlatforms.includes(value)} className={data.settings.resourcePlatforms.includes(value) ? 'selected' : ''} onClick={() => updateSetting('resourcePlatforms', data.settings.resourcePlatforms.includes(value) ? data.settings.resourcePlatforms.filter(item => item !== value) : [...data.settings.resourcePlatforms, value])}>{value}</button>)}</div></div><div className="option-group"><span>内容形式</span><div>{resourceTypes.map(value => <button key={value} aria-pressed={data.settings.resourceContentTypes.includes(value)} className={data.settings.resourceContentTypes.includes(value) ? 'selected' : ''} onClick={() => updateSetting('resourceContentTypes', data.settings.resourceContentTypes.includes(value) ? data.settings.resourceContentTypes.filter(item => item !== value) : [...data.settings.resourceContentTypes, value])}>{value}</button>)}</div></div><div className="setting-rows"><label className="setting-row"><span><strong>资源语言</strong><small>默认中文与双语，可主动加入其他语言。</small></span><input name="resource-languages" value={data.settings.resourceLanguages.join('、')} onChange={event => updateSetting('resourceLanguages', event.target.value.split(/[、,，]/).map(item => item.trim()).filter(Boolean))} /></label><div className="setting-row"><span><strong>仅人工验证资源</strong><small>用户提供链接会继续标记为未审核。</small></span><button aria-label="仅人工验证资源" className={`switch ${data.settings.onlyHumanVerified ? 'on' : ''}`} role="switch" aria-checked={data.settings.onlyHumanVerified} onClick={() => updateSetting('onlyHumanVerified', !data.settings.onlyHumanVerified)}><i /></button></div><div className="setting-row"><span><strong>接受短视频资源</strong><small>不会抓取、下载或重新托管平台视频。</small></span><button aria-label="接受短视频资源" className={`switch ${data.settings.acceptShortVideo ? 'on' : ''}`} role="switch" aria-checked={data.settings.acceptShortVideo} onClick={() => updateSetting('acceptShortVideo', !data.settings.acceptShortVideo)}><i /></button></div></div></section>}

        {section === 'reminders' && <section><span className="section-kicker">提醒与自检</span><h2>控制应用内提示和每日快速自检</h2><InlineNotice>尚未接入浏览器系统通知；这些开关不会假装发送系统推送。</InlineNotice><div className="setting-rows"><label className="setting-row"><span><strong>提醒时间</strong><small>应用内提示使用。</small></span><input name="reminder-time" type="time" value={data.settings.reminderTime} onChange={event => updateSetting('reminderTime', event.target.value)} /></label><div className="setting-row"><span><strong>每日计划提醒</strong><small>仅应用内。</small></span><button aria-label="每日计划提醒，仅应用内" className={`switch ${data.settings.dailyReminder ? 'on' : ''}`} role="switch" aria-checked={data.settings.dailyReminder} onClick={() => updateSetting('dailyReminder', !data.settings.dailyReminder)}><i /></button></div><div className="setting-row"><span><strong>计划变化提醒</strong><small>仅应用内。</small></span><button aria-label="计划变化提醒，仅应用内" className={`switch ${data.settings.adjustmentReminder ? 'on' : ''}`} role="switch" aria-checked={data.settings.adjustmentReminder} onClick={() => updateSetting('adjustmentReminder', !data.settings.adjustmentReminder)}><i /></button></div><div className="setting-row"><span><strong>每日快速自检</strong><small>完成任务后生成 1–3 分钟自检；关闭后不会自动出题。</small></span><button aria-label="每日快速自检" className={`switch ${data.settings.dailySelfCheck ? 'on' : ''}`} role="switch" aria-checked={data.settings.dailySelfCheck} onClick={() => updateSetting('dailySelfCheck', !data.settings.dailySelfCheck)}><i /></button></div></div></section>}

        {section === 'data' && <section><span className="section-kicker">数据与隐私</span><h2>导出、恢复或删除本地数据</h2><InlineNotice>当前 MVP 不含账户、云同步和远程 AI。课程、成绩、头像与学习记录保存在当前浏览器；不在前端保存 API 密钥。</InlineNotice><div className="data-actions"><button className="button secondary" onClick={exportData}><Icon name="external" /> 导出当前数据</button><label className="button secondary">导入数据文件<input className="visually-hidden" type="file" name="data-import" accept="application/json,.json" onChange={event => importData(event.target.files?.[0])} /></label><button className="button secondary" onClick={() => setRestoreOpen(true)}>恢复迁移前备份</button><button className="button secondary" onClick={restartPlanning}>重新规划</button><button className="button danger" onClick={() => setClearOpen(true)}><Icon name="trash" /> 清除数据</button></div><label className="privacy-check"><input type="checkbox" checked={data.settings.privacyAccepted} onChange={event => updateSetting('privacyAccepted', event.target.checked)} /><span>我了解本地数据在清除浏览器缓存后可能无法恢复；建议先导出备份。</span></label><div className="legal-links"><Link to="/privacy">隐私说明</Link><Link to="/terms">使用条款</Link></div><p className="legal-note">未成年人应在监护人知情下填写成绩与学习安排；本产品只收集完成本地规划所需的最少信息。</p></section>}
      </div>
    </div>

    {clearOpen && <Modal title="清除全部本地数据？" description="课程、诊断、任务、头像和偏好都会恢复为空白状态。" onClose={() => setClearOpen(false)} footer={<><button className="button secondary" onClick={() => setClearOpen(false)}>取消</button><button className="button danger" onClick={() => { resetData(); setClearOpen(false); navigate('/') }}>确认清除</button></>}><p>建议先导出 JSON 备份。此操作无法撤销。</p></Modal>}
    {restoreOpen && <Modal title="恢复迁移前备份？" description="当前课程、计划和学习记录会被备份中的数据替换。" onClose={() => setRestoreOpen(false)} footer={<><button className="button secondary" onClick={() => setRestoreOpen(false)}>取消</button><button className="button primary" onClick={restoreMigrationBackup}>确认恢复</button></>}><p>恢复时会把旧数据升级到当前格式。建议先导出当前数据，以便需要时找回。</p></Modal>}
    {deleteCourseId && <Modal title="永久删除课程？" description="先确认受影响的数据；删除后仍可撤销最近一次课程变更。" onClose={() => setDeleteCourseId('')} footer={<><button className="button secondary" onClick={() => setDeleteCourseId('')}>取消</button><button className="button danger" onClick={deleteCourse}>确认删除</button></>}><div className="delete-impact"><p>确定删除「{data.courses.find(item => item.id === deleteCourseId)?.name}」吗？历史事件会保留用于学习记录审计。</p><dl><div><dt>任务</dt><dd>{data.tasks.filter(task => task.courseId === deleteCourseId).length} 项</dd></div><div><dt>计划版本</dt><dd>{data.plans.filter(plan => plan.courseId === deleteCourseId).length} 个</dd></div><div><dt>诊断</dt><dd>{data.diagnosisHistory.filter(item => item.courseId === deleteCourseId).length} 次</dd></div><div><dt>资源记录</dt><dd>{data.resourceEvents.filter(item => item.courseId === deleteCourseId).length} 条</dd></div></dl></div></Modal>}
    {editCourseId && <CourseEditorDialog courseId={editCourseId} onClose={() => setEditCourseId('')} />}
  </div>
}
