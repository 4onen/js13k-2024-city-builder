"use strict";

/**
 * @typedef {{p:WebGLProgram, unifs: Object.<string,GLint>}} MyWebGLProgram
 * 
 * This type is used to wrap up a WebGL program with its uniforms.
 * Earlier in development this also included attributes, but my Firefox
 * install was refusing to locate the attributes via attribute names in
 * some odd cases so I just switched to using the attribute index and
 * layout specifiers.
 */

// ===================
// ==== CONSTANTS ====
// ===================

const N = 13; // The number that MAY NOT BE
const TARGET_FPS = 60; // The target frames per second, used for tick timing
const TARGET_DT = 1 / TARGET_FPS; // The target delta time, for tick timing
const SYS_DT = TARGET_DT / 2; // The delta time for system updates
const FRAMES_FPS_SMOOTHING = 5; // The number of frames to smooth FPS over (approx.)
const FPS_UPDATE_INTERVAL = 0.25; // The interval (sconds) at which to update the FPS display
const NEAR = 0.6; // The near clipping plane
const FAR = 100.; // The far clipping plane
const USED_KEYS = new Set([ // The set of keys used by the game, for input capture
  'w', 'a', 's', 'd',
  'arrowup', 'arrowleft', 'arrowdown', 'arrowright',
  'shift',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'escape', 'e', 'q', 'p', ';', '`'
]);

/**
 * @type {number}
 * 
 * The maximum height of any building on any map. This has to remain strictly
 * less than 15 to fit in one hexidecimal digit for the map data format below.
 * 
 * Currently, this is set to 4, which is a good height for the game. It's tall
 * enough to make the buildings look interesting, but short enough that the
 * camera that has no height control doesn't clip through the buildings.
 * 
 * Feels very dense in a good way when you get many of these.
 */
const MAXHT = 4;

// Builtin maps
/**
 * @typedef {{name:string,sidel:number,dat?:string,tools?:Array<int>}} CWTNMap
 * 
 * This is the data format of a serialized "map" in CWTN.
 * - name: The name of the map
 * - sidel: The sidelength of the map -- all maps are on a square grid, but maps _can_ have fewer than sidel^2 tiles
 * - dat?: The data of the map, in a string of hexidecimal digits.
 *        If omitted, all tiles are 1x1 empty tiles.
 *        Read the data as 8-bit numbers with the following meanings:
 *     - First digit: The height of the building at this tile, unless greater than MAXHT in which this tile is erased from the map.
 *     - Second digit top 2 bits: The "typ" of building
 *       - 0: ERROR/blank
 *       - 1: Residential
 *       - 2: Commercial
 *       - 3: unused
 *     - Second digit bottom 2 bits: The "vis" of the building - size and orientation
 *       - 0: 1x1, no rotation information
 *       - 1: 2x1, positive X double
 *       - 2: 1x2, positive Z double
 *       - 3: 2x2, no rotation information
 * - tools?: The tools available for this map. If omitted, all tools are available.
 *          The tools are numbered in order according to the TOOLS array below.
 *          This value is treated as a set, so cannot reorder the tools.
 */
/**
 * @type {Object.<string, Array<CWTNMap>>}
 * 
 * These are the "builtin maps" (BMAPS) for the game. They're stored in a
 * dictionary where the keys are the category of the map and the values are
 * arrays of the maps in that category. The maps are stored in the CWTNMap
 * format.
 */
const BMAPS = {
  tut: [
    { name: "up", sidel: 1, tools: [1, 2] }, // Upward
    { name: "dbl", sidel: 2, dat: "000000", tools: [0, 3] }, // Double
    { name: "crs", sidel: 3, dat: "F000F0000000F000F0", tools: [0, 1, 2, 3] }, // Cross
    { name: "qd", sidel: 3, dat: "F000F0000000F00000", tools: [0, 1, 2, 4] }, // Quad
    { name: "lim", sidel: 5, dat: "141414141414141414141414000000000000", tools: [0, 2, 6] } // Limit
  ],
  puzzle: [
    { name: "kpd", sidel: 3, tools: [0, 1, 5, 6] }, // Keypad
    { name: "escr", sidel: 5, dat: "000000000000F0F0F00000F0F0F00000F0F0F0000000000000", tools: [0, 1, 2, 6] }, // Escher
    { name: "hart", sidel: 5, dat: "00000000F00000000000000000000000000000F0F00000", tools: [0, 1, 2, 3, 4] }, // Heart
    { name: "stlk", sidel: 7, dat: "F0F000F000F00000000000000000F000F000F000", tools: [0, 1, 2, 3, 5, 6] }, // (Bean)stalk
    { name: "chkr", sidel: 8, dat: "00F000F000F000F0F000F000F000F00000F000F000F000F0F000F000F000F00000F000F000F000F0F000F000F000F00000F000F000F00000F000F000F0000000" }, // Checker
  ],
  canvas: [
    { name: "3x3", sidel: 3 },
    { name: "5x5", sidel: 5 },
    { name: "7x7", sidel: 7 },
    { name: "9x9", sidel: 9 },
    { name: "11x11", sidel: 11 },
    { name: "absurd", sidel: 64 }, // Had this at 256x256, but it was too slow. Then at 127x127, but mobile bugged out way too close to the origin. Now it's at 64x64, which is a good balance.
  ]
};

// Sound effects for the ZZFX engine
const BULLDOZE_SND = [.1, 1, , , .3, .4, 4, , , , , , , , , .4, , .3, .2];
const MO_SND = [.3, 0, 200, , , .04, 1, , , , 100, .04, , , , , , , .05];
const SELECT_SND = [, , 400];
const BUILD_SND = [.3, .2, , .05, , , , .4, , , , , , , 3];
const COMMERICAL_DOOR = [.03, 0, 700, , .7, , 1, , , , -120, .4, , , , , .8];

/**
 * @param {number} i The index of the tool, used to refer to it in all code
 * @param {string} c The content of the tool's button
 * @param {string|undefined} s A style parameter to maybe set on the button
 * @param {string|undefined} v A value to maybe set for the style parameter
 * @returns {HTMLButtonElement} The UI button element for the tool.
 */
const MKTOOL = (i, c, s, v) => {
  const r = document.createElement("button");
  r.id = `TOOL${i}`; // Set the ID of the button so we can refer to it
  r.dataset.k = i; // Set the keycode display for the button
  r.textContent = c; // Set the content of the button
  r.style[s] = v; // Set the style parameter if it's provided
  r.addEventListener("click", e => chtool(i));
  return r;
};
// The unchanging array of tools supported by the game.
const TOOLS = [
  MKTOOL(0, "🚧"), // Bulldozer
  MKTOOL(1, "🏗️"), // Add-story
  MKTOOL(2, "🏠"), // House
  MKTOOL(3, "🏠🏠"), // Longhouse
  MKTOOL(4, "🏠🏠🏠🏠"), // Apartment block
  MKTOOL(5, "🛒"), // Corner store
  MKTOOL(6, "🛒🛒"), // Mart
  MKTOOL(7, "🛒🛒🛒🛒"), // Mall
];


// ====================
// ==== MODEL CODE ====
// ====================

// I'm indecisive about the buildings' precise size, ok?
const B = 0.35;
/**
 * @type {{VX:Float32Array,IDX:Uint8Array,NTRI:number,VS:string,FS:string,pickFS:string}}
 * 
 * VX, IDX, and NTRI is the 3D model of a tile for the game.
 * It's a simple model with a ground quad, a roof quad, and four wall quads,
 * represented as indexed triangles, where the indices are the indices of the
 * vertices in the VX array. Vertices are the XYZ coordinates of the corners of
 * triangles in the model. NTRI is there to tell the render code later how many
 * triangles are in the model.
 * Most efficient format? Idk. But it's pretty simple.
 * 
 * VS is the vertex shader for the model, which is a program run on the GPU to
 * transform the model's vertices into screen space. It's written in GLSL, a
 * C-like language for WebGL applications to ship code to the GPU called
 * "shaders".
 * 
 * FS is the fragment shader for the model, which like the vertex shader runs
 * on the GPU. This program paints "fragments" (think pixels) over everywhere
 * that the model's triangles are drawn. It's also written in GLSL.
 */
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
// Here we specify the floating point precision for the shader as "medium".
// This is a good balance between performance and precision on most platforms,
// though I find mobile rounds this down to lowp anyway.
precision mediump float;
precision mediump int;

