import type { LagSample } from '@/types'
// Use the recent minute and require enough elapsed sampling time to avoid
// treating repeated manual refreshes as a sudden rise in the lag rate.
export function lagGrowthPerMinute(samples: LagSample[]): number {
  const last = samples.at(-1)
  if (!last) return 0
  const recent = samples.filter((s) => s.at >= last.at - 60000)
  const first = recent[0]
  if (recent.length < 3 || !first || last.at - first.at < 30000) return 0
  return Math.max(0, ((last.lag - first.lag) * 60000) / (last.at - first.at))
}
