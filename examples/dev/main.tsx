

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { range } from 'lodash';
import { randomUniform } from 'd3';
import { useControls } from 'leva';

import Plot, { Bounds } from '../../src';
import './index.css';


interface Point {
  x: number;
  y: number;
}


function Page() {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const settings = useControls({
    numPoints: 100000,
  });

  useEffect(() => {

    const randCoord = randomUniform(0, 1000);

    const points = range(settings.numPoints).map(i => ({
      x: randCoord(),
      y: randCoord(),
    }));

    const plot = new Plot<Point>({
      canvas: canvasRef.current!,
      points,
      getPosition: p => [p.x, p.y],
      getSize: () => 1,
      getMaxSize: () => 200,
      getColor: () => [Math.random(), Math.random(), Math.random()],
      shaderOpts: {
        bigAlpha: 0.8,
      }
    });

    const bounds = new Bounds({
      minX: 0,
      maxX: 1000,
      minY: 0,
      maxY: 1000,
    });

    plot.moveToBounds(bounds.pad(500));

    // plot.events.click.subscribe(() => console.log('click'));

    return () => {
      plot.destroy();
    }

  });

  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef}></canvas>
    </div>
  )

}


ReactDOM.render(<Page />, document.getElementById('root'));