// I use something called "instanced rendering" to draw the tiles in the game.
// This means that I'm drawing the same model multiple times with different
// data for each instance. This is a common technique for drawing lots of
// objects in 3D games.

// In order to place the tiles, I rely on a variable automatically provided
// by WebGL/GLSL called "gl_InstanceID". This is the index of the instance
// currently being drawn in the instance buffer.

// These two lines are the inputs to the vertex shader, known as "attributes".
// They are the position of the vertex in the model space and the instance
// data for the tile. The instance data is the tile's height, type, and
// visual appearance, packed into a single vec3 so that I'd stop having
// weird issues with attribute locations under some circumstances.
layout(location=0) in vec3 pos;
layout(location=1) in vec3 i;

// These "out" and "flat out" lines are the outputs of the vertex shader.
// They'll be the inputs to the fragment shader later.
// The "flat" ones have interpolation disabled. This is useful for things
// like the tile ID, where it shouldn't change between vertices on the
// same tile.
out vec3 wp; // Position of the vertex in world space (interpolated across the triangle for the fragment shader)
out vec3 mp; // Position of the vertex in model space (interpolated across the triangle for the fragment shader)
flat out float development; // The unpacked "development" of the tile (this is a slightly adjusted version of the height)
flat out int tid; // The tile's ID, which is the index of the tile in the instance buffer.
flat out int ttyp; // The tile's type, which is the second component of the instance data.

// Now we're down to "uniforms", which are inputs to the vertex and fragment
// shaders that don't change between all the instances of the draw call.
// These are things like the sidelength of the map, the position of the camera,
// and the transformation matrices.

// When we're rendering, we use the sidelength of the map to calculate the
// position of the tile in world space from the tile gl_InstanceID. We then
// offset all these positions by the camera position, to give the illusion
// that the camera is moving around the map. The world-to-view matrix is
// a rotation matrix that rotates the world to a space where the z-axis is
// directly out of the camera. This lets us actually "see" from the camera's
// perspective. We then apply the view-to-clip matrix, which stretches objects
// farther away to make them look smaller and objects close-up to make them
// look bigger, just like how perspective works in real life. This stretching
// also fits the objects in a small range of values called "clip space" that
// the GPU automatically converts to pixel space to decide where it wants
// to run the fragment shader to draw pixels.

// Most people would combine the world-to-view and view-to-clip matrices into
// one matrix on the CPU and send that to the GPU as a single uniform, to save
// on communication and computation. However, for my game, there're three very
// good reasons to send them separately:
// 1. My project doesn't have a linear algebra library, so I'd have to write
//    the matrix multiplication code myself, or manually do the matrix math
//    to combine the matrices on the CPU by hand. I'm too lazy for either,
//    and the former would add size to the project.
// 2. These uniforms don't actually change between frames, so I don't need to
//    worry about the overhead of sending them.
// 3. I'm recalculating the entire city stats every system tick, so I'm already
//    doing a lot of work on the CPU. I don't want to add more work to the CPU
//    by combining these matrices when the GPU is barely utilized by my simple
//    game with _one_ draw call.

uniform int sidel; // The sidelength of the map
uniform vec2 woff; // The world offset of the camera
uniform mat4 w2v; // The world-to-view transformation matrix that converts world space to view space
uniform mat4 v2c; // The view-to-clip transformation matrix that converts view space to clip space
uniform int selected_bldg; // The ID of the selected building (if any)
uniform vec4 selcol; // The selection color & visual appearance override

// This random function is a modified version of the one you'll see all over
// ShaderToy. It's a simple hash function that takes a 2D vector and returns
// a pseudo-random number between 0 and 1. It's used to add our pretty grass
// and path textures to the tiles, to vary building height slightly, etc.
float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43.5453123);}

