

import REGL from 'regl';
import { debounce, range, clamp } from 'lodash';
import TWEEN from '@tweenjs/tween.js';

// TODO: Update to rxjs 7.
import { Subject } from 'rxjs';

// TODO: Just import what we're using, to save size.
import * as d3 from 'd3';

import * as utils from './utils';


export class Bounds {

  minX: number;
  minY: number;
  maxX: number;
  maxY: number;

  static fromTlBr(tl: [number, number], br: [number, number]) {
    return new Bounds({
      minX: tl[0],
      minY: br[1],
      maxX: br[0],
      maxY: tl[1],
    });
  }

  // TODO: DRY this?
  constructor(coords: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }) {
    this.minX = coords.minX;
    this.minY = coords.minY;
    this.maxX = coords.maxX;
    this.maxY = coords.maxY;
  }

  get topLeft() {
    return [this.minX, this.maxY];
  }

  get bottomRight() {
    return [this.maxX, this.minY];
  }

  get bottomLeft() {
    return [this.minX, this.minY];
  }

  get topRight() {
    return [this.maxX, this.maxY];
  }

  get xRange() {
    return this.maxX - this.minX;
  }

  get yRange() {
    return this.maxY - this.minY;
  }

  get kdbushRange(): [number, number, number, number] {
    return [this.minX, this.minY, this.maxX, this.maxY];
  }

  scale(factor: number): Bounds {
    return new Bounds({
      minX: this.minX * factor,
      minY: this.minY * factor,
      maxX: this.maxX * factor,
      maxY: this.maxY * factor,
    });
  }

  pad(padding: number): Bounds {
    return new Bounds({
      minX: this.minX - padding,
      minY: this.minY - padding,
      maxX: this.maxX + padding,
      maxY: this.maxY + padding,
    });
  }

  containsPoint(x: number, y: number) {
    return (
      x >= this.minX &&
      x <= this.maxX &&
      y >= this.minY &&
      y <= this.maxY
    );
  }

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


const DISPLAY_VERTEX_SHADER = `
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
const DISPLAY_FRAGMENT_SHADER = `
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


