import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewedBilibiliResources } from '../src/data/bilibili-resources.cn.ts'
import { createCourse, initialData } from '../src/data.ts'
import { applyNormalizationToCourse } from '../src/courseCatalog.ts'
import { bilibiliAlternatives, bilibiliRecommendationScore } from '../src/providers.ts'
import { resourceSnapshotScore } from '../src/resourceProvider.ts'

const coreIds = ['high.math', 'math.calculus', 'programming.python', 'cs.data-structures', 'design.photoshop', 'cad.rhino']

test('六门核心课程各有至少两条可直接打开的人工审核 B 站资源', () => {
  assert.equal(reviewedBilibiliResources.length, 12)
  coreIds.forEach(canonicalId => assert.ok(reviewedBilibiliResources.filter(resource => resource.canonicalCourseIds.includes(canonicalId)).length >= 2, `${canonicalId} 资源不足`))
  reviewedBilibiliResources.forEach(resource => {
    const bili = resource.bilibili!
    assert.equal(resource.platform, '哔哩哔哩')
    assert.equal(resource.humanVerified, true)
    assert.equal(bili.reviewStatus, '人工审核通过')
    assert.match(resource.url, new RegExp(`^https://www\\.bilibili\\.com/video/${bili.bvid}/$`))
    assert.match(bili.bvid, /^BV[0-9A-Za-z]{10}$/)
    assert.ok(resource.author && bili.publishedAt && bili.durationText && bili.reviewedAt)
    assert.ok(resource.knowledgePointIds.length && bili.suitableFoundation && bili.taskUse)
  })
})

test('没有带日期快照的热度字段保持 null，不用 0 冒充真实数据', () => {
  reviewedBilibiliResources.forEach(resource => {
    const bili = resource.bilibili!
    assert.equal(bili.viewCount, null)
    assert.equal(bili.likeCount, null)
    assert.equal(bili.favoriteCount, null)
    assert.equal(bili.coinCount, null)
    assert.equal(bili.statsSnapshotAt, null)
  })
})

test('B 站排序严格使用 45/20/15/10/10 的结构化权重', () => {
  const resource = reviewedBilibiliResources.find(item => item.canonicalCourseIds.includes('math.calculus'))!
  const course = applyNormalizationToCourse(createCourse({ name: '高等数学', stage: '大学' }))
  const exact = bilibiliRecommendationScore(resource, course, resource.knowledgePoints[0])
  const expected = resourceSnapshotScore({ knowledge: 100, quality: resource.bilibili!.qualityScore, trust: resource.bilibili!.trustScore, foundation: resource.bilibili!.foundationMatchScore, popularity: null })
  assert.equal(exact.score, expected)
  assert.equal(exact.breakdown.popularity, null)
  assert.ok(bilibiliRecommendationScore(resource, course, '无关知识点').score < exact.score)
})

test('失效资源可按同课程和知识点找到人工目录替代项', () => {
  const data = initialData()
  const unavailable = reviewedBilibiliResources[0]
  data.resources = data.resources.map(resource => resource.id === unavailable.id ? { ...resource, healthStatus: 'unavailable', bilibili: resource.bilibili ? { ...resource.bilibili, reviewStatus: '已失效' } : undefined } : resource)
  const alternatives = bilibiliAlternatives(data, unavailable)
  assert.ok(alternatives.length >= 1)
  assert.ok(alternatives.every(resource => resource.healthStatus === 'active' && resource.id !== unavailable.id))
})

test('默认平台包含 B 站但不包含抖音，视频打开不会被写成任务完成', () => {
  const data = initialData()
  assert.ok(data.settings.resourcePlatforms.includes('哔哩哔哩'))
  assert.equal(data.settings.resourcePlatforms.includes('抖音'), false)
  const source = readFileSync(new URL('../src/pages/Resources.tsx', import.meta.url), 'utf8')
  assert.match(source, /已记录“打开原视频”；这不会自动算作已观看或已完成/)
  assert.match(source, /rel="noopener noreferrer"/)
  assert.match(source, /resources\.slice\(0, showAll \? 30 : 12\)/)
  assert.match(source, /未审核检索建议/)
  assert.match(source, /去 B 站搜索/)
})
