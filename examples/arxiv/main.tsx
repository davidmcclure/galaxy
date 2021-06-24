

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { BehaviorSubject, merge } from 'rxjs';

import {
  interpolateViridis,
  interpolatePlasma,
  interpolateMagma,
  interpolateInferno,
} from 'd3';

import Plot from '../../src/plot';
import { hexToRgb } from '../../src/utils';
import OverlayPoint from '../../src/overlayPoint';
import { drawPointImage } from '../../src/utils';

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


export function useObservable<T>(observable: BehaviorSubject<T>) {

  const [value, setValue] = useState(observable.getValue());

  useEffect(() => {
    const subscription = observable.subscribe(setValue);
    return () => subscription.unsubscribe();
  }, [observable]);

  return value;

}


export function useWindowMousePosition() {

  const [xy, setXY] = useState<null | {x: number, y: number}>(null);

  function onMove(e: MouseEvent) {
    setXY({x: e.offsetX, y: e.offsetY});
  }

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return xy;

}


const store = {
  points: new BehaviorSubject<null | Point[]>(null),
  hlPoint: new BehaviorSubject<null | Point>(null),
}


// TODO: Perf cost of field badge?
// TODO: Speed this up with lit-html or similar?
const HighlightTip = () => {

  const point = useObservable(store.hlPoint);
  const mouse = useWindowMousePosition();

  if (!mouse || !point) return null;

  const position = {
    transform: `
      translate(${mouse.x}px, ${mouse.y}px)
      translate(-30px, 30px)`
  };

  return (
    <div
      className="absolute bg-gray-100 py-1.5 px-2 shadow-lg rounded border pointer-events-none max-w-xs"
      style={position}
    >
      <div className="text-xs font-mono" style={{fontSize: 10}}>{point.id} / {point.categories}</div>
      <div className="font-semibold">{point.title}</div>
    </div>
  )

}


function PlotWrapper(props: { points: Point[] }) {

  const plotCanvasRef = useRef<HTMLCanvasElement>(null);
  const hlPointCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {

    const plot = new Plot<Point>({
      canvas: plotCanvasRef.current!,
      points: props.points,
      getPosition: p => p.position,
      getSize: () => 2,
      getMaxSize: () => 60,
      getColor: p => {
        const color = interpolateViridis(p.date_rank_dense);
        // TODO: cssHexToRgb()
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

    const hlPoint = new OverlayPoint(
      plot,
      hlPointCanvasRef.current!,
      drawPointImage({fillStyle: 'rgba(240, 0, 0, 0.7'}),
      {minSize: 20}
    );

    plot.events.highlight.subscribe(p => {
      hlPoint.setPoint(p);
      document.body.style.cursor = 'pointer';
      store.hlPoint.next(p);
    });

    merge(plot.events.unHighlight, plot.events.moveStart).subscribe(() => {
      hlPoint.setPoint(null);
      document.body.style.cursor = 'default';
      store.hlPoint.next(null);
    });

    return () => {
      plot.destroy();
    }

  })

  return (
    <div className="absolute w-screen h-screen">
      <canvas ref={plotCanvasRef}></canvas>
      <canvas ref={hlPointCanvasRef}></canvas>
    </div>
  )

}


function Page() {

  const points = useObservable(store.points);

  useEffect(() => {
    (async () => {

      const points: Point[] = await fetch('/arxiv/arxiv-ts.json.gz')
        .then(res => res.json());

      store.points.next(points);

    })();
  }, [])

  return !points ? null : <>
    <PlotWrapper points={points} />
    <HighlightTip />
  </>

}


ReactDOM.render(<Page />, document.getElementById('root'));