// The main function of the shader is called once for every vertex of every
// instance of the model. It calculates the position of the vertex in world
// space, the position of the vertex in model space, the development of the
// tile, the tile's ID, and unpacks the tile's type. It then calculates the
// visual stretching of the tile, transforms the vertex to clip space, and
// sends the vertex to the fragment shader.
void main() {
mp=pos; // Set the model position to the input position right away.
tid=gl_InstanceID; // Set the tile ID to the instance ID.
float iid=float(gl_InstanceID); // Convert the instance ID to a float for
                                // calculations. This is due to a bug I had
                                // on my Intel UHD 630 laptop where when the
                                // modulo value was prime for integer
                                // calculations, every 3rd or 5th row would
                                // randomly shift by a full tile in the
                                // negative direction. I fixed it by converting
                                // the calculations to floating-point and
                                // adding a tiny epsilon to the modulo value to
                                // make sure we always trip over the edge.
float sidelf=float(sidel); // Convert the sidelength to a float for calc.
                           // See above for why.

// Here, we unpack the instance data into the development, tile type, and
// visual appearance. Vis is the toughest one, as it's highly nonlinear.
float vis = selected_bldg==tid ? selcol.a : i.z;
// First, we need to decide if we're doing a double tile or not, and if so
// in which directions. I'd do this bitwise, but I don't trust integer math
// on the GPU now, so instead I need to modulo the instance ID by 2 and add
// 1 to get the x direction size. For the z direction size, it becomes 2 as
// soon as vis is greater than or equal to 2, so that's an easy step function.
vec2 dbl = vec2(mod(vis,2.)+1.,1.+step(2.,vis));
// This "double" vector is the stretching of the tile in the x and z directions
// but we need to stretch it from one corner. The tiles as defined in the model
// are centered on the origin, so to do the stretch and shift them over, we
// subtract 0.5 from the x and z components of the double vector, multiply by
// the stretching, and add 1 to shift the tile back to the correct position.
vec2 dblp = (mp.xz-.5)*dbl+1.;


// Now we calculate the world position of the vertex, starting at the stretched
// model positions and the original model y position. We also have another
// check against the vis value to decide if the tile should be deleted (vis=-1)
// or if it should exist (vis>=0).
wp=vec3(dblp.x,mp.y,dblp.y)*step(-0.5,vis);

const float eps = .0002; // This is the aforementioned epsilon to fix the
                         // Intel UHD 630 math. It's a tiny value that's
                         // added to the modulo value to make sure we always
                         // just step over the modulo value.
// This modulo decides the x position of the tile -- we just count from 0 to
// sidel over and over again on the x axis. On the z-axis, we count up once
// every time the x-axis wraps around. This lets us cheaply calculate the
// x and z positions of the tile in the world space without needing to have
// a separate buffer for the tile positions.
wp.x-=mod(iid+eps,sidelf);
wp.z-=floor((iid+eps)/sidelf);

// Here, we take the height of the building and stretch it out to the height
// value plus some random variation. This is to make the buildings look a bit
// more interesting and less like a grid of blocks.
wp.y*=.1*random(wp.xz)+.5*i.x;
// Note we also chop the height of the buildings in half. This is just a
// stylistic choice to make the buildings look a bit wider and more squat.

// Now we finally calculate development. This essentially the count
// of stories that should appear on the building. We take the height value as
// a base, but if we're the selected building and the selection color is
// green, we add one story to the building. This is visual feedback for
// users clicking around what their tool is planning to do.
development=i.x+float(selected_bldg==tid&&selcol.rgb==vec3(0.,1.,0.));
// Here we just pass along the tile type to the fragment shader.
ttyp=int(i.y);
// Then, finally, we transform our world position through view space to
// clip space and send it to the fragment shader.
gl_Position=v2c*w2v*vec4(wp+vec3(woff.x,0.0,woff.y),1.);
}`,
  //DEBUG fragment shader - This was the renderer I used to debug the
  // Intel UHD 630 math bug I was encountering.
  //FS: `#version 300 es\nprecision mediump float;precision mediump int;in vec3 wp;in vec3 mp;flat in float development;flat in int tid;flat in int ttyp;layout(location=0) out vec4 outColor;layout(location=1) out int outTid;void main(){float iid=float(tid);outColor=vec4(mod(iid,7.)/7.,mod(iid,13.)/13.,0.,1.0);}`,

  // The fragment shader for the tile model. This is where the actual
  // coloring of the tile happens. It's a bit of a mess, but it's a mess
  // that works.
  FS: `#version 300 es
// Once again, we tell the GPU that we only need medium precision for floats
// and integers. Once again, we get weird behavior on mobile that can only
// be explained by it ignoring this directive.
precision mediump float;
precision mediump int;

// These are the inputs to the fragment shader. They're the outputs of the
// vertex shader, interpolated across the triangle for the fragment shader.
// As above, the "flat" specifiers mean that interpolation is disabled, so
// we're expecting them to be the same for all fragments of the model.
in vec3 wp; // The world position of the vertex
in vec3 mp; // The model position of the vertex
flat in float development; // The development (height) of the tile
flat in int tid; // The tile instance ID.
flat in int ttyp; // The tile type

// These are the outputs of the fragment shader. They're the color of the
// fragment, but also the ID of the tile. This is how we can pick tiles
// by clicking on them -- rather than reversing the rendering math to cast
// a ray into the scene, we just paint a spare buffer with the instance at
// every position and have the mouse position query the buffer.
layout(location=0) out vec4 outColor;  // The color of the fragment
layout(location=1) out int outTid; // The ID of the tile at the fragment

// These are the uniforms of the fragment shader. We don't need nearly as
// much information as the vertex shader -- just the ID of the selected
// building and the selection color.
uniform int selected_bldg;
uniform vec4 selcol;

// This is the random function, same as the one in the vertex shader.
float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43.5453123);}

// This function returns the primary color of the building based on its type.
// This is in the fragment shader because there are so few colors and it
// is _only_ used in the fragment shader.
vec3 primcol(){
  switch(ttyp){
    case 1:return vec3(1.,.8,.8);
    case 2:return vec3(.8,.8,1.);
    default:return vec3(1.,.5,1.);
  }
}
// See above, but for secondary (trim) colors.
vec3 seccol(){
  switch(ttyp){
    case 1:return vec3(.6,.4,.4);
    case 2:return vec3(.4,.4,.6);
    default:return vec3(1.,.0,.8);
  }
}

// The main function of the fragment shader. This is called once for every
// fragment we try to render to the screen. It calculates the color of the
// fragment based on the tile's type, height, and position, and then sends
// that color on. It also passes along the tile ID, as mentioned before.
void main() {
// TODO:make random (subject to uniform pallette) (yeah, that's a TODO)
vec3 primary_col=primcol();
vec3 secondary_col=seccol();
float storey=mp.y*development; // Storey is what floor of the building this
                               // fragment is supposed to paint.
// Square dist to tile center
float sd=max(abs(mp.x),abs(mp.z));
// Dist from middle of each storey in y
float sy=mod(storey,1.)-0.5;

// Start by assuming the primary color is the color of the fragment.
vec3 col=primary_col;

// Footer, roof, and per-story trim are computed with this one line.
col=mix(col,secondary_col,step(0.4,abs(sy)));

// Doorways/windows
// Using abs math relative to the tile center, I repeat a few different
// gridlines over space and paint them in. (While a building is growing a new
// story, you can see the windows' gridlines pop in as the roof passes up
// through their height.)
float win_grid=step(-0.05,-abs(abs(mp.x)-0.2))+step(-0.05,-abs(abs(mp.z)-0.2));
float door_grid=step(-0.06,-min(abs(mp.x),abs(mp.z)));
float door_height=step(-0.7,-storey);
float win_limits=step(-0.2,-abs(sy));
// Then we mix these colors into the fragment color.
col=mix(col,vec3(0.4,0.6,0.6),win_grid*win_limits);
col=mix(col,vec3(0.4),door_grid*door_height);

// This chunk of code renders a textured ground and grass on the ground.
float n=random(floor(25.*wp.xz)); // Generate some randomness
// Check our distance to the edge of the tile
float pathd=step(.4,sd-0.2*n*(1.-0.90*smoothstep(0.0,0.5,development)));
// Compute whether the grass is green or white based on that distance
vec3 grasscol=vec3(pathd,1.-.2*n,pathd);
// Then mix it into our fragment shader based on height.
// (So only mix it in if we're at the ground.)
col=mix(grasscol,col,smoothstep(0.01,0.05,storey-0.07*n));

// Now, if we have a tall building on this tile, we can assume we have other
// tall buildings nearby and that they're together blocking some light. This
// leads us to adding this shadow effect, which is a simple darkening of the
// fragment color near the ground on tall buildings.
// The second half of the multiplication replicates some of the path code,
// making sure that the shadow doesn't go to the tile edge. (While functional,
// the appearance of that isn't great. Plus this is smoother.)
col*=1.-.1*(development/(1.+2.*mp.y))*smoothstep(-.5,-.4,-sd-.01*n);

// If this is the selected building, mix the selection color in over top.
col=mix(col,selcol.rgb,selected_bldg==tid?.5:0.);

// Return our calculated color and the tile ID.
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
// This shader _just_ outputs the tile ID to the fragment buffer. It's used
// for actually doing the tile picking render.
// I have the tile ID output in both because I was trying to get both buffers
// filled in one pass. Turns out that isn't portable across platforms if I also
// want to keep my depth buffer so that I don't have to somehow sort my
// instances.
void main(){outTid=tid;}`
};

// =======================
// ==== PAGE ELEMENTS ====
// =======================

/**
 * @type {HTMLCanvasElement} The canvas element for the game
 */
const CV = document.querySelector('canvas');
/**
 * @type {HTMLDivElement} The left UI pane element for the game, where tools go
 */
const LPANE = document.getElementById('lpane');
/**
 * @type {HTMLDivElement} The right UI pane element for the game stats
 */
const RPANE = document.getElementById('rpane');
/**
 * @type {HTMLDialogElement} The level select dialog element
 */
const LVLSELWIN = document.getElementById('lvlselectwin');
/**
 * @type {HTMLDivElement} The level select dialog's content element
 */
const LVLSEL = document.getElementById('lvlselect');
/**
 * @type {HTMLButtonElement} The button to open the level select mid-game
 */
const LVLBTN = document.getElementById('lvlselectopen');
/**
 * @type {HTMLDialogElement} The game play button, to force an interact event
 *                           b4 playing music or sound or anything.
 */
const PBTN = document.getElementById('playdialog');
/**
 * @type {HTMLDivElement} The confirm-deny box at the bottom of the screen.
 */
const CD = document.getElementById('cd');
/**
 * @type {HTMLButtonElement} The "confirm action" button
 */
const CBTN = document.getElementById('conf');
/**
 * @type {HTMLButtonElement} The "deny action" button
 */
const DBTN = document.getElementById('deny');
/**
 * @type {HTMLButtonElement} The sound FX mute button
 */
const SND_EL = document.getElementById('snd');
/**
 * @type {HTMLButtonElement} The FPS button
 */
const FPS_EL = document.getElementById('fps');

// ===================
// ==== APP STATE ====
// ===================

/**
 * @type {DOMHighResTimeStamp?} The timestamp of the last frame's time calc
 */
let last_timestamp = null;
/**
 * @type {number} The number of frames rendered so far
 */
let frame_num = 0;
/**
 * @type {number} The number of game ticks processed so far
 */
let tick_num = 0;
/**
 * @type {number?} The last FPS value, used to smooth the FPS display
 */
let last_fps = null;
/**
 * @type {number} The time until the next FPS update in seconds
 */
let time_to_fps_update = FPS_UPDATE_INTERVAL;

/**
 * @type {WebGL2RenderingContext?} The game's WebGL2 rendering context
 */
let gl;
/**
 * @type {number?} The requestAnimationFrame ID for the game's render loop
 */
let rafId;
/**
 * @type {MyWebGLProgram?} The WebGL program for rendering the tile model
 */
let tile_prog;
/**
 * @type {MyWebGLProgram?} The WebGL program for picking tiles
 */
let pick_prog;
/**
 * @type {WebGLBuffer?} The WebGL buffer for the tile model's vertex data
 */
let tile_pos_buf;
/**
 * @type {WebGLBuffer?} The WebGL buffer for the tile model's instance data
 */
let tile_idx_buf;
/**
 * @type {WebGLBuffer?} The WebGL buffer for the tile info buffer (attributes.)
 */
let tile_info_buf;

/**
 * @type {WebGLVertexArrayObject?} The WebGL VAO for the tile model
 */
let tile_vao;

/**
 * @type {WebGLFramebuffer?} The WebGL framebuffer for picking tiles
 */
let fb;

/**
 * @type {WebGLTexture?} The WebGL texture for the tile IDs
 */
