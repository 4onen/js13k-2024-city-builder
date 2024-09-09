"use strict";

/**
 * @typedef {{p:WebGLProgram, unifs: Object.<string,GLint>}} MyWebGLProgram
 */

// ===================
// ==== CONSTANTS ====
// ===================

const N = 13;
const TARGET_FPS = 60;
const TARGET_DT = 1 / TARGET_FPS;
const SYS_DT = TARGET_DT / 2;
const FRAMES_FPS_SMOOTHING = 5;
const FPS_UPDATE_INTERVAL = 0.25;
const NEAR = 0.6;
const FAR = 100.;
const USED_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', '1', '2', 'e', 'escape', 'p', 'r']);

const MAXHT = 4;
// Builtin maps
/**
 * @type {Object.<string, Array<{name:string,sidel:number,dat:string}>>}
 */
const BMAPS = {
  tut: [
    { name: "up", sidel: 1 },
    { name: "dbl", sidel: 2, dat: "000000" },
    { name: "crs", sidel: 3, dat: "F000F0000000F000F0" },
    { name: "qd", sidel: 3, dat: "F000F0000000F00000" },
  ],
  canvas: [
    { name: "7x7", sidel: 7 },
    { name: "9x9", sidel: 9 },
    { name: "11x11", sidel: 11 },
    { name: "absurd", sidel: 127 },
  ]
};

const BULLDOZE_SND = [, 1, , , .3, .4, 4, , , , , , , , , .4, , .3, .2];
const MO_SND = [.4, 0, 200, , , .04, 1, , , , 100, .04, , , , , , , .05];
const SELECT_SND = [, , 200, , .07, , 1, , , , -100, .04];
const SELECT_SND2 = [, , 400];
const COMMERICAL_DOOR = [.5, 0, 800, , .7, , 1, , , , -120, .4, , , , , .8];


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
precision mediump float;
precision mediump int;
layout(location=0) in vec3 pos;
layout(location=1) in vec3 i;
// World position
out vec3 wp;
// Model position
out vec3 mp;
flat out float development;
flat out int tid;
flat out int ttyp;
// Sidelength
uniform int sidel;
// World offset
uniform vec2 woff;
// World to view
uniform mat4 w2v;
// View to clip
uniform mat4 v2c;
uniform int selected_bldg;
uniform vec3 selcol;
float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43.5453123);}
void main() {
mp=pos;
tid=gl_InstanceID;
float iid=float(gl_InstanceID);
float sidelf=float(sidel);
float vis = step(0.5,i.z);
vec2 dbl = vec2(mod(i.z,2.)+1.,i.z);
dbl.y = 1.+float(i.z-1.>0.);
vec2 dblp = (mp.xz-.5)*dbl+1.;
const float eps = .0002;
wp=vec3(dblp.x,mp.y,dblp.y)*step(-0.5,i.z);
wp.x-=mod(iid+eps,sidelf);
wp.y*=.1*random(wp.xz)+.5*i.x;
wp.z-=floor((iid+eps)/sidelf);
development=i.x+float(selcol==vec3(0.,1.,0.));
ttyp=int(i.y);
gl_Position=v2c*w2v*vec4(wp+vec3(woff.x,0.0,woff.y),1.);
}`,
  //DEBUG renderer
  //FS: `#version 300 es\nprecision mediump float;precision mediump int;in vec3 wp;in vec3 mp;flat in float development;flat in int tid;flat in int ttyp;layout(location=0) out vec4 outColor;layout(location=1) out int outTid;void main(){float iid=float(tid);outColor=vec4(mod(iid,7.)/7.,mod(iid,13.)/13.,0.,1.0);}`,
  FS: `#version 300 es
precision mediump float;
precision mediump int;
in vec3 wp;
in vec3 mp;
flat in float development;
flat in int tid;
flat in int ttyp;
layout(location=0) out vec4 outColor;
layout(location=1) out int outTid;
uniform int selected_bldg;
uniform vec3 selcol;
float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43.5453123);}
vec3 primcol(){
  switch(ttyp){
    case 1:return vec3(1.,.8,.8);
    case 2:return vec3(.8,.8,1.);
    default:return vec3(1.,.5,1.);
  }
}
vec3 seccol(){
  switch(ttyp){
    case 1:return vec3(.6,.4,.4);
    case 2:return vec3(.4,.4,.6);
    default:return vec3(1.,.0,.8);
  }
}
void main() {
// TODO:make random (subject to uniform pallette)
vec3 primary_col=primcol();
vec3 secondary_col=seccol();
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
float door_grid=step(-0.06,-min(abs(mp.x),abs(mp.z)));
float door_height=step(-0.7,-storey);
float win_limits=step(-0.2,-abs(sy));
col=mix(col,vec3(0.4,0.6,0.6),win_grid*win_limits);
col=mix(col,vec3(0.4),door_grid*door_height);
// Grass to path
float n=random(floor(25.*wp.xz));
float pathd=step(.4,sd-0.2*n*(1.-0.90*smoothstep(0.0,0.5,development)));
vec3 grasscol=vec3(pathd,1.-.2*n,pathd);
col=mix(grasscol,col,smoothstep(0.01,0.05,storey-0.07*n));
// selection
col=mix(col,selcol,selected_bldg==tid?.5:0.);
// sublight
col*=1.-.1*(development/(1.+2.*my))*smoothstep(-.5,-.4,-sd-.01*n);
// ret
outColor=vec4(col,1.);
outTid=tid;
}`,
  pickFS: `#version 300 es
precision lowp float;
precision mediump int;
in vec3 wp;
in vec3 mp;
flat in float development;
flat in int tid;
flat in int ttyp;
out int outTid;
void main(){outTid=tid;}`
};

