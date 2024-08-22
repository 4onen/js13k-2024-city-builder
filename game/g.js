"use strict";

/**
 * @typedef {{p:WebGLProgram, attrs: Object.<string,GLint>, unifs: Object.<string,GLint>}} MyWebGLProgram
 */

// ===================
// ==== CONSTANTS ====
// ===================

const TARGET_FPS = 60;
const TARGET_DT = 1 / TARGET_FPS;
const SYS_DT = TARGET_DT / 2;
const FRAMES_FPS_SMOOTHING = 5;
const FPS_UPDATE_INTERVAL = 0.25;
const FOV_RAD = 75 / 180 * Math.PI;
const NEAR = 0.6;
const FAR = 100.;
const USED_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);


// ====================
// ==== MODEL CODE ====
// ====================

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
// Model position
in vec3 pos;
// World position
out vec3 wp;
// Model position
out vec3 mp;
// Tile ID
flat out int tid;
// Tile development
flat out float development;
// Sidelength
uniform int sidel;
// World offset
uniform vec2 woff;
// World to view
uniform mat4 w2v;
// View to clip
uniform mat4 v2c;
void main() {
mp=pos;
tid=gl_InstanceID;
float iid=float(tid);
float sidelf=float(sidel);
wp=vec3(mp.x-mod(iid,sidelf),mp.y,mp.z-floor(iid/sidelf));
development=pow(iid/40.,2.);
gl_Position=v2c*w2v*vec4(wp*vec3(1.,development*.5,1.)+vec3(woff.x,0.0,woff.y),1.);
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
// TODO: make random (subject to uniform pallette)
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

// =======================
// ==== PAGE ELEMENTS ====
// =======================

const CV = document.querySelector('canvas');
const FPS_EL = document.getElementById('fps');

// ===================
// ==== APP STATE ====
// ===================

let last_timestamp = null;
let frame_num = 0;
let last_fps = null;
let time_to_fps_update = FPS_UPDATE_INTERVAL;

/**
 * @type {WebGL2RenderingContext?}
 */
let gl;
/**
 * @type {number?}
 */
let rafId;
/**
 * @type {MyWebGLProgram?}
 */
let tile_prog;
/**
 * @type {WebGLBuffer?}
 */
let tile_pos_buf, tile_idx_buf;
/**
 * @type {WebGLVertexArrayObject?}
 */
let tile_vao;

/**
 * @type {Set<string>} The set of currently pressed keys
 */
const keys = new Set();

// Map states are loaded once per level and should never change w/o reload
// * e.g. heightmap, sidelength, etc.
let map = {
  sidel: 9.,
};

// UI states should be able to change every frame, even with sim paused
// * gtime: Remember "Graphics produces time, physics consumes it" (in bite-sized chunks)
const ui = {
  cam_x: 0,
  cam_y: 0,
  gtime: 0,
};

// City states should change only on sim steps. Exceptions:
// * Buildings should place on mousedown
// * People states (if I get to them) change on frame, to let the GPU do paths.
const city = {};

// ===================
// ==== FUNCTIONS ====
// ===================

/**
 * @param {DOMHighResTimeStamp} timestamp
 */
const frametime = (timestamp) => {
  frame_num += 1;
  if (last_timestamp === null) last_timestamp = timestamp;
  const dt = timestamp - last_timestamp > 0 ? (timestamp - last_timestamp) * 0.001 : TARGET_DT;
  if (last_fps === null) last_fps = TARGET_FPS;
  const frames_fps_smoothing = Math.min(FRAMES_FPS_SMOOTHING, frame_num);
  const fps = (frames_fps_smoothing * last_fps) / (dt * last_fps + frames_fps_smoothing - 1);
  last_fps = fps;
  time_to_fps_update -= dt;
  if (time_to_fps_update < 0) {
    time_to_fps_update = FPS_UPDATE_INTERVAL;
    FPS_EL.textContent = fps.toFixed(1);
  }
  last_timestamp = timestamp;
  return dt;
};

/**
 * Alerts the user of an error
 * @param {string} msg
 */
const ale = (msg) => {
  alert("Error " + msg);
};

/**
 * Checks for WebGL error and alerts user if found.
 */
const ec = () => {
  if (!gl) { return; }
  const e = gl.getError();
  if (e !== gl.NO_ERROR && e !== gl.CONTEXT_LOST_WEBGL) {
    ale(`Gl ${e.toString(16)}`);
  }
};

/**
 * Returns True if the context has been lost.
 */
const cl = () => !gl || gl.isContextLost();

const kd = (...args) => {
  for (const a of args)
    if (keys.has(a))
      return true;
  return false;
};

/**
 * @param {number} typ
 * @param {string} src
 */
const glShaderFromSrc = (typ, src) => {
  const s = gl.createShader(typ);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !cl())
    ale("compiling shader:\n" + gl.getShaderInfoLog(s));
  return s;
};