let instance_tex;
/**
 * @type {WebGLTexture?} The WebGL depth buffer for the tile picking framebuf.
 */
let instance_depth;

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
/**
 * @type {{
 * fov:number,
 * cam_x:number,
 * cam_y:number,
 * cam_fwd:number,
 * cam_rgt:number,
 * gtime:number,
 * mouseX:number?,
 * mouseY:number?,
 * locksel:boolean,
 * hovered_bldg:number,
 * selected_bldg:number?,
 * bldg_vis:number?,
 * have_built:boolean,
 * drag:null|{x:number,y:number}
 * }} The UI state of the game
 * - fov: The field of view in degrees
 * - cam_x: The camera's X position
 * - cam_y: The camera's Y position
 * - cam_fwd: The accumulated forward movement of the camera this frame
 * - cam_rgt: The accumulated rightward movement of the camera this frame
 * - gtime: The graphics time accumulator
 * - mouseX: The mouse's X position
 * - mouseY: The mouse's Y position
 * - locksel: Whether to lock the selection to the hovered building this frame
 * - hovered_bldg: The ID of the building the mouse is hovering over
 * - selected_bldg: The ID of the building the user has selected, if any
 * - tool_sels: How many times we have changed tools, total (used to count clicks to switch building rotations)
 * - have_built: Whether the user has built anything this frame
 * - drag: The drag state of the mouse
 */
const ui = {
  fov: 75,
  cam_x: 0,
  cam_y: 0,
  cam_fwd: 0,
  cam_rgt: 0,
  gtime: 0,
  mouseX: null,
  mouseY: null,
  locksel: false,
  hovered_bldg: -1,
  selected_bldg: null,
  tool_sels: 0,
  have_built: false,
  drag: null,
};

// City states should change only on sim steps.
/**
 * @typedef {Float32Array} CityInfo
 * The city info buffer is a packed array of floats, where each float is
 * a different piece of information about a tile in the city. The floats are
 * packed in groups of three, where the first float is the height of the tile,
 * the second float is the type of the tile, and the third float is the visual
 * appearance of the tile (size and orientation).
 */
/**
 * @typedef {{buildings:number,stories:number,size:Array<number>,typs:Array<{buildings:number,stories:number,size:Array<number>}>}} CityStats
 * The city stats buffer is a simple JavaScript object with a few properties
 * replaced every frame. The "buildings" property is the number of buildings
 * in the city, counted as covered tiles. The "stories" property is the number
 * of stories in the city, counted as the sum of the heights of all buildings.
 * The "size" property is an array of the count of each scale of building.
 * The "typs" property is an array of objects with the same properties, but
 * broken down by building type.
 */
/**
 * @type {{stats:CityStats, info:CityInfo}}
 */
const city = {
  // info: "height","typ","vis" floats, packed
  stats: { typs: [] },
};

// ===================
// ==== FUNCTIONS ====
// ===================

/**
 * Function to change to a given tool number by updating the UI state.
 * @param {number} i 
 */
const chtool = i => {
  ui.tool_sels += 1; // Increment the tool selection counter
  [...LPANE.children].forEach(c => c.className = ""); // Clear the selected tool
  (document.getElementById(`TOOL${i ?? O}`) ?? {}).className = "s"; // Select the new tool
};

/**
 * Get the current tool number from the UI state.
 * @returns {number}
 */
const gtool = () => {
  const i = LPANE.querySelector(".s")?.id; // Ask for all selected tools
  return i ? parseInt(i.substring(4), 10) : -1; // Return the first selected tool, or -1 if none was found
};

/**
 * Function to check if we're in demo mode
 * @returns {boolean}
 */
const demo = () => {
  return CD.style.display === "none"; // Hide the confirm/deny box to enter demo mode
};

/**
 * Function to set demo mode
 * @param {boolean} on whether to turn demo mode on or off -- true for on
 * @returns {void}
 */
const setdemo = (on) => {
  CD.style.display = on ? "none" : "block"; // Show the confirm/deny box to exit demo mode
  // Because global state is yummy.
};


/**
 * Load a map from a CWTNMap object.
 * @param {CWTNMap} mapdat
 */
const load_map = mapdat => {
  map.sidel = mapdat.sidel; // Take the sidelength of the map
  city.info = new Float32Array(3. * map.sidel * map.sidel).fill(-1); // Create a new city info buffer and fill it with nothing
  if (!mapdat.dat) {
    city.info.fill(0); // If we're given nothing else to put in, just fill the buffer with zeroes (Flat grassy field.)
  } else {
    for (let i = 0; i < map.sidel * map.sidel; i += 1) {
      const hdat = parseInt(mapdat.dat[2 * i], 16); // Compute the height part of this tile
      if (hdat <= MAXHT) { // If the height is within bounds
        city.info[3 * i] = hdat; // Set the height of the tile
        const vdat = parseInt(mapdat.dat[2 * i + 1], 16); // Parse the visual appearance of the tile
        city.info[3 * i + 1] = vdat >> 2; // Set the type of the tile
        city.info[3 * i + 2] = vdat & 3; // Set the visual appearance of the tile
      }
    }
  }
  if (!mapdat.tools) {
    LPANE.replaceChildren(...TOOLS); // If we're given no tools, just put all the tools in the UI
  } else {
    LPANE.replaceChildren(...TOOLS.filter((v, i) => mapdat.tools.includes(i))); // Otherwise, put only the tools we're given in the UI
  }
  chtool(parseInt(LPANE.firstChild.id.substring(4), 10)); // Select the first tool in the UI
  ui.selected_bldg = null; // Deselect any selected building
  ui.hovered_bldg = -1; // Unhover any hovered building
  // Reset the camera position
  ui.cam_x = 1;
  ui.cam_y = 1;
};

/**
 * Load a built-in map from the BMAPS object.
 * @param {string} cat 
 * @param {number} n 
 */
const load_builtin_map = (cat, n) => {
  load_map(BMAPS[cat][n]); // Load the map
  // Update the map we're playing on for UI elements I never got around to implementing
  map.builtin_cat = cat;
  map.builtin_num = n;
};

/**
 * Update the timing information with the new frame's timestamp.
 * @param {DOMHighResTimeStamp} timestamp
 */
const frametime = timestamp => {
  frame_num += 1; // Increment the frame number
  if (last_timestamp === null) last_timestamp = timestamp; // If this is the first frame, set the last timestamp
  const dt = timestamp - last_timestamp > 0 ? (timestamp - last_timestamp) * 0.001 : TARGET_DT; // Calculate the delta time if positive, else assume the target delta time
  if (last_fps === null) last_fps = TARGET_FPS; // If this is the first frame, set the last FPS to our target FPS because we have no other information
  const frames_fps_smoothing = Math.min(FRAMES_FPS_SMOOTHING, frame_num); // Calculate the number of frames to smooth the FPS over (Fast up to FRAMES_FPS_SMOOTHING, then slow)
  const fps = (frames_fps_smoothing * last_fps) / (dt * last_fps + frames_fps_smoothing - 1); // Calculate the smoothed FPS
  time_to_fps_update -= dt; // Subtract the delta time from the time until the next FPS update
  if (time_to_fps_update < 0) { // If it's time to update the FPS display
    time_to_fps_update = FPS_UPDATE_INTERVAL; // Reset the time until the next FPS update
    FPS_EL.textContent = fps.toFixed(1); // Update the FPS display
  }
  last_fps = fps; // Update the last FPS
  last_timestamp = timestamp; // Update the last timestamp
  return dt;
};

/**
 * Checks for WebGL error and alerts user if found.
 */
const ec = () => {
  if (!gl) { return; } // If we don't have a WebGL context, don't bother checking for errors
  const e = gl.getError(); // Get the WebGL error code
  if (e !== gl.NO_ERROR && e !== gl.CONTEXT_LOST_WEBGL) { // If the error isn't "no error" or "context lost"
    alert(`Gl ${e.toString(16)}`); // Alert the user with the error code
  }
};

/**
 * Returns True if the WebGL context has been lost.
 * @returns {boolean}
 */
const cl = () => !gl || gl.isContextLost();

/**
 * Checks whether any of the given keys are down according to the keys set.
 * @param  {...string} args 
 * @returns {boolean}
 */
const kd = (...args) => {
  for (const a of args)
    if (keys.has(a)) // This is just checking if each key is in the set
      return true;
  return false;
};

