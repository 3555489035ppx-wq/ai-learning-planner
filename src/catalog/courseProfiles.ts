import type { DomainCategory, EducationStage, SubjectDomain } from '../types.ts'

export interface CourseCatalogUnit {
  id: string
  title: string
  prerequisites: string[]
}

export interface CourseCatalogProfile {
  canonicalId: string
  name: string
  aliases: string[]
  stage: EducationStage
  domain: SubjectDomain
  category: DomainCategory
  disciplineGroup: string
  prerequisites: string[]
  units: CourseCatalogUnit[]
  assessments: string[]
  diagnosticTemplates: string[]
  outcomes: string[]
  resourceKeywords: string[]
  forbiddenKeywords: string[]
  planStrategy: string
  catalogNote: string
  toolFamily?: string
}

export const profile = (value: CourseCatalogProfile): CourseCatalogProfile => ({
  ...value,
  aliases: [...value.aliases],
  prerequisites: [...value.prerequisites],
  units: value.units.map(unit => ({ ...unit, prerequisites: [...unit.prerequisites] })),
  assessments: [...value.assessments],
  diagnosticTemplates: [...value.diagnosticTemplates],
  outcomes: [...value.outcomes],
  resourceKeywords: [...value.resourceKeywords],
  forbiddenKeywords: [...value.forbiddenKeywords],
})
