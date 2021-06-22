

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

import Plot, { Bounds } from '../../src';

import './index.css';


interface Point {
  id: string;
  title: string;
  categories: string;
  update_date: string;
  position: [number, number];
}


function Page() {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {

      const points: Point[] = await fetch('/arxiv/arxiv.json.gz')
        .then(res => res.json());

      const plot = new Plot<Point>({
        canvas: canvasRef.current!,
        points,
        getPosition: p => p.position,
        getSize: () => 1,
        getMaxSize: () => 200,
        getColor: () => [72/255, 120/255, 208/255],
        xyScale: 200,
        shaderOpts: {
          bigAlpha: 0.5,
          bigEdge1: 10,
          bigEdge2: 30,
          maxFastSize: 10,
        }
      });

    })();
  })

  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef}></canvas>
    </div>
  )

}


ReactDOM.render(<Page />, document.getElementById('root'));