/**
 * Plays a sound effect using the zzfx library.
 * @param {Array<number|undfeined>} args The zzfx sound effect arguments
 * @param {number} vmul A volume multiplier for the sound effect
 */
const s = (args, vmul) => {
  if (!SND_EL.checked) return; // If sound effects are disabled, don't play the sound effect
  args = [...args]; // Copy the arguments
  if (vmul) args[0] *= vmul; // Multiply the volume by the volume multiplier, if any
  args[0] *= (.5 + .5 * (!demo())); // Make the sounds quieter in demo mode, as they're not user-initiated
  zzfx(...args); // Play the sound effect
};

/**
 * Compiles a WebGL shader from its source code and alerts the user on fail.
 * @param {number} typ
 * @param {string} src
 */
const glShaderFromSrc = (typ, src) => {
  const s = gl.createShader(typ); // Create the shader object in WebGL-land
  gl.shaderSource(s, src); // Send the source code over to it
  gl.compileShader(s); // Ask WebGL nicely to compile the shader
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !cl()) // Check if WebGL died or the shader failed to compile
    alert("compiling shader:\n" + gl.getShaderInfoLog(s)); // Alert on failure
  return s;
};

/**
 * Compiles a WebGL program from its vertex and fragment shader source code.
 * Alerts the user on failure to link.
 * @param {string} vs - Vertex Shader source
 * @param {string} fs - Fragment Shader source
 * @returns {MyWebGLProgram}
 */
const glProgFromSrc = (vs, fs, uniform_names) => {
  const p = gl.createProgram(); // Create the program object in WebGL-land
  // Attach the shaders to that program
  gl.attachShader(p, glShaderFromSrc(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glShaderFromSrc(gl.FRAGMENT_SHADER, fs));
  // Link the program together and to any GPU-side stuff it needs
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !cl()) // Check if WebGL died or the program failed to link
    alert("linking prog:\n" + gl.getProgramInfoLog(p));

  // Cycle through the uniform names and get their locations
  const unifs = {};
  for (const u of uniform_names) {
    unifs[u] = gl.getUniformLocation(p, u);
    // If the uniform wasn't found, leave an error but don't crash yet.
    if (unifs[u] === -1) console.error(a, "not found");
  }
  return { p, unifs };
};

/**
 * Resizes the canvas to fit the display, and resizes the instance picker
 * texture if a change was actually necessary.
 * 
 * You'd think this would be extremely expensive, but as long as we aren't
 * redoing that texture it's fine. We only redo the texture when there's an
 * actual change, so it all works out.
 * @param {bool?} force_resize
 */
const resize_canvas_to_display = (force_resize) => {
  // CSS width and height of the canvas
  const w = gl.canvas.clientWidth;
  const h = gl.canvas.clientHeight;
  // Compare against the WebGL width and height of the canvas
  const need_resize = force_resize || w !== gl.canvas.width || h !== gl.canvas.height;
  if (need_resize) {
    // Update if necessary
    gl.canvas.width = w;
    gl.canvas.height = h;
  }
  // Tell OpenGL what pixels of the canvas we're rendering into
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  // If we need to resize the instance texture, do so
  if (need_resize) {
    gl.bindTexture(gl.TEXTURE_2D, instance_tex); // Tell WebGL we're talking about this texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, w, h, 0, gl.RED_INTEGER, gl.INT, null); // Define this texture as a 32-bit integer texture with no data and the new size
    gl.bindRenderbuffer(gl.RENDERBUFFER, instance_depth); // Tell WebGL we're talking about this depth buffer
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h); // Tell the depth buffer to store 16-bit depth data and the new size
  }
};

/**
 * Gets and sets up a WebGL2 rendering context
 *
 * @returns {void}
 */
const init_gl = () => {
  gl = CV.getContext('webgl2'); // Ask the browser for a WebGL2 context
  gl.cullFace(gl.BACK); // Tell it we don't care about the "back" side of triangles
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // Tell it to unpack data with no padding
  const u = ["woff", "w2v", "v2c", "sidel", "selected_bldg", "selcol"]; // Define our list of uniform names
  tile_prog = glProgFromSrc(TILE.VS, TILE.FS, u); // Compile the tile renderer
  pick_prog = glProgFromSrc(TILE.VS, TILE.pickFS, u); // Compile the tile picker
  gl.clearColor(.1, .1, .1, 1); // Tell WebGL to clear the screen to a dark gray
  gl.enable(gl.DEPTH_TEST); // Tell WebGL we want to use "Painter's Algorithm" to draw things in the "right order"
  tile_vao = gl.createVertexArray(); // Create a Vertex Array Object in WebGL-land to hold the tile model
  gl.bindVertexArray(tile_vao); // Tell WebGL we're talking about this VAO
  tile_pos_buf = gl.createBuffer(); // Create a buffer in WebGL-land to hold the tile model's vertex data
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_pos_buf); // Tell WebGL we're talking about this buffer
  gl.bufferData(gl.ARRAY_BUFFER, TILE.VX, gl.STATIC_DRAW); // Send the vertex data to the GPU and tell WebGL we're not going to change it mid-draw
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); // Tell WebGL how to interpret the vertex data (3 floating point numbers)
  gl.enableVertexAttribArray(0); // Tell WebGL to use the vertex data from this part of the VAO
  tile_info_buf = gl.createBuffer(); // Create a buffer in WebGL-land to hold the tile model's instance data (the tile info)
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_info_buf); // Tell WebGL we're talking about this buffer
  gl.bufferData(gl.ARRAY_BUFFER, city.info, gl.STATIC_DRAW); // Send the instance data to the GPU and tell WebGL we're not going to change it mid-draw
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0); // Tell WebGL how to interpret the instance data (3 floating point numbers)
  gl.vertexAttribDivisor(1, 1); // Tell WebGL to advance the instance data every instance
  gl.enableVertexAttribArray(1); // Tell WebGL to use the instance data from this part of the VAO

  tile_idx_buf = gl.createBuffer(); // Create a buffer in WebGL-land to hold the tile model's index data
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tile_idx_buf); // Tell WebGL we're talking about this buffer to be our index buffer
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, TILE.IDX, gl.STATIC_DRAW); // Send the index data to the GPU and tell WebGL we're not going to change it mid-draw

  gl.bindTexture(gl.TEXTURE_2D, instance_tex = gl.createTexture()); // Create a texture in WebGL-land to hold the instance picker data
  gl.bindRenderbuffer(gl.RENDERBUFFER, instance_depth = gl.createRenderbuffer()); // Create a depth buffer in WebGL-land to hold the instance picker depth data
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb = gl.createFramebuffer()); // Create a framebuffer in WebGL-land to hold the instance picker data
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, instance_tex, 0); // Attach the texture to the framebuffer
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, instance_depth); // Attach the depth buffer to the framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Tell WebGL we're not talking about the framebuffer anymore, so it goes back to the default (canvas) framebuffer
};

/**
 * Sets up the uniforms for a given program on a given frame by pulling from
 * all my yummy yummy global state variables.
 * @param {MyWebGLProgram} p The program to set the uniforms for
 */
const set_unifs = (p) => {
  gl.useProgram(p.p); // Tell WebGL we're talking about this program
  gl.uniform1i(p.unifs.sidel, map.sidel); // Send the sidelength of the map to the GPU
  const selid = ui.selected_bldg !== null ? ui.selected_bldg : (demo() ? -1 : ui.hovered_bldg);
  gl.uniform1i(p.unifs.selected_bldg, selid); // Send the selected building ID to the GPU
  let selvis = city.info[3 * selid + 2];
  if (gtool() == 3) selvis = 2 - ui.tool_sels % 2;
  if (gtool() == 6) selvis = 2 - ui.tool_sels % 2;
  if (gtool() == 4) selvis = 3;
  if (gtool() == 7) selvis = 3;
  gl.uniform4fv(p.unifs.selcol, [[.5, .5, .5, selvis], [1, 0, 0, selvis], [0, 1, gtool() == 0, selvis]][(gtool() >= 0) + can()]); // Send the selection color to the GPU
  gl.uniform2f(p.unifs.woff, ui.cam_x, ui.cam_y); // Send the camera offset to the GPU
  const s = Math.SQRT1_2; // Load the square root of 1/2 into a variable to use over and over again
  // Load my manually-calculated world-to-view and view-to-clip matrices into the GPU
  gl.uniformMatrix4fv(p.unifs.w2v, true, [
    s, 0, -s, 0, //x
    -.5, s, -.5, 0, // y
    .5, s, .5, -4.6,//z
    0, 0, 0, 1,//w
  ]);
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight; // Calculate the aspect ratio of the canvas
  const f = Math.tan(Math.PI * .5 * (1 - ui.fov / 180)); // Calculate the field of view factor
  const range_recip = 1.0 / (NEAR - FAR); // Calculate the reciprocal of the range between the near and far planes
  // Load a classical perspective projection matrix into the GPU
  gl.uniformMatrix4fv(p.unifs.v2c, true, [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (NEAR + FAR) * range_recip, -1,
    0, 0, NEAR * FAR * range_recip * 2, 0,
  ]);
};

