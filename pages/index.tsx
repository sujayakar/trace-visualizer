import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { EventLoader, Span } from "../lib/event";
import { exampleData } from "../lib/example";
import { computeLayout } from "../lib/layout";
import styles from "../styles/Home.module.css";
import * as m4 from "../lib/m4";

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

const vertexShaderSource = `
attribute vec4 a_position;
uniform mat4 matrix;

void main() {
  // Multiply the position by the matrix.
  gl_Position = matrix * a_position;
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform vec4 color;

void main() {
  gl_FragColor = color;
}
`;

let initialized = false;

const Home: NextPage = () => {
  const loader = new EventLoader();
  for (const event of exampleData) {
    loader.addEvent(event);
  }
  const trace = loader.finalize();
  const rows = computeLayout(trace);

  const containerRef = useRef<null | HTMLDivElement>(null);
  const canvasRef = useRef<null | HTMLCanvasElement>(null);

  const maybeResize = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }
    let { width, height } = container.getBoundingClientRect();
    const widthPx = width * window.devicePixelRatio;
    const heightPx = height * window.devicePixelRatio;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initialized) {
      return;
    }
    initialized = true;
    const gl = canvas.getContext("webgl", {
      // alpha: false,
      // antialias: false,
      // depth: false,
      // preserveDrawingBuffer: false,
      // stencil: false,
    });
    if (!gl) {
      throw new Error("Failed to initialize WebGL");
    }
    /*     canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = '0';
    canvas.style.height = '0';     */

    const infoExt = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer =
      infoExt && gl.getParameter(infoExt.UNMASKED_RENDERER_WEBGL);
    const vendor = infoExt && gl.getParameter(infoExt.UNMASKED_VENDOR_WEBGL);
    const version = gl.getParameter(gl.VERSION);
    console.log(
      `WebGL initialized.\n  renderer: ${renderer}\n  vendor ${vendor}\n  version: ${version}`
    );

    const instancedExt = gl.getExtension("ANGLE_instanced_arrays");
    if (!instancedExt) {
      throw new Error(`Instanced arrays not supported.`);
    }

    const program = gl.createProgram();
    if (!program) {
      throw new Error(`Failed to create WebGL program`);
    }
    const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    gl.attachShader(program, vertShader);
    const fragShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      const lastError = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link program: ${lastError}`);
    }

    const positionLoc = gl.getAttribLocation(program, "a_position");
    const colorLoc = gl.getUniformLocation(program, "color");
    const matrixLoc = gl.getUniformLocation(program, "matrix");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.1, 0.4, -0.1, -0.4, 0.1, -0.4, 0.1, -0.4, -0.1, 0.4, 0.1, 0.4, 0.4,
        -0.1, -0.4, -0.1, -0.4, 0.1, -0.4, 0.1, 0.4, -0.1, 0.4, 0.1,
      ]),
      gl.STATIC_DRAW
    );
    const numVertices = 12;

    const numInstances = 5;
    const matrices = [
      m4.identity(),
      m4.identity(),
      m4.identity(),
      m4.identity(),
      m4.identity(),
    ];

    const colors = [
      [1, 0, 0, 1], // red
      [0, 1, 0, 1], // green
      [0, 0, 1, 1], // blue
      [1, 0, 1, 1], // magenta
      [0, 1, 1, 1], // cyan
    ];

    function render(time: number) {
      if (!gl || !instancedExt) {
        return;
      }
      time *= 0.001;

      /* const canvas = gl.canvas;
      const width = canvas.clientWidth * window.devicePixelRatio | 0;
      const height = canvas.clientHeight * window.devicePixelRatio | 0;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      console.log(width, height); */

      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.useProgram(program);

      // setup the position attribute
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(
        positionLoc, // location
        2, // size (num values to pull from buffer per iteration)
        gl.FLOAT, // type of data in buffer
        false, // normalize
        0, // stride (0 = compute from size and type above)
        0 // offset in buffer
      );

      matrices.forEach((mat, ndx) => {
        m4.translation(-0.5 + ndx * 0.25, 0, 0, mat);
        m4.zRotate(mat, time * (0.1 + 0.1 * ndx), mat);

        const color = colors[ndx];

        gl.uniform4fv(colorLoc, color);
        gl.uniformMatrix4fv(matrixLoc, false, mat);

        gl.drawArrays(
          gl.TRIANGLES,
          0, // offset
          numVertices // num vertices per instance
        );
      });
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }, []);

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

function compileShader(
  gl: WebGLRenderingContext,
  shaderType: GLenum,
  source: string
): WebGLShader {
  const shader = gl.createShader(shaderType);
  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export default Home;
