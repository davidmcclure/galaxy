

import { debounce } from 'lodash';
import { Subject, fromEvent, Subscription } from 'rxjs';


export default class OverlayCanvas {

  container: HTMLElement;

  private onResizeDebounced = debounce(this.onResize.bind(this), 500);
  private resizeSub: Subscription;

  events = {
    resize: new Subject<void>(),
  };

  constructor(public el: HTMLCanvasElement) {

    // TODO: Will the parent always be the container?
    this.container = el.parentElement!;

    this.onResize();

    // TODO: Resize listener directly on the container?
    // Sync after window resize.
    this.resizeSub = fromEvent(window, 'resize')
      .subscribe(this.onResize.bind(this));

  }

  destroy() {
    this.resizeSub.unsubscribe();
    Object.values(this.events).forEach(s => s.complete());
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