// =======================
// ==== PAGE ELEMENTS ====
// =======================

const CV = document.querySelector('canvas');
const LPANE = document.getElementById('lpane');
const PBTN = document.getElementById('playdialog');
const CBTN = document.getElementById('conf');
const DBTN = document.getElementById('deny');
const CD = document.getElementById('cd');
const SND_EL = document.getElementById('snd');
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
 * @type {MyWebGLProgram?}
 */
let pick_prog;
/**
 * @type {WebGLBuffer?}
 */
let tile_pos_buf, tile_idx_buf, tile_info_buf;
/**
 * @type {WebGLVertexArrayObject?}
 */
let tile_vao;
let fb;
let instance_tex, instance_depth;

/**
 * @type {Set<string>} The set of currently pressed keys
 */
const keys = new Set();

// Map states are loaded once per level and should never change w/o reload
// * e.g. heightmap, sidelength, etc.
/**
 * @type {{sidel:number,builtin_num?:number}}
 */
let map = {};

// UI states should be able to change every frame, even with sim paused
// * gtime: Remember "Graphics produces time, physics consumes it" (in bite-sized chunks)
const ui = {
  fov: 75,
  cam_x: 0,
  cam_y: 0,
  cam_fwd: 0,
  cam_rgt: 0,
  gtime: 0,
  mouseX: null,
  mouseY: null,
  tool: 0,
  locksel: false,
  hovered_bldg: -1,
  selected_bldg: null,
  drag: null,
};

// City states should change only on sim steps.
const city = {
  // info: "height","typ","vis" floats, packed
  stats: { typs: [] },
};

// ===================
// ==== FUNCTIONS ====
// ===================

/**
 * @param {{sidel: number, dat: string}} mapdat 
 */
const load_builtin_map = (cat, n) => {
  const mapdat = BMAPS[cat][n];
  map.sidel = mapdat.sidel;
  map.builtin_cat = cat;
  map.builtin_num = n;
  city.info = new Float32Array(3. * map.sidel * map.sidel).fill(-1);
  if (!mapdat.dat) {
    city.info.fill(0);
  } else {
    for (let i = 0; i < map.sidel * map.sidel; i += 1) {
      const hdat = parseInt(mapdat.dat[2 * i], 16);
      if (hdat <= MAXHT) {
        city.info[3 * i] = hdat;
        const vdat = parseInt(mapdat.dat[2 * i + 1], 16);
        city.info[3 * i + 1] = vdat >> 2;
        city.info[3 * i + 2] = vdat & 3;
      }
    }
  }
};

/**
 * @param {DOMHighResTimeStamp} timestamp
 */
