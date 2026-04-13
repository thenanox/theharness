// Shared types across scenes/entities/systems.

export type RopeState =
  | 'IDLE'
  | 'FIRING'
  | 'ATTACHED'
  | 'SWINGING'
  | 'DETACHED';

export interface Cosmetic {
  sku: string;
  name: string;
  kind: 'rope' | 'player' | 'trail';
  priceUsd: number; // for x402 stretch
  apply: (palette: Record<string, number>) => void;
}

export interface GhostFrame {
  t: number; // ms since run start
  x: number;
  y: number;
  angle: number;
  ropeAnchor?: { x: number; y: number };
}
