"use strict";
const FOV_RAD = 75 / 180 * Math.PI;
const NEAR = 0.6;
const FAR = 10.;
// I'm indecisive about the building size ok?
const B = 0.35;
const TILE = {
  // Coord system: x right, y up, z out of screen
  VX: new Float32Array([
    // Ground verts
    -.5, 0, -.5,
    .5, 0, -.5,
    .5, 0, .5,
    -.5, 0, .5,
    // Floor verts
    -B, 0, -B,
    B, 0, -B,
    B, 0, B,
    -B, 0, B,
    // Roof verts
    -B, 1., -B,
    B, 1., -B,
    B, 1., B,
    -B, 1., B,
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
  NTRI: 12,
  VS: `#version 300 es
in vec3 pos;
out vec3 wp;
out vec3 mp;
flat out int tid;
flat out float development;
uniform int sidel;
uniform mat4 w2v;
uniform mat4 v2c;
void main() {
mp=pos;
tid=gl_InstanceID;
float iid=float(tid);
float sidelf=float(sidel);
wp=vec3(mp.x+mod(iid,sidelf),mp.y,mp.z+floor(iid/sidelf));
development=mod(iid/90.,2.);
gl_Position=v2c*w2v*vec4(wp*vec3(1.,development*.5,1.),1.);
}`,
  FS: `#version 300 es
precision mediump float;
in vec3 wp;
in vec3 mp;
flat in int tid;
flat in float development;
out vec4 outColor;
float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);}
void main() {
// make random (subject to uniform pallette)
const vec3 primary_col=vec3(1.0,0.8,0.8);
const vec3 secondary_col=vec3(0.6,0.4,0.4);

float my=mp.y;
float wy=wp.y;
float storey=my*development;
// Square dist to tile center
float sd=max(abs(mp.x),abs(mp.z));
// Dist from middle of each storey
float sy=mod(storey,1.)-0.5;
vec3 col=primary_col;
// Footer, roof, trim all-in-one
col=mix(col,secondary_col,step(0.4,abs(sy)));
// Doorways/windows
float win_grid=step(-0.05,-abs(abs(mp.x)-0.2))+step(-0.05,-abs(abs(mp.z)-0.2));
float door_grid=step(-0.05,-min(abs(mp.x),abs(mp.z)));
float door_height=step(-0.7,-storey);
float win_limits=step(-0.2,-abs(sy));
col=mix(col,vec3(0.4,0.6,0.6),win_grid*win_limits);
col=mix(col,vec3(0.4),door_grid*door_height);
// Grass to path
float n=random(floor(25.*wp.xz));
float pathd=step(.4,sd-0.1*n*(1.-0.95*smoothstep(0.0,0.5,development)));
vec3 grasscol=vec3(pathd,1.-.2*n,pathd);
col=mix(grasscol,col,smoothstep(0.01,0.05,storey-0.07*n));
// ret
outColor=vec4(col, 1);
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
  const prog = glProgFromSrc(gl, TILE.VS, TILE.FS, ["pos"], ["w2v", "v2c", "sidel"]);
  gl.useProgram(prog.p);
  gl.clearColor(.1, .1, .1, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.uniform1i(prog.unifs.sidel, 9.);
  const pos_buf = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(prog.attrs.pos);
  gl.bindBuffer(gl.ARRAY_BUFFER, pos_buf);
  gl.vertexAttribPointer(prog.attrs.pos, 3, gl.FLOAT, false, 0, 0);
  const idx_buf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx_buf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    TILE.IDX,
    gl.STATIC_DRAW,
  );

  let state = 0;
  /**
   * @param {DOMHighResTimeStamp} t
   */
  function drawscene(t) {
    state += time(t);
    resize_canvas_to_display(gl);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Draw tiles
    gl.useProgram(prog.p);
    gl.bindVertexArray(vao);
    gl.bufferData(gl.ARRAY_BUFFER, TILE.VX, gl.STATIC_DRAW);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const s = Math.SQRT1_2;
    gl.uniformMatrix4fv(prog.unifs.w2v, true, [
      1, 0, 0, -4.6 + 0.5 * Math.sin(2 * state), //x
      0, s, -s, 1.2, // y
      0, s, s, 0.3 * Math.sin(state) - 4.6, // z
      0, 0, 0, 1]);
    const f = Math.tan(.5 * (Math.PI - FOV_RAD));
    const range_recip = 1.0 / (NEAR - FAR);
    gl.uniformMatrix4fv(prog.unifs.v2c, true, [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (NEAR + FAR) * range_recip, -1,
      0, 0, NEAR * FAR * range_recip * 2, 0,
    ]);
    gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, 64);
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
