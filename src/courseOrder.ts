import type { Course } from './types.ts'

export const stableCourseOrder = (courses: Course[]) => courses
  .map((course, sourceIndex) => ({ course, sourceIndex }))
  .sort((left, right) => (left.course.displayOrder ?? left.sourceIndex) - (right.course.displayOrder ?? right.sourceIndex) || left.sourceIndex - right.sourceIndex)
  .map(item => item.course)

