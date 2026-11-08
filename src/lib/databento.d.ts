export type ColumnBars = { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };

export const DATABENTO_DATASET: string;
export const CONTINUOUS: { NQ: string; MNQ: string };
export function looksLikeDatabentoKey(key: unknown): boolean;
export function rangeForm(args: { symbol: string; start: string; end: string }): URLSearchParams;
export function parseOhlcvJson(text: string): { bars: ColumnBars; skipped: number };
export function upstreamError(status: number, detail?: string): { status: number; error: string };
