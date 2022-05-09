import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { EventLoader, Span } from "../lib/event";
import { exampleData } from "../lib/example";
import { computeLayout } from "../lib/layout";
import styles from "../styles/Home.module.css";
import * as m4 from "../lib/m4";
import { createProgram, initializeWebGL } from "../lib/webgl";

function DebugLayout(props: { rows: Span[][] }) {
  const { rows } = props;
  const bad = new Map();
  for (const row of rows) {
    let ts = -1;
    for (const span of row) {
      if (span.interval.start < ts) {
        bad.set(
          span,
          `Span ${span.interval.start} overlaps with previous span ${ts} in row`
        );
      }
      if (span.interval.end < span.interval.start) {
        bad.set(span, `Span ${span} has end before start`);
      }
      ts = span.interval.end;
    }
  }
  return (
    <div>
      {rows.map((row, i) => {
        return (
          <div key={i}>
            Row {i}
            <ol>
              {row.map((span, j) => {
                const msg = bad.get(span);
                return (
                  <li key={j}>
                    {span.name} ({span.interval.start} to {span.interval.end})
                    {msg && <b style={{ color: "red" }}>{msg}</b>}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function Toolbar() {
  return <div className={styles.toolbar}>Toolbar</div>;
}

function TraceVisualizer() {
  return (
    <div className={styles.visualizerContainer}>
      <div className={styles.minimap}>Minimap</div>
      <div className={styles.spans}>Spans</div>
    </div>
  );
}

const Home: NextPage = () => {
  const loader = new EventLoader();
  for (const event of exampleData) {
    loader.addEvent(event);
  }
  const trace = loader.finalize();
  const rows = computeLayout(trace);

  const containerRef = useRef<null | HTMLDivElement>(null);
  const canvasRef = useRef<null | HTMLCanvasElement>(null);

  return (
    <div className={styles.application}>
      <Head>
        <title>Trace visualizer</title>
      </Head>
      <div ref={containerRef} className={styles.glCanvasView}>
        <canvas ref={canvasRef} width="100" height="100" />
      </div>
      <Toolbar />
      <TraceVisualizer />
    </div>
  );
};

export default Home;