const PICKING_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vPickingColor;
varying float vPointSize;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vPickingColor, 1);
}`;


export class OverlayCanvas {

  container: HTMLElement;
  private onResizeDebounced = debounce(this.onResize.bind(this), 500);

  events = {
    resize: new Subject(),
  };

  constructor(public el: HTMLCanvasElement) {

    // TODO: Will the parent always be the container?
    this.container = el.parentElement!;

    // TODO: Resize listener directly on the container?
    // Sync after window resize.
    window.addEventListener('resize', this.onResizeDebounced);
    this.onResize();

  }

  // TODO: Does this remove the listeners for all instances?
  destroy() {
    window.removeEventListener('resize', this.onResizeDebounced);
  }

  private onResize() {

    const htmlWidth = this.container.offsetWidth * window.devicePixelRatio;
    const htmlHeight = this.container.offsetHeight * window.devicePixelRatio;

    const cssWidth = `${this.container.offsetWidth}px`;
    const cssHeight = `${this.container.offsetHeight}px`;

    this.el.width = htmlWidth;
    this.el.height = htmlHeight;

    Object.assign(this.el.style, {
      position: 'absolute',
      width: cssWidth,
      height: cssHeight,
    });

    this.events.resize.next();

  }

  get width() {
    return this.el.width
  }

  get height() {
    return this.el.height;
  }

  get cssWidth() {
    return this.el.offsetWidth;
  }

  get cssHeight() {
    return this.el.offsetHeight;
  }

}


const FLOAT_1D_SIZE = 4 * 1;
const FLOAT_2D_SIZE = 4 * 2;
const FLOAT_3D_SIZE = 4 * 3;


interface PlotOptions<T> {
  canvas: HTMLCanvasElement;
  points: T[];
  getPosition: (p: T) => [number, number],
  getSize: (p: T) => number,
  getMaxSize: (p: T) => number,
  getColor: (p: T) => [number, number, number],
  xyScale?: number;
  moveStartPixels?: number;
  bgSlots?: number;
}


export class Plot<T> {

  points: T[];
  bgPoints: T[] = [];
  canvas: OverlayCanvas;
  xyScale: number;
  transform: d3.ZoomTransform;
  isMoving = false;
  getPosition: (p: T) => [number, number];
  getSize: (p: T) => number;
  getMaxSize: (p: T) => number;
  getColor: (p: T) => [number, number, number];

  // TODO: rxjs too heavy for this?
  // TODO: Camel case?
  events = {
    click: new Subject<MouseEvent>(),
    movestart: new Subject<d3.ZoomTransform>(),
    moveend: new Subject<d3.ZoomTransform>(),
    render: new Subject(),
    pickingrender: new Subject(),
    mouseleave: new Subject(),
    highlight: new Subject<T>(),
    unhighlight: new Subject(),
    select: new Subject<T>(),
    unselect: new Subject(),
  };

  // TODO: Do we need this?
  // TODO: Make private; use setGutter(), which update visibleBounds subject.
  gutter = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  }

  private regl: REGL.Regl;
  private pickingFrameBuffer: REGL.Framebuffer2D;
  private zoomContainer: d3.Selection<HTMLElement, any, any, any>;
  private zoom: d3.ZoomBehavior<HTMLElement, any>;
  private bgSlots: number;
  private slotToPoint: Map<number, T> = new Map();
  private drawPoints: REGL.DrawCommand;
  private drawPickingPoints: REGL.DrawCommand;
  private requestRender = true;
  private requestPickingRender = true;
  private moveStartPixels: number;
  private zoomStartTransform: d3.ZoomTransform;

  private position: REGL.Buffer;
  private size: REGL.Buffer;
  private maxSize: REGL.Buffer;
  private color: REGL.Buffer;

  constructor(opts: PlotOptions<T>) {

    this.points = opts.points;
    this.canvas = new OverlayCanvas(opts.canvas);

    this.xyScale = opts.xyScale || 1;
    this.moveStartPixels = opts.moveStartPixels || 2;

    // TODO: Fall back to defaults for everything except getPosition.
    this.getPosition = opts.getPosition;
    this.getSize = opts.getSize;
    this.getMaxSize = opts.getMaxSize;
    this.getColor = opts.getColor;

    this.regl = REGL({canvas: this.canvas.el});

    this.zoom = d3.zoom<HTMLElement, any>().clickDistance(5);
    this.zoomContainer = d3.select(this.canvas.container);
    this.zoomContainer.call(this.zoom);

    this.transform = this.currentTransform();
    this.zoomStartTransform = this.transform;

    this.bgSlots = opts.bgSlots || 0;
    const totalSlots = this.bgSlots + this.points.length;

    this.position = this.regl.buffer({
      length: totalSlots * FLOAT_2D_SIZE,
      type: 'float',
    });

    this.size = this.regl.buffer({
      length: totalSlots * FLOAT_1D_SIZE,
      type: 'float',
    });

    this.maxSize = this.regl.buffer({
      length: totalSlots * FLOAT_1D_SIZE,
      type: 'float',
    });

    this.color = this.regl.buffer({
      length: totalSlots * FLOAT_3D_SIZE,
      type: 'float',
    });

    // Set foreground points.
    this.setPoints(this.bgSlots, this.points);

    // Generate id -> RGB colors for picking.
    const pickingColorData = range(totalSlots)
      .map(i => utils.hexToRgb(i + 1));

    const pickingColor = this.regl.buffer(pickingColorData);

    const pointImage = drawPointImage({radius: 256, lineWidth: 30});

    const pointTexture = this.regl.texture({
      data: pointImage,
      min: 'mipmap',
    });

    interface Uniforms {
      transform: REGL.Vec3;
      width: number;
      height: number;
      pixelRatio: number;
      xyScale: number;
      minSize: number;
    }

    interface DisplayUniforms extends Uniforms {
      texture: REGL.Texture2D;
    }

    interface Attributes {
      position: REGL.Buffer;
      size: REGL.Buffer;
      maxSize: REGL.Buffer;
      color: REGL.Buffer;
      pickingColor: REGL.Buffer;
    }

    interface Props {
      transform: REGL.Vec3;
      count: number;
      offset: number;
    }

    const attributes = {
      position: this.position,
      size: this.size,
      maxSize: this.maxSize,
      color: this.color,
      pickingColor,
    };

    const sharedUniforms = {
      // Inject the current d3.zoom transform.
      transform: (): REGL.Vec3 => {
        const {x, y, k} = this.transform;
        return [x, y, k];
      },
      width: this.regl.context('viewportWidth'),
      height: this.regl.context('viewportHeight'),
      pixelRatio: this.regl.context('pixelRatio'),
      xyScale: this.xyScale,
    };

    const primitive: REGL.PrimitiveType = 'points';

    const sharedConfig = {
      vert: DISPLAY_VERTEX_SHADER,
      attributes,
      primitive,
      // Render BG + FG points.
      count: () => this.bgPoints.length + this.points.length,
      // Skip unused BG slots.
      offset: () => this.bgSlots - this.bgPoints.length,
      depth: {
        enable: false,
      }
    }

    this.drawPoints = this.regl<DisplayUniforms, Attributes, Props>({
      
      ...sharedConfig,
      frag: DISPLAY_FRAGMENT_SHADER,

      uniforms: {
        ...sharedUniforms,
        texture: pointTexture,
        minSize: 0,
      },

      blend: {
        enable: true,
        func: {
          src: 'src alpha',
          dst: 'one minus src alpha',
        },
      },

    });

    this.drawPickingPoints = this.regl<Uniforms, Attributes, Props>({
      
      ...sharedConfig,
      frag: PICKING_FRAGMENT_SHADER,

      uniforms: {
        ...sharedUniforms,
        minSize: 10,
      },

    });

    // TODO: renderbuffer faster?
    this.pickingFrameBuffer = this.regl.framebuffer(
      this.canvas.width,
      this.canvas.height,
    );

    this.canvas.events.resize.subscribe(this.onResize.bind(this));

    this.regl.frame(this.onFrame.bind(this));

    this.zoom.on('zoom', this.onZoom.bind(this));
    this.zoom.on('start', this.onZoomStart.bind(this));
    this.zoom.on('end', this.onZoomEnd.bind(this));

    this.canvas.container.addEventListener('mousemove',
      this.onMouseMove.bind(this));

    this.canvas.container.addEventListener('click',
      this.onClick.bind(this));

    this.canvas.container.addEventListener('mouseleave',
      this.onMouseLeave.bind(this));

  }

  // Top point first, bottom last.
  private setPoints(offset: number, pointsDesc: T[]) {

    // Reverse the list, so that bottom points are rendered first.
    const pointsAsc = pointsDesc.slice().reverse();

    this.position.subdata(
      pointsAsc.map(this.getPosition),
      offset * FLOAT_2D_SIZE,
    );

    this.size.subdata(
      pointsAsc.map(this.getSize),
      offset * FLOAT_1D_SIZE,
    );

    this.maxSize.subdata(
      pointsAsc.map(this.getMaxSize),
      offset * FLOAT_1D_SIZE,
    );

    this.color.subdata(
      pointsAsc.map(this.getColor),
      offset * FLOAT_3D_SIZE,
    );

    pointsAsc.forEach((p, i) => {
      this.slotToPoint.set(offset + i, p);
    });

  }

  setBackgroundPoints(points: T[]) {
    this.bgPoints = points;
    this.setPoints(this.bgSlots - points.length, points);
    this.requestRender = true;
    this.requestPickingRender = true;
  }

  private onResize() {
    // TODO: Cache the FB dimensions here.
    this.pickingFrameBuffer.resize(this.canvas.width, this.canvas.height);
    this.requestRender = true;
    this.requestPickingRender = true;
  }

  currentTransform() {
    return d3.zoomTransform(this.canvas.container);
  }

  // CSS pixel offset -> data coords.
  screenToData(x: number, y: number): [number, number] {
    const [dx, dy] = this.transform.invert([x, y]).map(c => c / this.xyScale);
    return [dx, -dy];
  }

  // Data coords -> scaled plot coords.
  dataToPlot(x: number, y: number): [number, number] {
    return [x * this.xyScale, -y * this.xyScale];
  }

  // Data coords -> CSS pixel coords.
  dataToScreen(x: number, y: number): [number, number] {
    return this.transform.apply(this.dataToPlot(x, y));
  }

  // Data coords -> canvas coords, scaled by pixel ratio.
  dataToCanvas(x: number, y: number): [number, number] {
    const xy = this.dataToScreen(x, y);
    return utils.scaleVec2(xy, window.devicePixelRatio);
  }

  // TODO: Include gutter?
  dataBounds(): Bounds {
    const tl = this.screenToData(0, 0);
    const br = this.screenToData(this.canvas.cssWidth, this.canvas.cssHeight);
    return Bounds.fromTlBr(tl, br);
  }

  private onFrame() {

    // TODO: Does this make sense here, or somewhere separate?
    TWEEN.update();

    if (this.requestRender) {
      this.drawPoints();
      this.requestRender = false;
      this.events.render.next();
    }

    if (this.requestPickingRender) {

      this.pickingFrameBuffer.use(() => {
        this.regl.clear({color: [0, 0, 0, 0]});
        this.drawPickingPoints();
      });

      this.requestPickingRender = false;
      this.events.pickingrender.next();

    }

  }

  private hasMovedFromStart() {

    // Any zoom change represents a movement.
    if (this.zoomStartTransform.k !== this.transform.k) {
      return true;
    }

    const [sx, sy] = this.zoomStartTransform.apply([0, 0]);
    const [cx, cy] = this.transform.apply([0, 0]);

    const offset = Math.sqrt(Math.pow(sx-cx, 2) + Math.pow(sy-cy, 2));

    // Has the center moved >N screen pixels from the start?
    return offset > this.moveStartPixels * window.devicePixelRatio;

  }

  private onZoomStart() {
    this.zoomStartTransform = this.currentTransform();
  }

  private onZoom() {

    this.requestRender = true;

    this.transform = this.currentTransform();

    // Set isMoving when distance > threshold.
    if (!this.isMoving && this.hasMovedFromStart()) {
      this.isMoving = true;
      this.events.movestart.next(this.transform);
    }

  }

  private onZoomEnd() {

    this.requestPickingRender = true;

    // Only publish the event if the distance > threshold.
    if (this.isMoving) {
      this.events.moveend.next(this.transform);
    }

    this.isMoving = false;

  }

  private onMouseMove(e: MouseEvent) {

    if (this.isMoving) {
      return;
    }

    const point = this.pickAtCursor(e);

    if (point) {
      this.events.highlight.next(point);
    } else {
      this.events.unhighlight.next();
    }

  }

  private onClick(e: MouseEvent) {

    // TODO: Block if moving?

    const point = this.pickAtCursor(e);

    if (point) {
      this.events.select.next(point);
    } else {
      this.events.unselect.next();
    }

    this.events.click.next(e);

  }

  private onMouseLeave() {
    this.events.mouseleave.next();
  }

  private pickAtCursor(e: MouseEvent) {
    const x = e.offsetX;
    const y = this.canvas.cssHeight - e.offsetY;
    return this.pickAtPixel(x, y);
  }

  private pickAtPixel(x: number, y: number) {

    // TODO: null if moving?

    // TODO: Compare directly to the actual framebuffer size?
    // Prevent out-of-range errors at screen edges.
    const fbx = clamp(x * window.devicePixelRatio, 0, this.canvas.width - 1);
    const fby = clamp(y * window.devicePixelRatio, 0, this.canvas.height - 1);

    // TODO: Render this at pixel ratio 1, for speed?
    const [r, g, b] = this.regl.read({
      framebuffer: this.pickingFrameBuffer,
      x: fbx,
      y: fby,
      width: 1,
      height: 1,
    });

    const id = utils.rgbToHex(r, g, b);

    return id > 0 ? this.slotToPoint.get(id-1) : null;

  }

  moveToBounds(bounds: Bounds, duration = 0) {

    const width = this.canvas.cssWidth - this.gutter.left - this.gutter.right;
    const height = this.canvas.cssHeight - this.gutter.top - this.gutter.bottom;

    const {minX, minY, maxX, maxY} = bounds.scale(this.xyScale);

    const transform = d3.zoomIdentity
      .translate(
        this.gutter.left + (width / 2),
        this.gutter.top + (height / 2),
      )
      .scale(
        1 / Math.max(
          (maxX - minX) / width,
          (maxY - minY) / height,
        )
      )
      .translate(
        -(minX + maxX) / 2,
        (minY + maxY) / 2,
      );

    // Animate if duration > 0.
    if (duration > 0) {
      this.zoomContainer
        .transition()
        .duration(duration)
        .call(this.zoom.transform, transform);
    }

    // Otherwise, snap directly.
    else {
      this.zoom.transform(this.zoomContainer, transform);
    }

  }

  moveToPoint(
    x: number,
    y: number,
    padding: number,
    duration = 0,
  ) {

    const bounds = new Bounds({
      minX: x - padding,
      maxX: x + padding,
      minY: y - padding,
      maxY: y + padding,
    });

    this.moveToBounds(bounds, duration);

  }

}