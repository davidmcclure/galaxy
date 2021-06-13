

// // TODO: Pass args?
// // position, xyScale, transform, pixelRatio, width, height
// export const GET_POSITION = `
// vec4 getPosition() {

//   vec2 xy = ((position * xyScale * transform.z) +
//     vec2(transform.x, -transform.y)) * pixelRatio * vec2(1, -1);

//   float ndcX = 2.0 * ((xy.x / width) - 0.5);
//   float ndcY = -(2.0 * ((xy.y / height) - 0.5));

//   return vec4(ndcX, ndcY, 0, 1);

// }`;


// // TODO: Pass args?
// // size, minSize, maxSize, transform, pixelRatio
// export const GET_POINT_SIZE = `
// float getPointSize() {
//   return max(min(size * transform[2], maxSize), minSize) * pixelRatio;
// }`;


// NOTE: Has to be kept exactly in sync with the shader logic, so that point
// sizes can be calculated in JS.
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
varying float vAlpha;
varying vec3 vBorderColor;

void main() {

  vec2 xy = ((position * xyScale * transform.z) +
    vec2(transform.x, -transform.y)) * pixelRatio * vec2(1, -1);

  float ndcX = 2.0 * ((xy.x / width) - 0.5);
  float ndcY = -(2.0 * ((xy.y / height) - 0.5));

  gl_Position = vec4(ndcX, ndcY, 0, 1);

  gl_PointSize = max(min(size * transform[2], maxSize), minSize) * pixelRatio;

  vColor = color;
  vPickingColor = pickingColor;

  float bigness = smoothstep(30.0, 70.0, gl_PointSize);
  float alpha = 1.0 - (bigness * 0.3);
  vec3 borderColor = mix(color, vec3(0, 0, 0), bigness);

  vPointSize = gl_PointSize;
  vAlpha = alpha;
  vBorderColor = borderColor;
  
}`;


// TODO: Parametrize size constants.
export const DISPLAY_FRAGMENT_SHADER = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;

varying vec3 vColor;

varying float vPointSize;
varying float vAlpha;
varying vec3 vBorderColor;

void main() {

  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);

  if (r > 1.0) discard;

  else if (vPointSize < 30.0) {
    gl_FragColor = vec4(vColor, vAlpha);
  }

  else {

    float delta = fwidth(r);

    float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);

    vec3 color = mix(
      vColor,
      vBorderColor,
      smoothstep(0.9 - delta, 0.9 + delta, r)
    );

    gl_FragColor = vec4(color, vAlpha * alpha);

  }

}`;


export const PICKING_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vPickingColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  if (dot(cxy, cxy) > 1.0) discard;
  gl_FragColor = vec4(vPickingColor, 1);
}`;


export class BaseShaders {

  get vertex() {
    return `
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

    ${this.extraVarying}
    
    void main() {

      vec2 xy = ((position * xyScale * transform.z) +
        vec2(transform.x, -transform.y)) * pixelRatio * vec2(1, -1);

      float ndcX = 2.0 * ((xy.x / width) - 0.5);
      float ndcY = -(2.0 * ((xy.y / height) - 0.5));

      gl_Position = vec4(ndcX, ndcY, 0, 1);

      gl_PointSize = max(min(size * transform.z, maxSize), minSize) * pixelRatio;

      vColor = color;
      vPickingColor = pickingColor;

      ${this.extraVertexMain}

    }
    `;
  }

  get fragment() {
    return `
    #extension GL_OES_standard_derivatives : enable
    precision mediump float;

    varying vec3 vColor;
    ${this.extraVarying}

    void main() {
      ${this.fragmentMain}
    }
    `;
  }

  get pickingFragment() {
    return `
    precision mediump float;
    varying vec3 vPickingColor;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      if (dot(cxy, cxy) > 1.0) discard;
      gl_FragColor = vec4(vPickingColor, 1);
    }
    `;
  }

  get extraVarying() {
    return '';
  }

  get extraVertexMain() {
    return '';
  }

  get fragmentMain() {
    return `
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor, 1.0);
    `
  }

}


export class DefaultShaders extends BaseShaders {

  get extraVarying() {
    return `
    varying float vPointSize;
    varying float vAlpha;
    varying vec3 vBorderColor;
    `;
  }

  // TODO: Set these as uniforms?
  get extraVertexMain() {
    return `
    float bigness = smoothstep(20.0, 100.0, gl_PointSize);
    float alpha = 1.0 - (bigness * 0.3);
    vec3 borderColor = mix(color, vec3(0, 0, 0), bigness);

    vPointSize = gl_PointSize;
    vAlpha = alpha;
    vBorderColor = borderColor;
    `;
  }

  get fragmentMain() {
    return `
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);

    if (vPointSize < 20.0) {
      if (r > 1.0) discard;
      gl_FragColor = vec4(vColor, vAlpha);
    }

    else {

      float delta = fwidth(r);
      if (r > 1.0 + delta) discard;

      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);

      vec3 color = mix(
        vColor,
        vBorderColor,
        smoothstep(0.95 - delta, 0.95 + delta, r)
      );

      gl_FragColor = vec4(color, vAlpha * alpha);

    }
    `;
  }

}