/**
 * @param {string} vs - Vertex Shader source
 * @param {string} fs - Fragment Shader source
 * @returns {MyWebGLProgram}
 */
const glProgFromSrc = (vs, fs, attr_names, uniform_names) => {
  const p = gl.createProgram();
  gl.attachShader(p, glShaderFromSrc(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glShaderFromSrc(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !cl())
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

const resize_canvas_to_display = () => {
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
 * Gets and sets up a WebGL2 rendering context
 * 
 * @returns {Void}
 */
const init_gl = () => {
  gl = CV.getContext('webgl2', { alpha: false });
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  tile_prog = glProgFromSrc(TILE.VS, TILE.FS, ["pos"], ["woff", "w2v", "v2c", "sidel"]);
  gl.useProgram(tile_prog.p);
  gl.clearColor(.1, .1, .1, 1);
  gl.enable(gl.DEPTH_TEST);
  tile_vao = gl.createVertexArray();
  gl.bindVertexArray(tile_vao);
  gl.enableVertexAttribArray(tile_prog.attrs.pos);
  tile_pos_buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_pos_buf);
  gl.vertexAttribPointer(tile_prog.attrs.pos, 3, gl.FLOAT, false, 0, 0);
  tile_idx_buf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tile_idx_buf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    TILE.IDX,
    gl.STATIC_DRAW,
  );
};

// Is it bad practice to treat a module like a big singleton? Probably.
// But since when has bad practice stopped me?


const draw = (t) => {
  ui.gtime += frametime(t);
  resize_canvas_to_display();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Draw tiles
  gl.useProgram(tile_prog.p);
  gl.bindVertexArray(tile_vao);
  gl.bufferData(gl.ARRAY_BUFFER, TILE.VX, gl.STATIC_DRAW);
  gl.uniform1i(tile_prog.unifs.sidel, map.sidel);
  gl.uniform2f(tile_prog.unifs.woff, ui.cam_x, ui.cam_y);
  const s = Math.SQRT1_2;
  gl.uniformMatrix4fv(tile_prog.unifs.w2v, true, [
    s, 0, -s, 0, //x
    -.5, s, -.5, 0, // y
    .5, s, .5, -4.6,//z
    0, 0, 0, 1,//w
  ]);
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const f = Math.tan(.5 * (Math.PI - FOV_RAD));
  const range_recip = 1.0 / (NEAR - FAR);
  gl.uniformMatrix4fv(tile_prog.unifs.v2c, true, [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (NEAR + FAR) * range_recip, -1,
    0, 0, NEAR * FAR * range_recip * 2, 0,
  ]);
  gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, map.sidel * map.sidel);
  rafId = requestAnimationFrame(draw);
  setTimeout(system_loop);
};

const system_frame = (dt) => {
  const s = 2. * dt;
  if (kd('a', 'arrowleft')) {
    ui.cam_x += s;
    ui.cam_y -= s;
  }
  if (kd('w', 'arrowup')) {
    ui.cam_x += s;
    ui.cam_y += s;
  }
  if (kd('s', 'arrowdown')) {
    ui.cam_x -= s;
    ui.cam_y -= s;
  }
  if (kd('d', 'arrowright')) {
    ui.cam_x -= s;
    ui.cam_y += s;
  }
  ui.cam_x = Math.max(Math.min(ui.cam_x, map.sidel), 0.);
  ui.cam_y = Math.max(Math.min(ui.cam_y, map.sidel), 0.);
};

const system_loop = () => {
  while (ui.gtime > 0) {
    system_frame(SYS_DT);
    ui.gtime -= SYS_DT;
  }
};

// ============================
// ==== EVENT REGISTRATION ====
// ============================

window.addEventListener('webglcontextlost', (e) => {
  console.warn('WebGL context lost', e);
  cancelAnimationFrame(requestAnimationFrameId);
});
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!USED_KEYS.has(k)) return;
  keys.add(k);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

// =================
// ==== RUNTIME ====
// =================

init_gl();
rafId = requestAnimationFrame(draw);
requestIdleCallback(idle, { timeout: 3000 });