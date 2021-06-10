

export function rgbToHex(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}


export function hexToRgb(hex: number): [number, number, number] {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return [r / 255, g / 255, b / 255];
}


export function scaleVec2(vec: [number, number], k: number): [number, number] {
  return [vec[0] * k, vec[1] * k];
}