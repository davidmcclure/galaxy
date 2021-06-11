

import React, { createRef } from 'react';
import ReactDOM from 'react-dom';
import { range } from 'lodash';
import { randomUniform } from 'd3';

import Plot, { Bounds } from '../../src';
import './index.css';


interface Point {
  x: number;
  y: number;
}


class Page extends React.Component {

  private canvasRef = createRef<HTMLCanvasElement>();

  render() {
    return (
      <div className="w-screen h-screen">
        <canvas ref={this.canvasRef}></canvas>
      </div>
    )
  }

  componentDidMount() {

    const randCoord = randomUniform(0, 1000);

    const points = range(2000000).map(i => ({
      x: randCoord(),
      y: randCoord(),
    }));

    const plot = new Plot<Point>({
      canvas: this.canvasRef.current!,
      points,
      getPosition: p => [p.x, p.y],
      getSize: () => 1,
      getMaxSize: () => Infinity,
      getColor: () => [0, 0, 1],
    });

    const bounds = new Bounds({
      minX: 0,
      maxX: 1000,
      minY: 0,
      maxY: 1000,
    });

    plot.moveToBounds(bounds.pad(500));

  }

}


ReactDOM.render(<Page />, document.getElementById('root'));
