export interface EnginePaletteOverride {
  walls?: string[];
  roofs?: string[];
  flatRoofs?: string[];
  ground?: Record<string, string>;
}

export interface EngineStyle {
  treeScale?: number;
  peopleScale?: number;
  vehicleScale?: number;
  shadeMid?: number;
  shadeDark?: number;
  shadeColor?: string | null;
  litWarm?: number;
  inkScale?: number;
  inkDark?: number;
  shadowAlpha?: number;
  shadowColor?: string | null;
  ao?: number;
  slabDepth?: number;
  strata?: boolean;
  bayScale?: number;
  windowBars?: boolean;
  eaveScale?: number;
  osmRoofs?: boolean;
  palette?: EnginePaletteOverride | null;
}

export interface PostStyle {
  saturate: number;
  contrast: number;
  brightness: number;
  tiltBlur: number;
  tiltFocus: number;
  tiltBand: number;
  vignette: number;
  background: string;
}
