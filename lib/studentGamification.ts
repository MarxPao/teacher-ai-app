/**
 * lib/studentGamification.ts
 * Sistema de Gamifição do Aluno: Streaks, Badges e XP por Desempenho (Item 16)
 */
export interface StudentBadge {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt?: number
}

export interface StudentGamificationProfile {
  studentId: string
  xp: number
  level: number
  currentStreak: number
  highestStreak: number
  totalCorrect: number
  totalAnswered: number
  zeroHintStreak: number
  unlockedBadges: string[]
  recentBadgeUnlocked?: StudentBadge
}

export const AVAILABLE_BADGES: StudentBadge[] = [
  { id: 'first_blood', title: 'Primeiro Passo', description: 'Acertou sua primeira questão!', icon: '🎯' },
  { id: 'streak_3', title: 'Embalado', description: '3 acertos seguidos sem errar!', icon: '🔥' },
  { id: 'streak_5', title: 'Em Chamas', description: '5 acertos seguidos sem errar!', icon: '⚡' },
  { id: 'streak_10', title: 'Imparável', description: '10 acertos consecutivos!', icon: '👑' },
  { id: 'scholar_100xp', title: 'Estudioso', description: 'Conquistou 100 pontos de experiência (XP)!', icon: '📚' },
  { id: 'master_500xp', title: 'Mestre do Conhecimento', description: 'Conquistou 500 XP!', icon: '🏆' },
  { id: 'self_reliant', title: 'Autônomo', description: 'Acertou 5 questões seguidas sem usar nenhuma dica!', icon: '💡' },
]


const _GAMIFICATION_STORAGE_KEY = 'teacher_student_gamification_v1'
const _memoryGamification = new Map<string, StudentGamificationProfile>()

function readAllProfiles(): Record<string, StudentGamificationProfile> {
  if (typeof window === 'undefined') {
    const obj: Record<string, StudentGamificationProfile> = {}
    _memoryGamification.forEach((v, k) => { obj[k] = v })
    return obj
  }
  try {
    const raw = localStorage.getItem(_GAMIFICATION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAllProfiles(profiles: Record<string, StudentGamificationProfile>): void {
  if (typeof window === 'undefined') {
    Object.entries(profiles).forEach(([k, v]) => {
      _memoryGamification.set(k, v)
    })
    return
  }
  try {
    localStorage.setItem(_GAMIFICATION_STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    /* next browser error */
  }
}

export function getGamificationProfile(studentId: string): StudentGamificationProfile {
  const all = readAllProfiles()
  if (all[studentId]) {
    return all[studentId]
  }
  return {
    studentId,
    xp: 0,
    level: 1,
    currentStreak: 0,
    highestStreak: 0,
    totalCorrect: 0,
    totalAnswered: 0,
    zeroHintStreak: 0,
    unlockedBadges: []
  }
}

export function saveGamificationProfile(profile: StudentGamificationProfile): void {
  const all = readAllProfiles()
  all[profile.studentId] = profile
  writeAllProfiles(all)
}

export function calculateStudentXpEarned(
  difficulty: string = 'B1',
  hintLayerUsed: number = 0
): number {
  const baseXP = 20
  let diffMult = 1.0
  const dLower = difficulty.toLowerCase()
  if (dLower.includes('advanced') || dLower.includes('c1') || dLower.includes('c2') || dLower.includes('em') || dLower.includes('ef9')) {
    diffMult = 2.0
  } else if (dLower.includes('intermediate') || dLower.includes('b1') || dLower.includes('b2') || dLower.includes('ef8') || dLower.includes('ef7')) {
    diffMult = 1.5
  }
  
  let hintPenalty = 1.0
  if (hintLayerUsed === 1) hintPenalty = 0.85
  else if (hintLayerUsed === 2) hintPenalty = 0.70
  else if (hintLayerUsed >= 3) hintPenalty = 0.50

  return Math.round(baseXP * diffMult * hintPenalty)
}

export function recordQuestionResult(
  studentId: string,
  isCorrect: boolean,
  difficulty: string = 'B1',
  hintLayerUsed: number = 0
): {
  profile: StudentGamificationProfile
  xpGained: number
  newBadges: StudentBadge[]
} {
  const profile = getGamificationProfile(studentId)
  let xpGained = 0

  if (isCorrect) {
    profile.currentStreak += 1
    profile.highestStreak = Math.max(profile.highestStreak, profile.currentStreak)
    profile.totalCorrect += 1
    profile.totalAnswered += 1

    if (hintLayerUsed === 0) {
      profile.zeroHintStreak += 1
    } else {
      profile.zeroHintStreak = 0
    }

    xpGained = calculateStudentXpEarned(difficulty, hintLayerUsed)
    profile.xp += xpGained
    profile.level = Math.floor(profile.xp / 100) + 1
  } else {
    profile.currentStreak = 0
    profile.zeroHintStreak = 0
    profile.totalAnswered += 1
  }

  // Conquistas de Badges
  const unlockedSet = new Set(profile.unlockedBadges)
  const newBadges: StudentBadge[] = []

  function checkBadge(badgeId: string, condition: boolean) {
    if (condition && !unlockedSet.has(badgeId)) {
      const badgeDef = AVAILABLE_BADGES.find(b => b.id === badgeId)
      if (badgeDef) {
        const unlocked = { ...badgeDef, unlockedAt: Date.now() }
        unlockedSet.add(badgeId)
        newBadges.push(unlocked)
      }
    }
  }

  checkBadge('first_blood', profile.totalCorrect >= 1)
  checkBadge('streak_3', profile.currentStreak >= 3)
  checkBadge('streak_5', profile.currentStreak >= 5)
  checkBadge('streak_10', profile.currentStreak >= 10)
  checkBadge('scholar_100xp', profile.xp >= 100)
  checkBadge('master_500xp', profile.xp >= 500)
  checkBadge('self_reliant', profile.zeroHintStreak >= 5)

  profile.unlockedBadges = Array.from(unlockedSet)
  if (newBadges.length > 0) {
    profile.recentBadgeUnlocked = newBadges[newBadges.length - 1]
  }


  saveGamificationProfile(profile)

  return {
    profile,
    xpGained,
    newBadges
  }
}
