/* eslint-disable @typescript-eslint/no-explicit-any */
export const ICT_DEFAULTS: Record<string, any>;
export const FVG: number;
export const IFVG: number;
export const RB: number;
export const SESSION_WINDOWS: [string, string, number, number][];
export function createIct(cfg: Record<string, any>, tick: number): any;
export function ictStep(state: any, agg: any, i: number): void;
export function biasReads(state: any, price: number): any;
export function biasPanel(state: any, price: number): any;
export function ictRun(agg: any, upto: number, cfg: Record<string, any>, tick: number): any;
