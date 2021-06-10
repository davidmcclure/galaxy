

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


export function drawPointImage(opts: Partial<{
  radius: number,
  lineWidth: number,
  fillStyle: string,
  strokeStyle: string,
  lineDash: number[],
}>) {

  // TODO: Do this ^ in signature?
  const {
    radius = 100,
    lineWidth = 10,
    fillStyle = 'white',
    strokeStyle = 'black',
    lineDash = [],
  } = opts;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  canvas.width = canvas.height = radius * 2;
  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;

  context.setLineDash(lineDash);

  context.beginPath();
  context.arc(radius, radius, radius - (lineWidth / 2), 0, 2 * Math.PI);
  context.fill();
  context.stroke();

  return canvas;

}