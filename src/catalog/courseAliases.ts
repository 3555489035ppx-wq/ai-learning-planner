import type { CourseCatalogProfile } from './courseProfiles.ts'

export const normalizeAlias = (value: string) => value.trim().toLocaleLowerCase('zh-CN').replace(/[\s·_—-]+/g, '')

export const buildAliasIndex = (profiles: CourseCatalogProfile[]) => {
  const index = new Map<string, CourseCatalogProfile>()
  profiles.forEach(item => [item.name, ...item.aliases].forEach(alias => index.set(normalizeAlias(alias), item)))
  return index
}
