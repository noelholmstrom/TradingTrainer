// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export function lineChart(host: HTMLElement, vals: number[], labelFn: (i: number) => string, opts?: Any): void;
export function barChart(host: HTMLElement, items: { label?: string; value: number; tip: string; color?: string }[], opts?: Any): void;
export function hourBars(host: HTMLElement, byHour: Any[]): void;
export function fmtUsd(x: number | null | undefined): string;
export function signCls(x: number): string;
