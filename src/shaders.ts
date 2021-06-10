

// TODO: Pass args?
// position, xyScale, transform, pixelRatio, width, height
export const GET_POSITION = `
vec4 getPosition() {

  vec2 xy = ((position * xyScale * transform.z) +
    vec2(transform.x, -transform.y)) * pixelRatio * vec2(1, -1);

  float ndcX = 2.0 * ((xy.x / width) - 0.5);
  float ndcY = -(2.0 * ((xy.y / height) - 0.5));

  return vec4(ndcX, ndcY, 0, 1);

}`;


// TODO: Pass args?
// size, minSize, maxSize, transform, pixelRatio
export const GET_POINT_SIZE = `
float getPointSize() {
  return max(min(size * transform[2], maxSize), minSize) * pixelRatio;
}`;


// Needs to exactly match ^^, so that point sizes can be calculated in JS.
export function getShaderPointSize(
  size: number,
  k: number,
  opts: Partial<{
    minSize: number,
    maxSize: number,
  }> = {},
) {

  const minSize = opts.minSize || 0;
  const maxSize = opts.maxSize || Infinity;

  return Math.max(Math.min(size * k, maxSize), minSize) *
    window.devicePixelRatio;

}


export const DISPLAY_VERTEX_SHADER = `
attribute vec2 position;
attribute float size;
attribute float maxSize;
attribute vec3 color;
attribute vec3 pickingColor;

uniform vec3 transform;
uniform float width;
uniform float height;
uniform float pixelRatio;
uniform float xyScale;
uniform float minSize;

varying vec3 vColor;
varying vec3 vPickingColor;
varying float vPointSize;

${GET_POSITION}
${GET_POINT_SIZE}

void main() {

  gl_Position = getPosition();
  gl_PointSize = getPointSize();

  vColor = color;
  vPickingColor = pickingColor;
  vPointSize = gl_PointSize;
  
}`;


// TODO: Parametrize size constants.
export const DISPLAY_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D texture;

varying vec3 vColor;
varying float vPointSize;

void main() {

  float alpha = 1.0 - (smoothstep(30.0, 70.0, vPointSize) * 0.1);

  if (vPointSize > 30.0) {
    vec4 pixel = texture2D(texture, gl_PointCoord);
    gl_FragColor = pixel * vec4(vColor.xyz, alpha);
  }

  else {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    if (dot(cxy, cxy) > 1.0) discard;
    gl_FragColor = vec4(vColor, alpha);
  }

}`;


export const PICKING_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vPickingColor;
varying float vPointSize;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vPickingColor, 1);
}`;