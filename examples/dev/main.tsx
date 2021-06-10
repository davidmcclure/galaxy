
import React, { createRef } from 'react';
import ReactDOM from 'react-dom';
import './index.css';

import { Plot } from '../../src';


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

    const plot = new Plot<Point>({
      canvas: this.canvasRef.current!,
      points: [{x: 0, y: 0}],
      getPosition: p => [p.x, p.y],
      getSize: p => 100,
      getMaxSize: p => Infinity,
      getColor: p => [0, 0, 0],
    });

  }

}


ReactDOM.render(<Page />, document.getElementById('root'));
