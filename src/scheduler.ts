// FSRS scheduling with the whole scene as the review unit (spec §5).
//
// Ratings: 重来 → Again, 吃力 → Hard, 顺利 → Good (no Easy).
// Learning step is 10 minutes: a new scene rated 顺利 goes straight to
// long-term review; 重来 / 吃力 bring it back later the same day until 顺利
// (spec §4.5). A lapsed review scene relearns the same way.
//
// Order of the next scene:
//   1. (re)learning scenes that are due now
//   2. review scenes due today, up to the daily review limit
//   3. new scenes, up to the daily new limit (in scene id order)
//   4. (re)learning scenes due within LEARN_AHEAD, so a short session
//      doesn't stall waiting for a 10-minute step
// A "day" starts at DAY_START_HOUR local time, so late-night practice
// counts toward the previous day.
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type { Scene } from './scene.ts';
import type { Store, ReviewRecord } from './db.ts';
import type { Settings } from './settings.ts';

export type SceneRating = 'again' | 'hard' | 'good';

const GRADES: Record<SceneRating, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good };
const DAY_START_HOUR = 4;
const LEARN_AHEAD_MS = 20 * 60 * 1000;

const engine = fsrs(generatorParameters({ learning_steps: ['10m'], relearning_steps: ['10m'] }));

/** Start of the practice day containing `now`. */
export function dayStart(now: Date): Date {
  const d = new Date(now);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d;
}

function nextDayStart(now: Date): Date {
  const d = dayStart(now);
  d.setDate(d.getDate() + 1);
  return d;
}

function isLearning(card: Card): boolean {
  return card.state === State.Learning || card.state === State.Relearning;
}

export interface Scheduler {
  /** The scene to practise now, or null when nothing is left for now. */
  next(now?: Date): Scene | null;
  /** Roughly how many scenes are left today (for the top bar). */
  remaining(now?: Date): number;
  /** Learning scenes due later today, beyond the learn-ahead window. */
  laterToday(now?: Date): { count: number; earliest: Date | null };
  rate(scene: Scene, rating: SceneRating, now?: Date): Promise<void>;
  /** False when progress can't be saved on this device. */
  persistent: boolean;
  sceneCount: number;
}

export async function createScheduler(scenes: Scene[], settings: Settings, store: Store): Promise<Scheduler> {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const cards = new Map<string, Card>();
  for (const { sceneId, card } of await store.getCards()) {
    if (byId.has(sceneId)) cards.set(sceneId, card);
  }
  // Reviews done so far, to count today's new scenes and reviews.
  const reviews: Pick<ReviewRecord, 'review' | 'state'>[] = (await store.getReviews()).map((r) => ({
    review: new Date(r.review),
    state: r.state,
  }));

  function doneToday(now: Date, state: State): number {
    const start = dayStart(now).getTime();
    return reviews.filter((r) => r.review.getTime() >= start && r.state === state).length;
  }

  /** Scene ids in each bucket at time `now`, each sorted by due time. */
  function lists(now: Date) {
    const t = now.getTime();
    const endOfDay = nextDayStart(now).getTime();
    const due = (id: string): number => new Date(cards.get(id)!.due).getTime();
    const ids = [...cards.keys()].sort((a, b) => due(a) - due(b));
    const learning = ids.filter((id) => isLearning(cards.get(id)!));
    const reviewQuota = Math.max(0, settings.reviewLimit - doneToday(now, State.Review));
    const newQuota = Math.max(0, settings.newPerDay - doneToday(now, State.New));
    return {
      learningNow: learning.filter((id) => due(id) <= t),
      learningAhead: learning.filter((id) => due(id) <= t + LEARN_AHEAD_MS),
      learningLater: learning.filter((id) => due(id) > t + LEARN_AHEAD_MS && due(id) < endOfDay),
      reviews: ids
        .filter((id) => cards.get(id)!.state === State.Review && due(id) < endOfDay)
        .slice(0, reviewQuota),
      fresh: scenes
        .filter((s) => !cards.has(s.id))
        .slice(0, newQuota)
        .map((s) => s.id),
    };
  }

  return {
    persistent: store.persistent,
    sceneCount: scenes.length,

    next(now = new Date()) {
      const l = lists(now);
      const id = l.learningNow[0] ?? l.reviews[0] ?? l.fresh[0] ?? l.learningAhead[0];
      return id ? byId.get(id)! : null;
    },

    remaining(now = new Date()) {
      const l = lists(now);
      return l.learningAhead.length + l.reviews.length + l.fresh.length;
    },

    laterToday(now = new Date()) {
      const later = lists(now).learningLater;
      return { count: later.length, earliest: later.length ? new Date(cards.get(later[0])!.due) : null };
    },

    async rate(scene, rating, now = new Date()) {
      const card = cards.get(scene.id) ?? createEmptyCard(now);
      const { card: updated, log } = engine.next(card, now, GRADES[rating]);
      cards.set(scene.id, updated);
      reviews.push({ review: new Date(log.review), state: log.state });
      await store.saveReview({ sceneId: scene.id, card: updated }, { ...log, sceneId: scene.id });
    },
  };
}
