export function initializeWebGL(
  canvas: HTMLCanvasElement
): WebGLRenderingContext {
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

  const infoExt = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = infoExt && gl.getParameter(infoExt.UNMASKED_RENDERER_WEBGL);
  const vendor = infoExt && gl.getParameter(infoExt.UNMASKED_VENDOR_WEBGL);
  const version = gl.getParameter(gl.VERSION);
  console.log(
    `WebGL initialized.\n  renderer: ${renderer}\n  vendor ${vendor}\n  version: ${version}`
  );

  return gl;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
) {
  const program = gl.createProgram();
  if (!program) {
    throw new Error(`Failed to create WebGL program`);
  }
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  gl.attachShader(program, vertShader);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
    const lastError = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Failed to link program: ${lastError}`);
  }
  return program;
}

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
