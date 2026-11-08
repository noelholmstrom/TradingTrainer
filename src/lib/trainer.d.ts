import type { JournalStore } from './journal';

export type TrainerOptions = {
  journal: JournalStore;
  coach: { enabled: boolean; request(payload: unknown): Promise<{ text: string }> };
  params: { start?: number; blind?: boolean; random?: boolean; day?: string; tf?: number };
  lesson: { slug: string; title: string; task: string } | null;
  /** owner: this signed-in user may load real data with the site's own Databento key. */
  realData?: { owner: boolean };
  debug?: boolean;
};

export function mountTrainer(root: HTMLElement, opts: TrainerOptions): { destroy(): void };
