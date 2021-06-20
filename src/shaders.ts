

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


const VERTEX_HEADER = `
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
`;


const VERTEX_MAIN = `
vec2 xy = ((position * xyScale * transform.z) +
  vec2(transform.x, -transform.y)) * pixelRatio * vec2(1, -1);

float ndcX = 2.0 * ((xy.x / width) - 0.5);
float ndcY = -(2.0 * ((xy.y / height) - 0.5));

gl_Position = vec4(ndcX, ndcY, 0, 1);

gl_PointSize = max(min(size * transform.z, maxSize), minSize) * pixelRatio;

vColor = color;
vPickingColor = pickingColor;
`;


const FRAGMENT_HEADER = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;
varying vec3 vColor;
`;


const PICKING_FRAGMENT_HEADER = `
precision mediump float;
varying vec3 vPickingColor;
`;


const PICKING_FRAGMENT_CIRCLE = `
${PICKING_FRAGMENT_HEADER}
void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  if (dot(cxy, cxy) > 1.0) discard;
  gl_FragColor = vec4(vPickingColor, 1);
}
`;


interface ShaderStrategy {
  vertex: string;
  fragment: string;
  pickingFragment: string;
}


export interface DefaultShaderOpts {
  alpha: number;
  fastAlpha: number;
  bigAlpha: number;
  maxFastSize: number;
  bigEdge1: number;
  bigEdge2: number;
  borderColor: [number, number, number];
  borderRatio: number;
}


export class Default implements ShaderStrategy {

  private opts: DefaultShaderOpts = {
    alpha: 1,
    fastAlpha: 1,
    bigAlpha: 0.8,
    maxFastSize: 20,
    bigEdge1: 20,
    bigEdge2: 100,
    borderColor: [0, 0, 0],
    borderRatio: 0.05,
  };

  // TODO: How to handle "options" constructors?
  constructor(opts: Partial<DefaultShaderOpts> = {}) {
    this.opts = {...this.opts, ...opts};
  }

  private extraVarying = `
    varying float vPointSize;
    varying float vAlpha;
    varying vec3 vBorderColor;
  `;

  get vertex() {

    const bigEdge1 = this.opts.bigEdge1.toFixed(2);
    const bigEdge2 = this.opts.bigEdge2.toFixed(2);

    const alpha = this.opts.alpha.toFixed(2);
    const oneMinusBigAlpha = (1 - this.opts.bigAlpha).toFixed(2);

    const borderColor = `vec3(${
      this.opts.borderColor.map(c => c.toFixed(2)).join(', ')
    })`;

    return `
    ${VERTEX_HEADER}
    ${this.extraVarying}

    void main() {

      ${VERTEX_MAIN}

      float bigness = smoothstep(${bigEdge1}, ${bigEdge2}, gl_PointSize);
      float alpha = ${alpha} - (bigness * ${oneMinusBigAlpha});
      vec3 borderColor = mix(color, ${borderColor}, bigness);

      vPointSize = gl_PointSize;
      vAlpha = alpha;
      vBorderColor = borderColor;

    }
    `;

  }

  get fragment() {

    const maxFastSize = this.opts.maxFastSize.toFixed(2);
    const fastAlpha = this.opts.fastAlpha.toFixed(2);
    const borderStart = (1 - this.opts.borderRatio).toFixed(2);

    return `
    ${FRAGMENT_HEADER}
    ${this.extraVarying}

    void main() {

      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);

      if (vPointSize < ${maxFastSize}) {
        if (r > 1.0) discard;
        gl_FragColor = vec4(vColor, ${fastAlpha});
      }

      else {

        float delta = fwidth(r);
        if (r > 1.0 + delta) discard;

        float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);

        vec3 color = mix(
          vColor,
          vBorderColor,
          smoothstep(${borderStart} - delta, ${borderStart} + delta, r)
        );

        gl_FragColor = vec4(color, vAlpha * alpha);

      }

    }
    `;

  }

  pickingFragment = PICKING_FRAGMENT_CIRCLE;

}


export class FastDots implements ShaderStrategy {

  get vertex() {
    return `
    ${VERTEX_HEADER}
    void main() {
      ${VERTEX_MAIN}
    }
    `;
  }

  get fragment() {
    return `
    ${FRAGMENT_HEADER}
    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      if (dot(cxy, cxy) > 1.0) discard;
      gl_FragColor = vec4(vColor, 1);
    }
    `;
  }

  pickingFragment = PICKING_FRAGMENT_CIRCLE;

}


export class FastSquares implements ShaderStrategy {

  get vertex() {
    return `
    ${VERTEX_HEADER}
    void main() {
      ${VERTEX_MAIN}
    }
    `;
  }

  get fragment() {
    return `
    ${FRAGMENT_HEADER}
    void main() {
      gl_FragColor = vec4(vColor, 1);
    }
    `;
  }

  get pickingFragment() {
    return `
    ${PICKING_FRAGMENT_HEADER}
    void main() {
      gl_FragColor = vec4(vPickingColor, 1);
    }
    `;
  }

}