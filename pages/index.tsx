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

  const maxTs = trace.root.interval.end;
  let positions = [];
  let spansProcessed = 0;
  let totalSpans = 0;
  rows.forEach((row) => (totalSpans += row.length));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const span of row) {
      const colorBucket = Math.floor((spansProcessed * 255) / totalSpans);

      const { start, end } = span.interval;
      const startPx = start / maxTs;
      const endPx = end / maxTs;
      const rowStartPx = i / rows.length;
      const rowEndPx = (i + 0.9) / rows.length;
      const rect = [
        startPx,
        rowStartPx,
        colorBucket,
        endPx,
        rowStartPx,
        colorBucket,
        startPx,
        rowEndPx,
        colorBucket,
        startPx,
        rowEndPx,
        colorBucket,
        endPx,
        rowStartPx,
        colorBucket,
        endPx,
        rowEndPx,
        colorBucket,
      ];
      positions.push(...rect);
      spansProcessed += 1;
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

  gl.enableVertexAttribArray(ctx.positionAttributeLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.positionBuffer);
  gl.vertexAttribPointer(
    ctx.positionAttributeLocation,
    3, // 3 components per iteration
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
    // TODO: Unmount cleanly.
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
  return (
    <div className={styles.application}>
      <Head>
        <title>Trace visualizer</title>
      </Head>
      <Toolbar />
      <TraceVisualizer />
    </div>
  );
};

const vertexShaderSource = `
attribute vec3 a_position;
varying float v_bucket;

void main() {
  vec2 clipSpace = a_position.xy * 2.0 - 1.0;  
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  v_bucket = a_position.z;
}
`;

const fragmentShaderSource = `
precision mediump float;
varying float v_bucket;

vec3 hcl2rgb(float H, float C, float L) {
  float hPrime = H / 60.0;
  float X = C * (1.0 - abs(mod(hPrime, 2.0) - 1.0));
  vec3 RGB =
    hPrime < 1.0 ? vec3(C, X, 0) :
    hPrime < 2.0 ? vec3(X, C, 0) :
    hPrime < 3.0 ? vec3(0, C, X) :
    hPrime < 4.0 ? vec3(0, X, C) :
    hPrime < 5.0 ? vec3(X, 0, C) :
    vec3(C, 0, X);

  float m = L - dot(RGB, vec3(0.30, 0.59, 0.11));
  return RGB + vec3(m, m, m);
}

float triangle(float x) {
  return 2.0 * abs(fract(x) - 0.5) - 1.0;
}

vec3 colorForBucket(float t) {
  float x = triangle(30.0 * t);
  float H = 64.0 * t * (sin(t) + 1.0);
  float C = 0.25 + 0.2 * x;
  float L = 0.8 - 0.15 * x;
  return hcl2rgb(H, C, L);
}

void main() {  
  gl_FragColor = vec4(colorForBucket(v_bucket), 1);
}
`;

export default Home;

// https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
