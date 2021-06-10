

export default class Bounds {

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