

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import {
  interpolatePlasma,
  interpolateMagma,
  interpolateViridis,
  interpolateInferno,
} from 'd3';

import Plot from '../../src/plot';
import { hexToRgb } from '../../src/utils';

import './index.css';


interface Point {
  id: string;
  title: string;
  categories: string;
  update_date: string;
  position: [number, number];
  date_rank: number;
  date_rank_dense: number;
}


function PlotWrapper(props: { points: Point[] }) {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {

    const plot = new Plot<Point>({
      canvas: canvasRef.current!,
      points: props.points,
      getPosition: p => p.position,
      getSize: () => 2,
      getMaxSize: () => 60,
      getColor: p => {
        const color = interpolateViridis(p.date_rank_dense);
        return hexToRgb(parseInt(color.slice(1), 16));
      },
      xyScale: 200,
      // pixelRatio: 1,
      shaderOpts: {
        bigAlpha: 0.8,
        bigEdge1: 20,
        bigEdge2: 60,
        maxFastSize: 20,
        borderRatio: 0.1,
      }
    });

    canvasRef.current!.addEventListener('mousemove', console.log);

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

      const points: Point[] = await fetch('/arxiv/arxiv-ts.json.gz')
        .then(res => res.json());

      setPoints(points);

    })();
  }, [])

  return points ? <PlotWrapper points={points} /> : null;

}


ReactDOM.render(<Page />, document.getElementById('root'));
