

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { range } from 'lodash';
import { randomUniform } from 'd3';
import { useControls } from 'leva';

import Plot, { Bounds } from '../../src';
import OverlayPoint from '../../src/overlayPoint';
import { drawPointImage } from '../../src/utils';

import './index.css';


interface Point {
  x: number;
  y: number;
}


function Page() {

  const plotCanvasRef = useRef<HTMLCanvasElement>(null);
  const hlPointCanvasRef = useRef<HTMLCanvasElement>(null);
  const slPointCanvasRef = useRef<HTMLCanvasElement>(null);

  const settings = useControls({
    numPoints: 1000000,
  });

  useEffect(() => {

    const randCoord = randomUniform(0, 1000);

    const points = range(settings.numPoints).map(i => ({
      x: randCoord(),
      y: randCoord(),
    }));

    const plot = new Plot<Point>({
      canvas: plotCanvasRef.current!,
      points,
      getPosition: p => [p.x, p.y],
      getSize: () => 1,
      getMaxSize: () => 200,
      getColor: () => [Math.random(), Math.random(), Math.random()],
    });

    const bounds = new Bounds({
      minX: 0,
      maxX: 1000,
      minY: 0,
      maxY: 1000,
    });

    plot.moveToBounds(bounds.pad(500));

    const hlPoint = new OverlayPoint(
      plot,
      hlPointCanvasRef.current!,
      drawPointImage({
        fillStyle: 'yellow'
      }),
    );

    plot.events.highlight.subscribe(p => {
      hlPoint.setPoint(p);
      document.body.style.cursor = 'pointer';
    });

    plot.events.unHighlight.subscribe(() => {
      hlPoint.setPoint(null);
      document.body.style.cursor = 'default';
    });

    const slPoint = new OverlayPoint(
      plot,
      slPointCanvasRef.current!,
      drawPointImage({
        fillStyle: 'red'
      }),
    );

    plot.events.select.subscribe(p => {
      slPoint.setPoint(p);
    });

    plot.events.unSelect.subscribe(() => {
      slPoint.setPoint(null);
    });

    return () => {
      plot.destroy();
      hlPoint.destroy();
      slPoint.destroy();
    }

  });

  return (
    <div className="w-screen h-screen">
      <canvas ref={plotCanvasRef}></canvas>
      <canvas ref={hlPointCanvasRef}></canvas>
      <canvas ref={slPointCanvasRef}></canvas>
    </div>
  )

}


ReactDOM.render(<Page />, document.getElementById('root'));
