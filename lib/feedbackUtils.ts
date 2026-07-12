export type FeedbackType = 'bug' | 'feature' | 'workout-data' | 'run-leader'

export function feedbackLabel(type: FeedbackType): string {
  switch (type) {
    case 'bug': return 'bug'
    case 'feature': return 'enhancement'
    case 'workout-data': return 'workout-data'
    case 'run-leader': return 'run-leader-feedback'
  }
}

export function feedbackTitle(
  type: FeedbackType,
  description: string,
  workoutContext?: string,
): string {
  const MAX = 80
  let raw: string
  if (type === 'workout-data' && workoutContext) {
    raw = `Workout Data: ${workoutContext} — ${description}`
  } else if (type === 'workout-data') {
    raw = `Workout Data: ${description}`
  } else if (type === 'run-leader') {
    raw = `Run Leader Feedback: ${description}`
  } else if (type === 'bug') {
    raw = `Bug: ${description}`
  } else {
    raw = `Feature: ${description}`
  }
  return raw.length > MAX ? raw.slice(0, MAX - 1) + '…' : raw
}

export function feedbackBody(
  type: FeedbackType,
  description: string,
  submittedBy: string,
  workoutContext?: string,
): string {
  if (type === 'workout-data' && workoutContext) {
    return `**Workout:** ${workoutContext}\n\n**Notes:** ${description}\n\nSubmitted by: ${submittedBy}`
  }
  return `Submitted by: ${submittedBy}\n\n${description}`
}
