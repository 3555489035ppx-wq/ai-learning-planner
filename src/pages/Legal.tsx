import { Link } from 'react-router-dom'
import { PageHeader } from '../components.tsx'

export function Privacy() {
  return <div className="page legal-page"><PageHeader eyebrow="隐私说明 · 本地 MVP" title="你的学习数据默认只留在当前设备" description="更新日期：2026 年 7 月 16 日" /><article className="legal-document"><h2>我们处理哪些信息</h2><p>课程、成绩、教材、目标、可用时间、任务完成记录、头像和资源偏好仅用于在浏览器内生成与调整学习计划。</p><h2>保存与传输</h2><p>当前版本不含账户、云同步和远程 AI。数据写入当前浏览器的 localStorage；头像也以本地数据形式保存。我们不会在前端存放 API 密钥。</p><h2>导出与删除</h2><p>你可以在设置中导出 JSON 备份，也可以清除全部本地数据。清除浏览器数据后可能无法恢复。</p><h2>未成年人</h2><p>未满 18 岁的用户应在监护人知情下填写成绩和学习安排，并避免录入与学习规划无关的敏感信息。</p><h2>外部资源</h2><p>外部课程链接会跳转到原平台。假期跃迁不会抓取、下载或重新托管第三方视频，第三方平台的数据处理规则由其自行负责。</p><Link className="button secondary" to="/settings?section=data">返回数据与隐私设置</Link></article></div>
}

export function Terms() {
  return <div className="page legal-page"><PageHeader eyebrow="使用条款 · 本地 MVP" title="规划建议不是成绩保证" description="更新日期：2026 年 7 月 16 日" /><article className="legal-document"><h2>服务边界</h2><p>当前版本通过本地规则生成诊断、排程和调整建议，用于辅助学习决策，不保证考试成绩、证书结果或录取结果。</p><h2>用户责任</h2><p>请确认成绩、教材、考试日期与现实安排真实有效，并在应用计划前检查课程要求和学校通知。</p><h2>资源版权</h2><p>资源标题、作者和链接归原平台或权利人所有。用户添加链接时应确保其来源合法；本产品仅保存公开链接并跳转原站。</p><h2>功能限制</h2><p>远程 AI、云同步、系统通知、自动资源健康检查与运营审核后台尚未提供；界面会明确说明这些限制，不会模拟已上线能力。</p><Link className="button secondary" to="/settings?section=data">返回数据与隐私设置</Link></article></div>
}
