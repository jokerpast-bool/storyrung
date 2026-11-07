/**
 * FSRS 简化版（M0 用）。完整 FSRS-5 需要 stability/difficulty 的拟合参数，
 * M0 先用"学好了间隔翻倍、忘了回到 1 天"的调度，接口与 FSRS 对齐，后续可无痛替换。
 */
export type Grade = 0 | 1 | 2 | 3; // again | hard | good | easy

export interface CardState {
  intervalDays: number;
  ease: number;
  lapses: number;
  reps: number;
}

export const GRADE_LABEL: Record<Grade, string> = {
  0: "忘了",
  1: "勉强",
  2: "记得",
  3: "很简单",
};

export function schedule(state: CardState, grade: Grade): CardState {
  const next: CardState = { ...state, reps: state.reps + 1 };
  if (grade === 0) {
    next.lapses = state.lapses + 1;
    next.intervalDays = 1;
    next.ease = Math.max(1.3, state.ease - 0.2);
    return next;
  }
  const easeDelta = grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0;
  next.ease = Math.max(1.3, Math.min(3.2, state.ease + easeDelta));
  const base = state.intervalDays <= 0 ? 1 : state.intervalDays;
  const multiplier = grade === 1 ? 1.2 : grade === 2 ? next.ease : next.ease * 1.3;
  next.intervalDays = Math.min(365, Math.max(1, Math.round(base * multiplier)));
  return next;
}

export function dueDate(from: Date, intervalDays: number): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + intervalDays);
  return d;
}
