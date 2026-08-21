'use client'

// Intervalos de espaçamento ótimos (em dias) — baseados em Ebbinghaus + Cepeda et al. 2006
const SPACING_INTERVALS = [1, 3, 7, 14, 30, 90]

export interface TopicSpacingInfo {
  topic: string
  classRef: string
  lastTeachDate: string       // ISO date string
  daysSinceLast: number
  spacingStatus: 'overdue' | 'ideal' | 'too_recent' | 'never_tested'
  recommendedForReview: boolean
  urgency: 'high' | 'medium' | 'low'
  lastTestedAt?: string       // ISO date string, undefined if never tested
}

export interface CalendarTask {
  id: string
  date: string
  classRef?: string
  title?: string
  topic?: string
  type?: string
  [key: string]: unknown
}

export interface QuestionBankEntry {
  id: string
  statement: string
  topic?: string
  subject?: string
  classRef?: string
  createdAt?: number
  bnccCode?: string
  [key: string]: unknown
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime()
  const b = new Date(dateB).getTime()
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24))
}

export function analyzeSpacing(
  calendarTasks: CalendarTask[],
  questionBank: QuestionBankEntry[],
  today: string = new Date().toISOString().split('T')[0]
): TopicSpacingInfo[] {
  // Group tasks by topic + classRef
  const topicMap = new Map<string, { dates: string[]; classRef: string }>()
  
  for (const task of calendarTasks) {
    const key = `${task.classRef || 'all'}::${task.topic || task.title || ''}`
    if (!key.includes('::')) continue
    const existing = topicMap.get(key)
    if (existing) {
      existing.dates.push(task.date)
    } else {
      topicMap.set(key, { dates: [task.date], classRef: task.classRef || 'all' })
    }
  }

  const results: TopicSpacingInfo[] = []

  topicMap.forEach(({ dates, classRef }, key) => {
    const topic = key.split('::')[1]
    if (!topic) return
    
    // Find most recent teach date
    const sortedDates = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const lastTeachDate = sortedDates[0]
    const daysSinceLast = daysBetween(lastTeachDate, today)
    
    // Find if ever tested in question bank
    const testedEntry = questionBank.find(q =>
      q.classRef === classRef &&
      (q.topic || '').toLowerCase().includes(topic.toLowerCase())
    )
    const lastTestedAt = testedEntry?.createdAt
      ? new Date(testedEntry.createdAt).toISOString().split('T')[0]
      : undefined
    
    // Determine spacing status
    let spacingStatus: TopicSpacingInfo['spacingStatus']
    let urgency: TopicSpacingInfo['urgency']
    
    if (!lastTestedAt) {
      spacingStatus = 'never_tested'
      urgency = daysSinceLast >= 7 ? 'high' : 'medium'
    } else {
      const daysSinceTest = daysBetween(lastTestedAt, today)
      if (daysSinceTest < 2) {
        spacingStatus = 'too_recent'
        urgency = 'low'
      } else if (daysSinceTest >= 3 && daysSinceTest <= 14) {
        spacingStatus = 'ideal'
        urgency = 'medium'
      } else if (daysSinceTest > 14) {
        spacingStatus = 'overdue'
        urgency = daysSinceTest > 30 ? 'high' : 'medium'
      } else {
        spacingStatus = 'too_recent'
        urgency = 'low'
      }
    }
    
    results.push({
      topic,
      classRef,
      lastTeachDate,
      daysSinceLast,
      spacingStatus,
      recommendedForReview: spacingStatus === 'ideal' || spacingStatus === 'overdue' || spacingStatus === 'never_tested',
      urgency,
      lastTestedAt
    })
  })

  // Sort: overdue high > never_tested > ideal > too_recent
  return results.sort((a, b) => {
    const urgencyScore = { high: 3, medium: 2, low: 1 }
    return urgencyScore[b.urgency] - urgencyScore[a.urgency]
  })
}

export function getSpacingRecommendations(
  classRef: string,
  calendarTasks: CalendarTask[],
  questionBank: QuestionBankEntry[]
): TopicSpacingInfo[] {
  return analyzeSpacing(calendarTasks, questionBank)
    .filter(t => t.classRef === classRef || t.classRef === 'all')
    .filter(t => t.recommendedForReview)
}
