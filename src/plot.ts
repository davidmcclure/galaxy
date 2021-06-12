

import REGL from 'regl';
import { range, clamp } from 'lodash';
import TWEEN from '@tweenjs/tween.js';
import { Subject, fromEvent, Subscription } from 'rxjs';

// TODO: Just import what we're using, to save size.
import * as d3 from 'd3';

import * as utils from './utils';
import * as shaders from './shaders';
import Bounds from './bounds';
import OverlayCanvas from './overlayCanvas';


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


export default class Plot<T> {

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
  events = {
    click: new Subject<MouseEvent>(),
    moveStart: new Subject<d3.ZoomTransform>(),
    moveEnd: new Subject<d3.ZoomTransform>(),
    render: new Subject<void>(),
    pickingRender: new Subject<void>(),
    mouseLeave: new Subject<void>(),
    highlight: new Subject<T>(),
    unHighlight: new Subject<void>(),
    select: new Subject<T>(),
    unSelect: new Subject<void>(),
  };

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
  private subscriptions: Subscription[];

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

    const pointImage = utils.drawPointImage({radius: 256, lineWidth: 30});

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
      vert: shaders.DISPLAY_VERTEX_SHADER,
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
      frag: shaders.DISPLAY_FRAGMENT_SHADER,

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
      frag: shaders.PICKING_FRAGMENT_SHADER,

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

    this.regl.frame(this.onFrame.bind(this));

    this.zoom.on('zoom', this.onZoom.bind(this));
    this.zoom.on('start', this.onZoomStart.bind(this));
    this.zoom.on('end', this.onZoomEnd.bind(this));

    this.subscriptions = [

      fromEvent<MouseEvent>(this.canvas.container, 'mousemove')
        .subscribe(this.onMouseMove.bind(this)),

      fromEvent<MouseEvent>(this.canvas.container, 'click')
        .subscribe(this.onClick.bind(this)),

      fromEvent<MouseEvent>(this.canvas.container, 'mouseleave')
        .subscribe(this.onMouseLeave.bind(this)),

      this.canvas.events.resize
        .subscribe(this.onResize.bind(this)),

    ];

  }

  destroy() {

    // Destroy regl context.
    // https://github.com/regl-project/regl/blob/master/API.md#clean-up
    this.regl.destroy();

    // Unbind zoom listeners.
    // https://github.com/d3/d3-zoom/blob/main/README.md#_zoom
    this.zoomContainer.on('.zoom', null);

    // Unbind container listeners.
    this.subscriptions.forEach(s => s.unsubscribe());

    // Complete event subjects.
    Object.values(this.events).forEach(e => e.complete());

    // Destroy the canvas resize wrapper.
    this.canvas.destroy();

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
      this.events.pickingRender.next();

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
      this.events.moveStart.next(this.transform);
    }

  }

  private onZoomEnd() {

    this.requestPickingRender = true;

    // Only publish the event if the distance > threshold.
    if (this.isMoving) {
      this.events.moveEnd.next(this.transform);
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
      this.events.unHighlight.next();
    }

  }

  private onClick(e: MouseEvent) {

    // TODO: Block if moving?

    const point = this.pickAtCursor(e);

    if (point) {
      this.events.select.next(point);
    } else {
      this.events.unSelect.next();
    }

    this.events.click.next(e);

  }

  private onMouseLeave() {
    this.events.mouseLeave.next();
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

    const width = this.canvas.cssWidth;
    const height = this.canvas.cssHeight;

    const {minX, minY, maxX, maxY} = bounds.scale(this.xyScale);

    const transform = d3.zoomIdentity
      .translate(
        width / 2,
        height / 2,
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