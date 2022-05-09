import Head from "next/head";
import { useCallback, useEffect, useRef } from "react";
import { createProgram, initializeWebGL } from "../lib/webgl";
import * as m4 from "../lib/m4";

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

type RenderingContext = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;

  positionBuffer: WebGLBuffer;
  positionLoc: number;

  colors: number[][];
  colorLoc: WebGLUniformLocation;

  matrices: any[];
  matrixLoc: WebGLUniformLocation;
};

function setupCanvas(canvas: HTMLCanvasElement): RenderingContext {
  const gl = initializeWebGL(canvas);
  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getUniformLocation(program, "color");
  if (!colorLoc) {
    throw new Error(`Failed to get uniform location`);
  }
  const matrixLoc = gl.getUniformLocation(program, "matrix");
  if (!matrixLoc) {
    throw new Error(`Failed to get uniform location`);
  }

  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    throw new Error(`Failed to create buffer`);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -0.1, 0.4, -0.1, -0.4, 0.1, -0.4, 0.1, -0.4, -0.1, 0.4, 0.1, 0.4, 0.4,
      -0.1, -0.4, -0.1, -0.4, 0.1, -0.4, 0.1, 0.4, -0.1, 0.4, 0.1,
    ]),
    gl.STATIC_DRAW
  );

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
  return {
    gl,
    program,
    positionBuffer,
    positionLoc,
    colors,
    colorLoc,
    matrices,
    matrixLoc,
  };
}

function render(time: number, ctx: RenderingContext) {
  const { gl, program } = ctx;
  time *= 0.001;

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.positionBuffer);
  gl.enableVertexAttribArray(ctx.positionLoc);
  gl.vertexAttribPointer(
    ctx.positionLoc, // location
    2, // size (num values to pull from buffer per iteration)
    gl.FLOAT, // type of data in buffer
    false, // normalize
    0, // stride (0 = compute from size and type above)
    0 // offset in buffer
  );

  const numVertices = 12;
  ctx.matrices.forEach((mat, ndx) => {
    m4.translation(-0.5 + ndx * 0.25, 0, 0, mat);
    m4.zRotate(mat, time * (0.1 + 0.1 * ndx), mat);

    const color = ctx.colors[ndx];

    gl.uniform4fv(ctx.colorLoc, color);
    gl.uniformMatrix4fv(ctx.matrixLoc, false, mat);

    gl.drawArrays(
      gl.TRIANGLES,
      0, // offset
      numVertices // num vertices per instance
    );
  });
  requestAnimationFrame((time) => render(time, ctx));
}

const Page = () => {
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      return;
    }
    const ctx = setupCanvas(canvas);
    requestAnimationFrame((time) => render(time, ctx));
  }, []);
  return (
    <div>
      <Head>
        <title>Instanced Canvas</title>
      </Head>
      <canvas ref={canvasRef} width="398" height="298" />
    </div>
  );
};

export default Page;