/**
 * The draw callback for the game's render loop. This function is called every
 * requestAnimationFrame tick and is responsible for rendering the game's
 * graphics.
 * @param {DOMHighResTimeStamp} t 
 */
const draw = (t) => {
  ui.gtime = Math.min(.1, ui.gtime + frametime(t)); // Accumulate graphics time
  resize_canvas_to_display(); // Resize the canvas if necessary
  gl.bindVertexArray(tile_vao); // Tell WebGL we're talking about the tile VAO
  gl.bindBuffer(gl.ARRAY_BUFFER, tile_info_buf); // Tell WebGL we're talking about the tile info buffer
  gl.bufferData(gl.ARRAY_BUFFER, city.info, gl.STATIC_DRAW); // Send the tile info to the GPU

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); // Tell WebGL we're talking about the instance picker framebuffer
  gl.clearBufferiv(gl.COLOR, 0, new Int32Array([-1, -1, -1, -1])); // Clear the instance picker color buffer to all -1 values, which are invalid tile IDs
  gl.clear(gl.DEPTH_BUFFER_BIT); // Clear the instance picker depth buffer
  if (ui.mouseX && ui.mouseY) { // If the mouse is on the canvas
    set_unifs(pick_prog); // Set the uniforms for the picker program
    // Then we use this instanced rendering method to draw all the tiles into the city in one go
    // Because we're running the picker program, the tile IDs are being written to the instance picker framebuffer
    gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, map.sidel * map.sidel);

    // Set up a buffer to hold the tile ID we're going to read back from the instance picker framebuffer
    const d = new Int32Array([-1, -1, -1, -1]);
    // Read the tile ID back from the instance picker framebuffer at the mouse's position
    // This is a blocking operation, so it's not great for performance, but it's fine for this
    // incredibly simple game because I say it is.
    gl.readPixels(
      ui.mouseX, ui.mouseY, 1, 1, gl.RGBA_INTEGER, gl.INT, d
    );
    // Set the hovered building to the tile ID we read back
    ui.hovered_bldg = d[0];
  }
  if (!demo() && ui.locksel) { // If we're locking the selection to the hovered building
    ui.locksel = false; // Update that we've done this now
    ui.selected_bldg = ui.hovered_bldg >= 0 ? ui.hovered_bldg : null; // Set the selected building to the hovered building if it's valid
    if (ui.selected_bldg != null) s(MO_SND); // Play the mouseover sound if we've selected a valid building
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Tell WebGL we're not talking about the framebuffer anymore, so it goes back to the default (canvas) framebuffer
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Clear the screen to the dark gray color
  set_unifs(tile_prog); // Set the uniforms for the tile program
  gl.drawElementsInstanced(gl.TRIANGLES, TILE.NTRI * 3, gl.UNSIGNED_BYTE, 0, map.sidel * map.sidel); // Draw all the tiles into the city in one go
  gl.flush(); // Tell WebGL to actually draw the things we've told it to draw (that we're done with WebGL calls for this frame)
  rafId = requestAnimationFrame(draw); // Request the next frame to be drawn
  // Because I do so much CPU work in terms of updating the map, I chose to
  // make absolutely certain that I'm not overloading the browser rendering
  // by moving the game processing out to processing immediately after we're
  // done rendering the frame. This means UI elements (when I get to 'em) like
  // stats may lag a frame, but that's acceptable to me to keep that buttery
  // smooth 60 FPS.
  setTimeout(system_loop); // Run the system loop in the next available microtask
};

/**
 * Visual tile count -- counts how many tiles this visual representation covers
 * @param {number} vis visual data of the tile
 * @returns {number} number of tiles occupied
 */
const vtc = (v) => Math.ceil(v * v / 4 + 1);

/**
 * Recalculates the city stats from the city info buffer.
 */
const recalc_city_stats = () => {
  const t = {
    buildings: 0,
    stories: 0,
    size: [0, 0, null, 0], // Never used the count of each building size, ah well.
  };
  const typs = [
    undefined, // The "0th" type is an empty tile.
    //I'm not forcing players to have specific numbers of empty space.
    Object.assign({}, t),
    Object.assign({}, t),
  ];
  for (let i = 0; i < map.sidel * map.sidel; i += 1) {
    const height = Math.ceil(city.info[3 * i]); // We're going to every packed group of 3 and pulling out its first entry -- that's the height. We use Math.ceil to make sure we're counting the whole tile even if it's mid-construction.
    const typ = city.info[3 * i + 1]; // We're going to every packed group of 3 and pulling out its middle entry -- that's the type.
    const tiles = vtc(city.info[3 * i + 2]); // We're going to every packed group of 3 and pulling out its last entry -- that's the visual data -- then we're going to convert that to a tile count.
    t.buildings += (typ > 0) * tiles; // If the type is greater than 0, there's a building here, so add the tiles to the building count.
    t.stories += Math.max(0, height) * tiles; // Add the height times the tiles to the stories count.
    t.size[tiles] += typ > 0; // If the type is greater than 0, add 1 to the size count for that size.
    if (typ > 0) {
      let s = typs[typ]; // Get the type stats object for this type
      s.buildings += (typ > 0) * tiles; // See above for these.
      s.stories += Math.max(0, height) * tiles;
      s.size[tiles] += typ > 0;
    }
  }
  // Now assign this data back to the city object
  t.typs = typs;

  /**
   * Generates a table row element with a header and a value.
   * @param {string} h Header for the row
   * @param {number} v Value for the row
   * @returns 
   */
  const tr = (h, v) => {
    const r = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = h;
    const td = document.createElement('td');
    td.textContent = v;
    r.append(th, td);
    return r;
  };
  RPANE.replaceChildren(
    tr('🏗️:', t.stories),
    tr('◼:', t.buildings),
    tr('🏗️🏠:', t.typs[1].stories),
    tr('◼🏠:', t.typs[1].buildings),
    tr('🏗️🛒:', t.typs[2].stories),
    tr('◼🛒:', t.typs[2].buildings),
  );
  city.stats = t;
};

/**
 * Answers whether we're allowed to have a calculation result show up in
 * the city stats. Remember, we can't have THAT NUMBER in the stats.
 * @param {number} n
 * @returns {boolean}
 */
const can_see = (n) => n != 0 && n % N != 0;


/**
 * Answers whether we're allowed to place a new story on a given tile.
 * @param {number} i Index of the tile
 * @param {number?} typ Type of building
 * @param {number?} vis Visual data of the tile
 * @returns {boolean}
 */
const can_place_story = (i, typ, vis) => {
  // Unpack the tile data
  let height = city.info[3 * i];
  typ = typ || city.info[3 * i + 1]; // Use the passed type or the tile's type if none is passed
  vis = vis || city.info[3 * i + 2]; // Use the passed visual data or the tile's visual data if none is passed
  let building = height != Math.ceil(height); // Check if we're already under construction here
  return (
    height < MAXHT // Check if we're not already at the max height
    && !building // Check if we're not already under construction
    && can_see(city.stats.stories + vtc(vis)) // Check if we're not going to hit THAT NUMBER in the stories count
    && can_see(city.stats.typs[typ]?.stories + vtc(vis)) // Check if we're not going to hit THAT NUMBER in the type's stories count
    && (!(vis & 1) || city.info[3 * i + 4] === 0) // If we're a double in X, check if the next tile over is empty
    && (!(vis & 2) || city.info[3 * (i + map.sidel) + 1] === 0) // If we're a double in Y, check if the next tile down is empty
    && (!(vis == 3) || city.info[3 * (i + map.sidel) + 4] === 0) // If we're a quad, check if the next tile down and over is empty
    && city.info[3 * i + 2] >= 0 // Check that our visual information isn't erased
  );
};

