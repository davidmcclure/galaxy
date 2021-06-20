

import { Subscription } from 'rxjs';

import Plot from './plot';
import OverlayCanvas from './overlayCanvas';
import { getShaderPointSize } from './shaders';


// TODO: pointImage
interface OverlayPointOptions {
  minSize: number;
  sizeRatio: number;
}
  
  
export default class OverlayPoint<T> {

  private canvas: OverlayCanvas
  private context: CanvasRenderingContext2D;
  private minSize: number;
  private sizeRatio: number;
  private drawSub: null | Subscription = null;

  constructor(
    private plot: Plot<T>,
    canvas: HTMLCanvasElement,
    private pointImage: HTMLCanvasElement,
    options: Partial<OverlayPointOptions> = {},
  ) {

    // Where / how should the resize wrapping happen?
    this.canvas = new OverlayCanvas(canvas, plot.pixelRatio);
    this.context = this.canvas.el.getContext('2d')!;

    this.minSize = options.minSize || 20;
    this.sizeRatio = options.sizeRatio || 1;

  }

  destroy() {
    this.drawSub?.unsubscribe();
    this.canvas.destroy();
    // TODO: Do we need to destroy the canvas context?
  }

  setPoint(point: null | T) {

    this.drawSub?.unsubscribe();

    if (point) {
      this.draw(point);
      this.drawSub = this.plot.events.render.subscribe(() => this.draw(point));
    }

    else {
      this.clear();
    }

  }

  private clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw(point: T) {

    const [x, y] = this.plot.dataToCanvas(...this.plot.getPosition(point));

    const size = this.plot.getSize(point);
    const maxSize = this.plot.getMaxSize(point);

    const shaderSize = getShaderPointSize(size, this.plot.transform.k, {
      maxSize,
      minSize: this.minSize,
    });

    const dim = shaderSize * this.sizeRatio;
    const radius = dim / 2;

    this.clear();

    this.context.drawImage(this.pointImage, x - radius, y - radius, dim, dim);

  }

}