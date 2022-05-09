import Head from "next/head";
import { useCallback, useEffect, useRef } from "react";
import { createProgram, initializeWebGL } from "../lib/webgl";
import * as m4 from "../lib/m4";

const numVertices = 12;
const numInstances = 5;

const vertexShaderSource = `
attribute vec4 a_position;
attribute vec4 color;
attribute mat4 matrix;

varying vec4 v_color;

void main() {
  // Multiply the position by the matrix.
  gl_Position = matrix * a_position;

  // Pass the vertex color to the fragment shader.
  v_color = color;
}
`;

const fragmentShaderSource = `
precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

type RenderingContext = {
  gl: WebGLRenderingContext;
  ext: ANGLE_instanced_arrays;
  program: WebGLProgram;

  positionBuffer: WebGLBuffer;
  positionLoc: number;

  colorBuffer: WebGLBuffer;
  colorLoc: number;

  matrices: Float32Array[];
  matrixBuffer: WebGLBuffer;
  matrixData: Float32Array;
  matrixLoc: number;
};

function setupCanvas(canvas: HTMLCanvasElement): RenderingContext {
  const gl = initializeWebGL(canvas);

  const ext = gl.getExtension("ANGLE_instanced_arrays");
  if (!ext) {
    throw new Error(`Instanced arrays not supported.`);
  }

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getAttribLocation(program, "color");
  const matrixLoc = gl.getAttribLocation(program, "matrix");

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

  // setup matrices, one per instance
  const numInstances = 5;
  // make a typed array with one view per matrix
  const matrixData = new Float32Array(numInstances * 16);
  const matrices: Float32Array[] = [];
  for (let i = 0; i < numInstances; ++i) {
    const byteOffsetToMatrix = i * 16 * 4;
    const numFloatsForView = 16;
    matrices.push(
      new Float32Array(matrixData.buffer, byteOffsetToMatrix, numFloatsForView)
    );
  }

  const matrixBuffer = gl.createBuffer();
  if (!matrixBuffer) {
    throw new Error(`Failed to create matrix buffer`);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
  // just allocate the buffer
  gl.bufferData(gl.ARRAY_BUFFER, matrixData.byteLength, gl.DYNAMIC_DRAW);

  // setup colors, one per instance
  const colorBuffer = gl.createBuffer();
  if (!colorBuffer) {
    throw new Error(`Failed to create color buffer`);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  const colors = [
    [1, 0, 0, 1], // red
    [0, 1, 0, 1], // green
    [0, 0, 1, 1], // blue
    [1, 0, 1, 1], // magenta
    [0, 1, 1, 1], // cyan
  ];
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(colors[0].concat(...colors.slice(1))),
    gl.STATIC_DRAW
  );

  return {
    gl,
    ext,
    program,
    positionBuffer,
    positionLoc,
    colorBuffer,
    colorLoc,
    matrices,
    matrixData,
    matrixBuffer,
    matrixLoc,
  };
}

function render(time: number, ctx: RenderingContext) {
  const { gl, ext, program } = ctx;
  time *= 0.001; // seconds

  // Tell WebGL how to convert from clip space to pixels
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.positionBuffer);
  gl.enableVertexAttribArray(ctx.positionLoc);
  gl.vertexAttribPointer(ctx.positionLoc, 2, gl.FLOAT, false, 0, 0);

  // update all the matrices
  ctx.matrices.forEach((mat, ndx) => {
    m4.translation(-0.5 + ndx * 0.25, 0, 0, mat);
    m4.zRotate(mat, time * (0.1 + 0.1 * ndx), mat);
  });

  // upload the new matrix data
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.matrixBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, ctx.matrixData);

  // set all 4 attributes for matrix
  const bytesPerMatrix = 4 * 16;
  for (let i = 0; i < 4; ++i) {
    const loc = ctx.matrixLoc + i;
    gl.enableVertexAttribArray(loc);
    // note the stride and offset
    const offset = i * 16; // 4 floats per row, 4 bytes per float
    gl.vertexAttribPointer(
      loc, // location
      4, // size (num values to pull from buffer per iteration)
      gl.FLOAT, // type of data in buffer
      false, // normalize
      bytesPerMatrix, // stride, num bytes to advance to get to next set of values
      offset // offset in buffer
    );
    // this line says this attribute only changes for each 1 instance
    ext.vertexAttribDivisorANGLE(loc, 1);
  }

  // set attribute for color
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.colorBuffer);
  gl.enableVertexAttribArray(ctx.colorLoc);
  gl.vertexAttribPointer(ctx.colorLoc, 4, gl.FLOAT, false, 0, 0);
  // this line says this attribute only changes for each 1 instance
  ext.vertexAttribDivisorANGLE(ctx.colorLoc, 1);

  ext.drawArraysInstancedANGLE(
    gl.TRIANGLES,
    0, // offset
    numVertices, // num vertices per instance
    numInstances // num instances
  );

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
