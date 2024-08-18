const FOV_RAD = 90 / 180 * Math.PI;
const NEAR = 0.5;
const FAR = 100.;
const TILE = {
  // Coord system: x right, y up, z out of screen
  VX: new Float32Array([
    // Ground verts
    -.5, 0, -.5,
    .5, 0, -.5,
    .5, 0, .5,
    -.5, 0, .5,
    // Floor verts
    -.4, 0, -.4,
    .4, 0, -.4,
    .4, 0, .4,
    -.4, 0, .4,
    // Roof verts
    -.4, 1, -.4,
    .4, 1, -.4,
    .4, 1, .4,
    -.4, 1, .4,
  ]),
  IDX: new Uint8Array([
    // Ground tris
    0, 1, 2,
    0, 2, 3,
    // Roof tris
    8, 9, 10,
    8, 10, 11,
    // North wall tris
    8, 4, 9,
    9, 4, 5,
    // East wall tris
    9, 5, 10,
    10, 5, 6,
    // South wall tris
    10, 6, 11,
    11, 6, 7,
    // West wall tris
    11, 7, 8,
    8, 7, 4,
  ]),
  VS: `#version 300 es
in vec2 position;
out vec4 worldPos;
uniform mat4 modelToWorld;
uniform mat4 worldToCamera;
uniform mat4 cameraToClip;
void main() {
worldPos = modelToWorld * vec4(position,0.,1.);
vec4 clipPos = cameraToClip * worldToCamera * worldPos;
gl_PointSize = max(1.,150.*(1.0-clipPos.z/clipPos.w));
gl_Position = clipPos;
}`,
  FS: `#version 300 es
precision highp float;
in vec4 worldPos;
out vec4 outColor;
void main() {
outColor = vec4((worldPos.xyz+1.)/2., 1);
}`};

// Page elements
const CV = document.querySelector('canvas');
const time = (() => {
  const FPS_EL = document.getElementById('fps');
  let last_time = null;
  let frame_num = 0;
  const TARGET_FPS = 60;
  const TARGET_DT = 1 / TARGET_FPS;
  const FRAMES_FPS_SMOOTHING = 5;
  const FPS_UPDATE_INTERVAL = 0.25;
  let last_fps = null;
  let time_to_fps_update = FPS_UPDATE_INTERVAL;
  /**
   * @param {DOMHighResTimeStamp} timestamp
   */
  function t(timestamp) {
    frame_num += 1;
    if (last_time === null) last_time = timestamp;
    const dt = timestamp - last_time > 0 ? (timestamp - last_time) * 0.001 : TARGET_DT;
    if (last_fps === null) last_fps = TARGET_FPS;
    const frames_fps_smoothing = Math.min(FRAMES_FPS_SMOOTHING, frame_num);
    const fps = (frames_fps_smoothing * last_fps) / (dt * last_fps + frames_fps_smoothing - 1);
    last_fps = fps;
    time_to_fps_update -= dt;
    if (time_to_fps_update < 0) {
      time_to_fps_update = FPS_UPDATE_INTERVAL;
      FPS_EL.textContent = fps.toFixed(1);
    }
    last_time = t;
    return dt;
  };
  return t;
})();

/**
 * Alerts the user of an error
 * @param {string} msg
 */
const ale = (msg) => {
  alert("Error " + msg);
};
/**
 * Checks for WebGL error and alerts user if found.
 * @param {WebGL2RenderingContext} gl
 */
const ec = (gl) => {
  const e = gl.getError();
  if (e !== gl.NO_ERROR && e !== gl.CONTEXT_LOST_WEBGL) {
    ale(`Gl ${e.toString(16)}`);
  }
};
/**
 * Returns True if the context has been lost.
 * @param {WebGL2RenderingContext} gl
 */
const cl = (gl) => gl.isContextLost();
/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} typ
 * @param {string} src
 */
const glShaderFromSrc = (gl, typ, src) => {
  const s = gl.createShader(typ);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !cl(gl))
    ale("compiling shader:\n" + gl.getShaderInfoLog(s));
  return s;
};
/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vs - Vertex Shader source
 * @param {string} fs - Fragment Shader source
 * @returns {{p:WebGLProgram, attrs: GLint[], unifs: GLint[]}}
 */
const glProgFromSrc = (gl, vs, fs, attr_names, uniform_names) => {
  const p = gl.createProgram();
  gl.attachShader(p, glShaderFromSrc(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glShaderFromSrc(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !cl(gl))
    ale("linking prog:\n" + gl.getProgramInfoLog(p));
  const attrs = {};
  for (const a of attr_names) {
    attrs[a] = gl.getAttribLocation(p, a);
  }
  const unifs = {};
  for (const u of uniform_names) {
    unifs[u] = gl.getUniformLocation(p, u);
  }
  return { p, attrs, unifs };
};
const resize_canvas_to_display = (gl) => {
  const w = gl.canvas.clientWidth;
  const h = gl.canvas.clientHeight;
  const need_resize = w !== gl.canvas.width || h !== gl.canvas.height;
  if (need_resize) {
    gl.canvas.width = w;
    gl.canvas.height = h;
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
};
/**
 * @param {WebGL2RenderingContext} gl 
 */
const init_gl = (gl) => {
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const prog = glProgFromSrc(gl, TILE.VS, TILE.FS, ["position"], ["modelToWorld", "worldToCamera", "cameraToClip"]);
  gl.useProgram(prog.p);
  gl.clearColor(.1, .1, .1, 1);
  gl.enable(gl.DEPTH_TEST);

  let state = 0;
  /**
   * @param {DOMHighResTimeStamp} t 
   */
  function drawscene(t) {
    state += time(t);
    resize_canvas_to_display(gl);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(prog.unifs.modelToWorld, true, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    gl.uniformMatrix4fv(prog.unifs.worldToCamera, true, [
      1, 0, 0, 0, //x
      0, 1, 0, 0, // y
      0, 0, 1, 13 * Math.sin(state) - 14, // z
      0, 0, 0, 1]);
    const f = Math.tan(.5 * (Math.PI - FOV_RAD));
    const range_recip = 1.0 / (NEAR - FAR);
    gl.uniformMatrix4fv(prog.unifs.cameraToClip, true, [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (NEAR + FAR) * range_recip, -1,
      0, 0, NEAR * FAR * range_recip * 2, 0,
    ]);
    const num_points = 5;
    for (let i = 0; i < num_points; i++) {
      const u = i / (num_points - 1); // 0 to 1
      const clipspace = u * 1.6 - 0.8; // -0.8 to 0.8
      gl.vertexAttrib2f(prog.attrs["position"], clipspace, (Math.sin(1.13 * state + u)) * 0.8);
      const offset = 0;
      const count = 1;
      gl.drawArrays(gl.POINTS, offset, count);
    }
    requestAnimationFrameId = requestAnimationFrame(drawscene);
  }

  return drawscene;
};

const gl = CV.getContext('webgl2');
window.addEventListener('webglcontextlost', (e) => {
  console.error('WebGL context lost', e);
  cancelAnimationFrame(requestAnimationFrameId);
});
var requestAnimationFrameId = requestAnimationFrame(init_gl(gl));