/**
 * Answers whether we're allowed to place a new building on a given tile.
 * @param {number} i Index of the tile
 * @param {number} typ Type of building
 * @param {number} vis Visual data of the tile
 * @returns {boolean}
 */
const can_place = (i, typ, vis) => {
  const t = city.stats.typs[typ];
  return (
    can_place_story(i, typ, vis) // Check if we can place a story here (see above checks)
    && can_see(city.stats.buildings + vtc(vis)) // Check if we're not going to hit THAT NUMBER in the buildings count
    && can_see(city.stats.size[vtc(vis)] + 1) // Check if we're not going to hit THAT NUMBER in the size count
    && can_see(t.buildings + vtc(vis)) // Check if we're not going to hit THAT NUMBER in the type's buildings count
    && can_see(t.size[vtc(vis)] + 1) // Check if we're not going to hit THAT NUMBER in the type's size count
    && (!(vis & 1) || (i + 1) % map.sidel > 0) // If we're a double in X, check if the next tile over is in bounds
    && (!(vis & 1) || city.info[3 * i + 5] === 0) // If we're a double in X, check if the next tile over is empty
    && (!(vis & 2) || city.info[3 * (i + map.sidel) + 2] === 0) // If we're a double in Y, check if the next tile down is empty
    && (!(vis == 3) || city.info[3 * (i + map.sidel) + 5] === 0) // If we're a quad, check if the next tile down and over is empty
  );
};

/**
 * Answers whether we're allowed to delete a building on a given tile.
 * @param {number} i Index of the tile
 * @returns {boolean}
 */
const can_delete = (i) => {
  // Unpack the tile data
  const height = Math.ceil(city.info[3 * i]);
  const typ = city.info[3 * i + 1];
  const vis = city.info[3 * i + 2];
  return (
    height > 0 // Check if there's a building here
    && can_see(city.stats.stories - vtc(vis) * height) // Check if we're not going to hit THAT NUMBER in the stories count after removing this building
    && can_see(city.stats.buildings - vtc(vis)) // Check if we're not going to hit THAT NUMBER in the buildings count after removing this building
    && can_see(city.stats.typs[typ]?.stories - vtc(vis) * height) // Check if we're not going to hit THAT NUMBER in the type's stories count after removing this building
    && can_see(city.stats.typs[typ]?.buildings - vtc(vis)) // Check if we're not going to hit THAT NUMBER in the type's buildings count after removing this building
    && can_see(city.stats.typs[typ]?.size[vtc(vis)] - 1) // Check if we're not going to hit THAT NUMBER in the type's size count after removing this building
  );
};

/**
 * Checks if the current tool can be used on the hovered or selected building.
 * @returns {boolean}
 */
const can = () => {
  let t, i = ui.selected_bldg ?? ui.hovered_bldg;
  if ((t = gtool()) < 0) return false;
  return (
    (t == 0 && can_delete(i)) // Can we delete here?
    || (t == 1 && city.info[3 * i] > 0 && can_place_story(i)) // If there's a building, can we add a story?
    || (t == 2 && city.info[3 * i] <= 0 && can_place(i, 1, 0)) // Can we add a single residential here?
    || (t == 3 && city.info[3 * i] <= 0 && can_place(i, 1, 2 - ui.tool_sels % 2)) // Can we add a double residential here?
    || (t == 4 && city.info[3 * i] <= 0 && can_place(i, 1, 3)) // Can we add a quad residential here?
    || (t == 5 && city.info[3 * i] <= 0 && can_place(i, 2, 0)) // Can we add a single commercial here?
    || (t == 6 && city.info[3 * i] <= 0 && can_place(i, 2, 2 - ui.tool_sels % 2)) // Can we add a double commercial here?
    || (t == 7 && city.info[3 * i] <= 0 && can_place(i, 2, 3)) // Can we add a quad commercial here?
  );
};

/**
 * Places a new building or story on a given tile.
 * @param {number} i The index of the tile
 * @param {number} typ The type of building
 * @param {number} vis The visual data of the tile
 */
const place = (i, typ, vis) => {
  if (vis & 1) city.info[3 * i + 5] = -1; // If we're a double in X, mark the next tile over as unbuildable
  if (vis & 2) city.info[3 * (i + map.sidel) + 2] = -1; // If we're a double in Y, mark the next tile down as unbuildable
  if (vis == 3) city.info[3 * (i + map.sidel) + 5] = -1; // If we're a quad, mark the next tile down and over as unbuildable
  city.info[3 * i + 2] = vis; // Set the visual data
  city.info[3 * i + 1] = typ; // Set the type
  city.info[3 * i] += .05; // Start construction
  s([BUILD_SND, COMMERICAL_DOOR][typ - 1]); // Play the build sound
};

/**
 * Places a new story on a given tile.
 * @param {number} i The index of the tile
 */
const place_story = (i) => {
  city.info[3 * i] += .05; // Add a story
  s(BUILD_SND); // Play the story sound -- for now just the build sound
};

/**
 * Erases a building from a given tile.
 * @param {number} i The index of the tile
 */
const do_delete = (i) => {
  const vis = city.info[3 * i + 2]; // Get the visual data
  city.info[3 * i] = 0; // Set the height to 0
  city.info[3 * i + 1] = 0; // Set the type to 0
  city.info[3 * i + 2] = 0; // Set the visual data to 0
  if (vis & 1) city.info[3 * i + 5] = 0; // If we're a double in X, mark the next tile over as buildable
  if (vis & 2) city.info[3 * (i + map.sidel) + 2] = 0; // If we're a double in Y, mark the next tile down as buildable
  if (vis == 3) city.info[3 * (i + map.sidel) + 5] = 0; // If we're a quad, mark the next tile down and over as buildable
  s(BULLDOZE_SND); // Play the bulldoze sound
};

/**
 * Confirm the current action, if we can do it.
 */
const conf = () => {
  if (!can()) return; // If we can't do the action, don't do it
  if (ui.selected_bldg == null || ui.selected_bldg < 0) return; // If we don't have a selected building, don't do it
  ui.have_built = true; // We can do something and we're doing it
  const t = gtool(); // Get the current tool
  if (t == 0) do_delete(ui.selected_bldg); // If we're deleting, delete
  if (t == 1) city.info[3 * ui.selected_bldg] += .05; // If we're adding a story, add a story
  if (t == 2) place(ui.selected_bldg, 1, 0); // If we're adding a single residential, add a single residential
  if (t == 3) place(ui.selected_bldg, 1, 2 - ui.tool_sels % 2); // If we're adding a double residential, add a double residential
  if (t == 4) place(ui.selected_bldg, 1, 3); // If we're adding a quad residential, add a quad residential
  if (t == 5) place(ui.selected_bldg, 2, 0); // If we're adding a single commercial, add a single commercial
  if (t == 6) place(ui.selected_bldg, 2, 2 - ui.tool_sels % 2); // If we're adding a double commercial, add a double commercial
  if (t == 7) place(ui.selected_bldg, 2, 3); // If we're adding a quad commercial, add a quad commercial
};


/**
 * Process time in the player's city.
 * @param {float} dt The time delta to process
 */
const game_frame = (dt) => {
  recalc_city_stats(); // Recalculate the city stats
  tick_num += 1;
  const maxidx = map.sidel * map.sidel; // Calculate the maximum index

  // If we're not in demo mode, reset "have built" to let the user take another
  // action. If we are in demo mode, we'll keep it set to true to stop the user
  // doing anything apart from ending demo mode, if they're allowed to.
  if (ui.have_built = demo()) {
    ui.have_built = false; // Reset it to let the demo build
    const demo_scale = (1 + 5 * kd('shift'));
    if (tick_num % (30 / demo_scale) == 0) { // Every 30th tick, or 5th if holding shift

      for (let attempts = 0; attempts < 10 && !ui.have_built; attempts += 1) {
        // Select a random tile
        const i = Math.floor(Math.random() * maxidx);
        // If the tile is unselectable, continue
        if (city.info[3 * i + 2] < 0) continue;
        // If the tile is selectable, select it
        ui.selected_bldg = i;
        // Try to use our current tool on it
        conf();
      }

      if (tick_num % (120 / demo_scale) == 0 || !ui.have_built) {
        // Every 120 ticks (20 shifted) or if we haven't built
        // choose a new random tool
        chtool(Math.floor(Math.random() * TOOLS.length));
      }
      ui.selected_bldg = null; // Deselect all
      ui.have_built = true; // Make sure the user can't mess anything up
    }
  }

  for (let i = 0; i < maxidx; i += 1) { // Iterate over all tiles
    // Continue any ongoing construction up to the next storey threshold, then stop.
    city.info[3 * i] = Math.min(Math.ceil(city.info[3 * i]), city.info[3 * i] + dt * 2.);
  }
};

