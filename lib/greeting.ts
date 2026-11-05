/**
 * lib/greeting.ts — saudação horária compartilhada (M4).
 *
 * Critério único para todo o app:
 *   05:00–11:59 → Bom dia
 *   12:00–17:59 → Boa tarde
 *   18:00–04:59 → Boa noite
 *
 * Use em vez de lógica inline em Dashboard.tsx, DailyMorningBriefing.tsx
 * e qualquer outro componente que exiba uma saudação.
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}
