const vs = `#version 300 es
// vertex shader
in vec4 position;
void main() {
    gl_Position = position;
    gl_PointSize = 130.0;
}`;
const fs = `#version 300 es
// fragment shader
precision highp float;

uniform sampler2D tex;

out vec4 outColor;

void main() {
    //outColor = vec4(gl_PointCoord.xy, 0, 1);  // red
    outColor = texture(tex, gl_PointCoord.xy);
}`;
const glProgFromSrc = (gl, vs, fs) => {
  const p = gl.createProgram();
  const v = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(v, vs);
  gl.compileShader(v);
  gl.attachShader(p, v);
  const f = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(f, fs);
  gl.compileShader(f);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return p;
}
const rawTexture = (gl, w, h, pixels) => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // mip level
    gl.RGB, // internal format
    w, // width
    h, // height
    0, // border
    gl.RGB, // format
    gl.UNSIGNED_BYTE, // type
    pixels // data
  );
  return t;
}
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
const canvas = document.querySelector('canvas');
const fpsel = document.getElementById('fps');
const gl = canvas.getContext('webgl2');
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
const prog = glProgFromSrc(gl, vs, fs);
const tex_loc = gl.getUniformLocation(prog, 'tex');
const pos_loc = gl.getAttribLocation(prog, 'position');
gl.useProgram(prog);
const tex = rawTexture(gl, 2, 2, new Uint8Array([
  255, 128, 0, // Orange
  128, 128, 0, // Olive
  128, 255, 0, // Lime
  255, 255, 0  // Yellow
]));
gl.activeTexture(gl.TEXTURE0 + 0);
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.uniform1i(tex_loc, 0);
gl.clearColor(0, 0, 0, 1);

let first_time = null;
let last_time = null;
let frame_num = 0;
const TARGET_FPS = 60;
const TARGET_DT = 1 / TARGET_FPS;
const FRAMES_FPS_SMOOTHING = 10;
const FPS_UPDATE_INTERVAL = 0.25;
function calc_dt(t) {
  frame_num += 1;
  if (first_time === null) first_time = t;
  if (last_time === null) last_time = t;
  const dt = t - last_time > 0 ? t - last_time : TARGET_DT;
  return dt * 0.001;
}
let last_fps = null;
function calc_fps(dt) {
  if (last_fps === null) { return last_fps = TARGET_FPS; }
  const frames_fps_smoothing = Math.min(FRAMES_FPS_SMOOTHING, frame_num);
  const fps = (frames_fps_smoothing * last_fps) / (dt * last_fps + frames_fps_smoothing - 1);
  last_fps = fps;
  return fps;
}
let time_to_fps_update = FPS_UPDATE_INTERVAL;
function update_fps(fps, dt) {
  time_to_fps_update -= dt;
  while (time_to_fps_update < 0) {
    time_to_fps_update += FPS_UPDATE_INTERVAL;
    fpsel.textContent = fps.toFixed(1);
  }
}
function drawscene(t) {
  const dt = calc_dt(t);
  const fps = calc_fps(dt);
  update_fps(fps, dt);
  resize_canvas_to_display(gl);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const num_points = 5;
  for (let i = 0; i < num_points; i++) {
    const u = i / (num_points - 1); // 0 to 1
    const clipspace = u * 1.6 - 0.8; // -0.8 to 0.8
    gl.vertexAttrib4f(pos_loc, clipspace, (Math.sin((t - first_time) / 1000 + u)) * 0.8, 0, 1);
    const offset = 0;
    const count = 1;
    gl.drawArrays(gl.POINTS, offset, count);
  }
  last_time = t;
  requestAnimationFrame(drawscene);
}
resize_canvas_to_display(gl);
requestAnimationFrame(drawscene);