/**
 * Process time in the UI (and game beneath)
 * @param {float} dt The time delta to process
 */
const system_frame = (dt) => {
  // Calculate the speed of the camera
  let s = 2. * dt;
  if (kd('shift')) {
    s *= 3;
  }
  // Move the camera based on the keys
  if (kd('w', 'arrowup')) ui.cam_fwd += s;
  if (kd('a', 'arrowleft')) ui.cam_rgt -= s;
  if (kd('s', 'arrowdown')) ui.cam_fwd -= s;
  if (kd('d', 'arrowright')) ui.cam_rgt += s;
  if (kd('e') && !demo()) conf(); // Confirm the current action
  // Update the camera position based on accumulated movement
  ui.cam_x = Math.max(Math.min(ui.cam_x + ui.cam_fwd - ui.cam_rgt, map.sidel), 0.);
  ui.cam_y = Math.max(Math.min(ui.cam_y + ui.cam_fwd + ui.cam_rgt, map.sidel), 0.);
  ui.cam_fwd = ui.cam_rgt = 0; // Reset the camera movement accumulators
  game_frame(dt); // Update the city
};

/**
 * Keydown event callback
 */
const keydown = () => {
  // Change-tool controls
  if (kd(';') && !LVLSELWIN.open) setdemo(!demo()); // Toggle demo mode
  if (kd('`')) chtool(0);
  if (kd('0')) chtool(0);
  if (kd('1')) chtool(1);
  if (kd('2')) chtool(2);
  if (kd('3')) chtool(3);
  if (kd('4')) chtool(4);
  if (kd('5')) chtool(5);
  if (kd('6')) chtool(6);
  if (kd('7')) chtool(7);
  if (kd('8')) chtool(8);
  if (kd('9')) chtool(9);
  if (kd('p') && map.sidel) {
    // Pause/resume the render loop (supposed to bring up a pause menu, but...)
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else {
      rafId = requestAnimationFrame(draw);
    }
  }
  if (kd('escape')) {
    // Open/close the level select window
    if (LVLSELWIN.open) {
      LVLSELWIN.close();
    } else {
      fill_levelselect();
      LVLSELWIN.show();
    }
  }
};

/**
 * The system loop processes the game and UI logic in a way that doesn't
 * interfere with the rendering loop. This is to ensure that the simulation
 * dynamics are consistent regardless of the rendering speed.
 */
const system_loop = () => {
  while (ui.gtime > 0) { // While we have graphics time to process
    system_frame(SYS_DT); // Process system time in SYS_DT chunks
    ui.gtime -= SYS_DT; // Subtract the time we've processed
  }
};

/**
 * Fills the level select element with the levels in the game.
 */
const fill_levelselect = () => {
  // At the top level, drop the game's header
  // From the BMAPS object
  const sections = Object.entries(BMAPS).map(([k, v]) => {
    // We want to present a nice UI, so we use buttons in sections with
    // headings for each level category.
    const sec = document.createElement('section'); // Create a new section element
    const h = document.createElement('h2'); // Create a new heading element
    h.appendChild(document.createTextNode(k)); // Set the text of the heading to the category name
    // Generate a button for each level in the category
    const btns = v.map((l, i) => {
      const b = document.createElement('button'); // Create a new button element
      b.appendChild(document.createTextNode(l.name)); // Set the text of the button to the level name
      ael(b, 'click', e => {
        load_builtin_map(k, i); // Load the level
        setdemo(false); // Take the game out of demo mode
        LVLSELWIN.close();
      }); // When the button is clicked, load the level
      return b; // Return the button
    });
    sec.replaceChildren(h, ...btns); // Fill the section with the heading and buttons
    return sec;
  });
  LVLSEL.replaceChildren(...sections); // Fill the level select window with the sections
};

// ============================
// ==== EVENT REGISTRATION ====
// ============================

/**
 * Handles pointer movement events.
 * @param {PointerEvent} e 
 */
const mmovpos = e => {
  e.preventDefault(); // Prevent the default action if we can
  if (!gl) return; // If we don't have a WebGL context, or we're in demo mode, don't do anything
  const r = CV.getBoundingClientRect(); // Get the bounding rectangle of the canvas
  const newx = (e.clientX - r.left) * gl.canvas.width / r.width; // Calculate the new X position of the mouse as pixels on the canvas
  const newy = gl.canvas.height * (1 - (e.clientY - r.top) / r.height) - 1; // Calculate the new Y position of the mouse as pixels on the canvas
  if (ui.drag == e.pointerId && ui.mouseX) { // If we're dragging and we have a previous mouse position
    ui.cam_rgt -= .005 * (newx - ui.mouseX); // Move the camera right based on the change in X
    ui.cam_fwd -= .005 * (newy - ui.mouseY); // Move the camera forward based on the change in Y
  }
  ui.mouseX = newx; // Update the mouse X position
  ui.mouseY = newy; // Update the mouse Y position
};

/**
 * Adds an event listener (in a shorter form)
 * @param {HTMLElement} e 
 * @param {string} t 
 * @param {EventListener} f 
 */
const ael = (e, t, f) => e.addEventListener(t, f);

// If the user moves the mouse, update the mouse position
ael(CV, "pointerdown", e => {
  ui.locksel = true; // We've just clicked, so lock the selection
  ui.drag = e.pointerId; // Set the drag to the pointer ID
  mmovpos(e); // Update the mouse position
});
ael(CV, "pointermove", mmovpos); // If the user moves the mouse, update the mouse position
ael(CV, "pointerup", e => {
  if (ui.drag == e.pointerId) { // Clear the drag on release to prevent jumping when a finger is set down elsewhere
    ui.drag = ui.mouseX = ui.mouseY = null;
  }
});

// If the player pushes the confirm button, try doing the thing
ael(CBTN, 'click', conf);

// If the player pushes the deny button, unlock the selection
ael(DBTN, 'click', e => { ui.selected_bldg = null; chtool(-1); });

// If we lose the context, warn and stop the render loop
ael(window, 'webglcontextlost', e => {
  console.warn('WebGL context lost', e);
  cancelAnimationFrame(requestAnimationFrameId);
});

// If the user presses a key, add it to the keys set and call the keydown function
ael(document, 'keydown', e => {
  const k = e.key.toLowerCase();
  if (!USED_KEYS.has(k)) return;
  keys.add(k);
  keydown();
});
// If the user releases a key, remove it from the keys set
ael(document, 'keyup', e => {
  keys.delete(e.key.toLowerCase());
});

// For certain elements, add mouseover and mousedown sounds
ael(SND_EL, "change", e => s(SELECT_SND)); // Mute/unmute sound
ael(SND_EL, 'mouseenter', e => s(MO_SND)); // Mute/unmute mouseover sound
for (let b of [CBTN, DBTN, PBTN, ...TOOLS]) {
  ael(b, 'mouseenter', e => { if (!e.target.disabled) s(MO_SND); }); // Play the mouseover sound when the mouse enters a button
  ael(b, 'mousedown', e => { if (!e.target.disabled) s(SELECT_SND); }); // Play the mousedown sound when the mouse clicks a button
}
ael(LVLBTN, 'click', e => {
  // Open/close the level select window
  if (LVLSELWIN.open) {
    LVLSELWIN.close();
  } else {
    fill_levelselect();
    LVLSELWIN.show();
  }
});

// =================
// ==== RUNTIME ====
// =================

// When the user clicks the play button
ael(PBTN, 'click', e => {
  load_builtin_map('canvas', 2); // Load an example level
  setdemo(true); // Place the game in demo mode (like old games.)
  LVLBTN.click(); // Click the level select button to show the level select window
  LVLBTN.style.display = 'block'; // Also show the level select button so users may now use it.
  init_gl(); // Get the WebGL context
  rafId = requestAnimationFrame(draw); // Start the render loop
});
