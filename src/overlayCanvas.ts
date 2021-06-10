

import { debounce } from 'lodash';
import { Subject } from 'rxjs';


export default class OverlayCanvas {

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