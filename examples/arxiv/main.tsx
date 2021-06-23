

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import Plot from '../../src/plot';

import './index.css';


interface Point {
  id: string;
  title: string;
  categories: string;
  update_date: string;
  position: [number, number];
}


function PlotWrapper(props: { points: Point[] }) {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {

    const plot = new Plot<Point>({
      canvas: canvasRef.current!,
      points: props.points,
      getPosition: p => p.position,
      getSize: () => 1,
      getMaxSize: () => 100,
      getColor: () => [72/255, 120/255, 208/255],
      xyScale: 200,
      shaderOpts: {
        bigAlpha: 0.95,
        bigEdge1: 10,
        bigEdge2: 30,
        maxFastSize: 10,
      }
    });

    return () => {
      plot.destroy();
    }

  })

  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef}></canvas>
    </div>
  )

}


function Page() {

  const [points, setPoints] = useState<null | Point[]>(null);

  useEffect(() => {
    (async () => {

      const points: Point[] = await fetch('/arxiv/arxiv.json.gz')
        .then(res => res.json());

      setPoints(points);

    })();
  }, [])

  return points ? <PlotWrapper points={points} /> : null;

}


ReactDOM.render(<Page />, document.getElementById('root'));