const frametime = timestamp => {
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
const ale = msg => {
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

const s = args => {
  if (SND_EL.checked) zzfx(...args);
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
const glProgFromSrc = (vs, fs, uniform_names) => {
  const p = gl.createProgram();
  gl.attachShader(p, glShaderFromSrc(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glShaderFromSrc(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !cl())
    ale("linking prog:\n" + gl.getProgramInfoLog(p));
  const unifs = {};
  for (const u of uniform_names) {
    unifs[u] = gl.getUniformLocation(p, u);
    //DEBUG
    if (unifs[u] === -1) console.error(a, "not found");
  }
  return { p, unifs };
};

/**
 * @param {bool?} force_resize
 */
const resize_canvas_to_display = (force_resize) => {
  const w = gl.canvas.clientWidth;
  const h = gl.canvas.clientHeight;
  const need_resize = force_resize || w !== gl.canvas.width || h !== gl.canvas.height;
  if (need_resize) {
    gl.canvas.width = w;
    gl.canvas.height = h;
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  if (need_resize) {
    gl.bindTexture(gl.TEXTURE_2D, instance_tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, w, h, 0, gl.RED_INTEGER, gl.INT, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, instance_depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  }
};

/**
 * Gets and sets up a WebGL2 rendering context
 *
 * @returns {void}
 */
const init_gl = () => {
  gl = CV.getContext('webgl2');
  gl.cullFace(gl.BACK);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const u = ["woff", "w2v", "v2c", "sidel", "selected_bldg", "selcol"];
  tile_prog = glProgFromSrc(TILE.VS, TILE.FS, u);
  pick_prog = glProgFromSrc(TILE.VS, TILE.pickFS, u);
  gl.clearColor(.1, .1, .1, 1);
  gl.enable(gl.DEPTH_TEST);
  tile_vao = gl.createVertexArray();
  gl.bindVertexArray(tile_vao);
  tile_pos_buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_pos_buf);
  gl.bufferData(gl.ARRAY_BUFFER, TILE.VX, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  tile_info_buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_info_buf);
  gl.bufferData(gl.ARRAY_BUFFER, city.info, gl.STATIC_DRAW);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(1);

  tile_idx_buf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tile_idx_buf);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    TILE.IDX,
    gl.STATIC_DRAW,
  );

  gl.bindTexture(gl.TEXTURE_2D, instance_tex = gl.createTexture());
  gl.bindRenderbuffer(gl.RENDERBUFFER, instance_depth = gl.createRenderbuffer());
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb = gl.createFramebuffer());
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, instance_tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, instance_depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

const set_unifs = (p) => {
  gl.useProgram(p.p);
  gl.uniform1i(p.unifs.sidel, map.sidel);
  gl.uniform1i(p.unifs.selected_bldg, ui.selected_bldg !== null ? ui.selected_bldg : ui.hovered_bldg);
  gl.uniform3fv(p.unifs.tool, [[1., 0., 0.], [0., 0., 1.]][Math.min(1, ui.tool)]);
  gl.uniform2f(p.unifs.woff, ui.cam_x, ui.cam_y);
  const s = Math.SQRT1_2;
  gl.uniformMatrix4fv(p.unifs.w2v, true, [
    s, 0, -s, 0, //x
    -.5, s, -.5, 0, // y
    .5, s, .5, -4.6,//z
    0, 0, 0, 1,//w
  ]);
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const f = Math.tan(Math.PI * .5 * (1 - ui.fov / 180));
  const range_recip = 1.0 / (NEAR - FAR);
  gl.uniformMatrix4fv(p.unifs.v2c, true, [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (NEAR + FAR) * range_recip, -1,
    0, 0, NEAR * FAR * range_recip * 2, 0,
  ]);
};

const draw = (t) => {
  ui.gtime = Math.min(.1, ui.gtime + frametime(t));
  resize_canvas_to_display();
  gl.bindVertexArray(tile_vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_info_buf);
  gl.bufferData(gl.ARRAY_BUFFER, city.info, gl.STATIC_DRAW);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.clearBufferiv(gl.COLOR, 0, new Int32Array([-1, -1, -1, -1]));
  gl.clear(gl.DEPTH_BUFFER_BIT);
  if (ui.mouseX && ui.mouseY) {
    set_unifs(pick_prog);
    gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, map.sidel * map.sidel);

    const d = new Int32Array([-1, -1, -1, -1]);
    gl.readPixels(
      ui.mouseX, ui.mouseY, 1, 1, gl.RGBA_INTEGER, gl.INT, d
    );
    ui.hovered_bldg = d[0];
  }
  if (ui.locksel) {
    ui.locksel = false;
    ui.selected_bldg = ui.hovered_bldg >= 0 ? ui.hovered_bldg : null;
    if (ui.selected_bldg != null) s(MO_SND);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  set_unifs(tile_prog);
  gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, map.sidel * map.sidel);
  gl.flush();
  rafId = requestAnimationFrame(draw);
  setTimeout(system_loop);
};

/**
 * Visual tile count
 * @param {number} vis visual data of the tile
 * @returns {number} number of tiles occupied
 */
const vtc = (v) => Math.ceil(v * v / 4 + 1);

const recalc_city_stats = () => {
  const t = {
    buildings: 0,
    stories: 0,
    size: [0, 0, null, 0],
  };
  const typs = [
    undefined,
    Object.assign({}, t),
    Object.assign({}, t),
  ];
  for (let i = 0; i < map.sidel * map.sidel; i += 1) {
    const typ = city.info[3 * i + 1];
    const tiles = vtc(city.info[3 * i + 2]);
    const height = Math.ceil(city.info[3 * i]);
    t.buildings += (typ > 0) * tiles;
    t.stories += height * tiles;
    t.size[tiles] += typ > 0;
    if (typ > 0) {
      let s = typs[typ];
      s.buildings += (typ > 0) * tiles;
      s.stories += height * tiles;
      s.size[tiles] += typ > 0;
    }
  }
  t.typs = typs;
  city.stats = t;
};

const can_see = (n) => n != N && n != N * N && n != N * N * N && n != N * N * N * N && n != N * N * N * N * N;


/**
 * @returns {bool}
 */
const can_place_story = (idx, typ, vis) => {
  let height = city.info[3 * idx];
  typ = typ || city.info[3 * idx + 1];
  vis = vis || city.info[3 * idx + 2];
  let building = height != Math.ceil(height);
  return (
    height < MAXHT
    && !building
    && can_see(city.stats.stories + vtc(vis))
    && can_see(city.stats.typs[typ].stories + vtc(vis))
    && (!(vis & 1) || city.info[3 * idx + 4] === 0)
    && (!(vis & 2) || city.info[3 * (idx + map.sidel) + 1] === 0)
    && (!(vis == 3) || city.info[3 * (idx + map.sidel) + 4] === 0)
    && city.info[3 * idx + 2] >= 0
  );
};

const can_place = (idx, typ, vis) => {
  const t = city.stats.typs[typ];
  return (
    can_place_story(idx, typ, vis)
    && can_see(city.stats.buildings + vtc(vis))
    && can_see(city.stats.size[vtc(vis)] + 1)
    && can_see(t.buildings + vtc(vis))
    && can_see(t.size[vtc(vis)] + 1)
    && (!(vis & 1) || (idx + 1) % map.sidel > 0)
    && (!(vis & 1) || city.info[3 * idx + 5] === 0)
    && (!(vis & 2) || city.info[3 * (idx + map.sidel) + 2] === 0)
    && (!(vis == 3) || city.info[3 * (idx + map.sidel) + 5] === 0)
  );
};

/**
 * @param {number} i idx
 * @param {number} typ
 * @param {number} vis
 */
const place = (i, typ, vis) => {
  if (vis & 1) city.info[3 * i + 5] = -1;
  if (vis & 2) city.info[3 * (i + map.sidel) + 2] = -1;
  if (vis == 3) city.info[3 * (i + map.sidel) + 5] = -1;
  city.info[3 * i + 2] = vis;
  city.info[3 * i + 1] = typ;
  city.info[3 * i] += .05;
};


/**
 * @param {number} idx
 * @returns {bool}
 */
const can_delete = (idx) => {
  const typ = city.info[3 * idx + 1];
  const height = Math.ceil(city.info[3 * idx]);
  return (
    can_see(city.stats.stories - vtc(vis) * height)
    && can_see(city.stats.buildings - vtc(vis))
    && can_see(city.stats.typs[typ].stories - vtc(vis) * height)
    && can_see(city.stats.typs[typ].buildings - vtc(vis))
    && can_see(city.stats.typs[typ].size[vtc(vis)] - 1)
    && (!(vis & 1) || (idx + 1) % map.sidel > 0)
    && (!(vis & 2) || idx < map.sidel * map.sidel - 1)
  );
};

/**
 * @param {float} dt
 */
const game_frame = (dt) => {
  recalc_city_stats();
  const maxidx = map.sidel * map.sidel;
  let have_built = !kd('r');
  for (let i = 0; i < maxidx; i += 1) {
    if (city.info[3 * i + 2] < 0) continue;
    const build = !have_built && Math.random() < 0.1 / maxidx;
    const is_new = city.info[3 * i + 1] === 0;
    const typ = 1 + (Math.random() > 0.5);
    if (build) {
      if (is_new) {
        for (const vis of [3, 2, 1, 0]) {
          if (can_place(i, typ, vis)) {
            place(i, typ, vis);
            have_built = true;
          }
        }
      } else if (can_place_story(i)) {
        city.info[3 * i] += .05;
        have_built = true;
      }
    }
    city.info[3 * i] = Math.min(Math.ceil(city.info[3 * i]), city.info[3 * i] + dt * 2.);
  }
};

/**
 * @param {float} dt
 */
const system_frame = (dt) => {
  let s = 2. * dt;
  if (kd('shift')) {
    s *= 3;
  }
  if (kd('w', 'arrowup')) ui.cam_fwd += s;
  if (kd('a', 'arrowleft')) ui.cam_rgt -= s;
  if (kd('s', 'arrowdown')) ui.cam_fwd -= s;
  if (kd('d', 'arrowright')) ui.cam_rgt += s;
  ui.cam_x = Math.max(Math.min(ui.cam_x + ui.cam_fwd - ui.cam_rgt, map.sidel), 0.);
  ui.cam_y = Math.max(Math.min(ui.cam_y + ui.cam_fwd + ui.cam_rgt, map.sidel), 0.);
  ui.cam_fwd = ui.cam_rgt = 0;
  game_frame(dt);
};

const keydown = () => {
  if (kd('escape', 'p') && map.sidel) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else {
      rafId = requestAnimationFrame(draw);
    }
  }
  if (kd('1')) {
    ui.tool = 1;
  }
  if (kd('2')) {
    ui.tool = 2;
  }
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

const mmovpos = e => {
  e.preventDefault();
  if (!gl) return;
  const r = CV.getBoundingClientRect();
  const newx = (e.clientX - r.left) * gl.canvas.width / r.width;
  const newy = gl.canvas.height * (1 - (e.clientY - r.top) / r.height) - 1;
  if (ui.drag == e.pointerId && ui.mouseX) {
    ui.cam_rgt -= .005 * (newx - ui.mouseX);
    ui.cam_fwd -= .005 * (newy - ui.mouseY);
  }
  ui.mouseX = newx;
  ui.mouseY = newy;
};

const ael = (e, t, f) => e.addEventListener(t, f);

ael(window, 'webglcontextlost', e => {
  console.warn('WebGL context lost', e);
  cancelAnimationFrame(requestAnimationFrameId);
});
ael(document, 'keydown', e => {
  const k = e.key.toLowerCase();
  if (!USED_KEYS.has(k)) return;
  keys.add(k);
  keydown();
});
ael(document, 'keyup', e => {
  keys.delete(e.key.toLowerCase());
});
ael(CV, "pointerdown", e => {
  e.preventDefault();
  ui.locksel = true;
  ui.drag = e.pointerId;
  mmovpos(e);
});
ael(CV, "pointermove", mmovpos);
ael(CV, "pointerup", e => {
  if (ui.drag == e.pointerId) {
    ui.drag = ui.mouseX = ui.mouseY = null;
  }
});
ael(SND_EL, "change", () => s(SELECT_SND2));
ael(SND_EL, 'mouseenter', () => s(MO_SND));
for (let b of [CBTN, DBTN, PBTN]) {
  ael(PBTN, 'mouseenter', e => { if (!e.target.disabled) s(MO_SND); });
  ael(PBTN, 'mousedown', e => { if (!e.target.disabled) s(SELECT_SND2); });
}

// =================
// ==== RUNTIME ====
// =================

PBTN.addEventListener('close', (e) => {
  load_builtin_map('canvas', 3);
  init_gl();
  rafId = requestAnimationFrame(draw);
});
