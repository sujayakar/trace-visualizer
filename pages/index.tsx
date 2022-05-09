import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { EventLoader, Span, Trace } from "../lib/event";
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

type RenderingContext = {
  trace: Trace;
  rows: Span[][];

  gl: WebGLRenderingContext;
  program: WebGLProgram;

  resolutionUniformLocation: WebGLUniformLocation;

  positionAttributeLocation: number;
  positionBuffer: WebGLBuffer;

  numVertexes: number;
};

function setupCanvas(canvas: HTMLCanvasElement): RenderingContext {
  const loader = new EventLoader();
  for (const event of exampleData) {
    loader.addEvent(event);
  }
  const trace = loader.finalize();
  const rows = computeLayout(trace);
  const gl = initializeWebGL(canvas);
  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    throw new Error(`Failed to allocate position buffer`);
  }

  const resolutionUniformLocation = gl.getUniformLocation(
    program,
    "u_resolution"
  );
  if (!resolutionUniformLocation) {
    throw new Error(`Failed to get uniform location`);
  }

  const maxTs = trace.root.interval.end;
  let positions = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const span of row) {
      const { start, end } = span.interval;
      const startPx = (start / maxTs) * canvas.width;
      const endPx = (end / maxTs) * canvas.width;
      const rowStartPx = (i / rows.length) * canvas.height;
      const rowEndPx = ((i + 0.9) / rows.length) * canvas.height;
      const rect = [
        startPx,
        rowStartPx,
        endPx,
        rowStartPx,
        startPx,
        rowEndPx,
        startPx,
        rowEndPx,
        endPx,
        rowStartPx,
        endPx,
        rowEndPx,
      ];
      positions.push(...rect);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  return {
    trace,
    rows,
    gl,
    program,
    positionAttributeLocation,
    resolutionUniformLocation,
    positionBuffer,
    numVertexes: positions.length,
  };
}

function render(ctx: RenderingContext) {
  const { gl, program } = ctx;
  const canvas = gl.canvas;

  const dpr = window.devicePixelRatio;
  const displayWidth = Math.round(canvas.clientWidth * dpr);
  const displayHeight = Math.round(canvas.clientHeight * dpr);
  canvas.width = displayWidth;
  canvas.height = displayHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniform2f(ctx.resolutionUniformLocation, canvas.width, canvas.height);

  gl.enableVertexAttribArray(ctx.positionAttributeLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.positionBuffer);
  gl.vertexAttribPointer(
    ctx.positionAttributeLocation,
    2, // 2 components per iteration
    gl.FLOAT, // 32 bit floats
    false, // don't normalize (?) the data
    0, // stride?
    0 // start from beginning of buffer
  );
  gl.drawArrays(gl.TRIANGLES, 0, ctx.numVertexes);

  // Let's just keep on rerendering until we figure out the canvas sizing issues. :shrug:
  requestAnimationFrame((time) => render(ctx));
}

function TraceVisualizer() {
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      return;
    }
    const ctx = setupCanvas(canvas);
    requestAnimationFrame((time) => render(ctx));
  }, []);
  return (
    <div className={styles.visualizerContainer}>
      <div className={styles.minimap}>
        <canvas ref={canvasRef} />
      </div>
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
  return (
    <div className={styles.application}>
      <Head>
        <title>Trace visualizer</title>
      </Head>
      <Toolbar />
      <TraceVisualizer />
      {/* <DebugLayout rows={rows} /> */}
    </div>
  );
};

const vertexShaderSource = `
attribute vec2 a_position;
uniform vec2 u_resolution;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
}
`;

const fragmentShaderSource = `
precision mediump float;

void main() {
  gl_FragColor = vec4(1, 0, 0.5, 1);
}
`;

export default Home;
