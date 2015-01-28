//
//   Copyright 2014 Takahito Tejima (tejimaya@gmail.com)
//

var button = false;
var prev_position = [0, 0];
var prev_pinch = 0;

var time = 0;
var model = {};
var deform = false;
var drawHull = false;
var usePtexColor = false;
var usePtexDisplace = false;
var dpr = 1;
var displaceScale = 0;

var prevTime = 0;
var fps = 0;
var ext = null;

var uvtex = null;

var tessProgram = null;
var gregoryProgram = null;
var cageProgram = null;

var interval = null;

var displayMode = 2;

var tessFactor = 4;
var floatFilter = 0;
var drawTris = 0;

var patchColors = [[[1.0,  1.0,  1.0,  1.0],   // regular
                    [1.0,  0.5,  0.5,  1.0],   // single crease
                    [0.8,  0.0,  0.0,  1.0],   // boundary
                    [0.0,  1.0,  0.0,  1.0],   // corner
                    [1.0,  1.0,  0.0,  1.0],   // gregory
                    [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                    [1.0,  1.0,  0.0,  1.0]],  // gregory basis

                   [[0.0,  1.0,  1.0,  1.0],   // regular pattern 0
                    [0.0,  0.5,  1.0,  1.0],   // regular pattern 1
                    [0.0,  0.5,  0.5,  1.0],   // regular pattern 2
                    [0.5,  0.0,  1.0,  1.0],   // regular pattern 3
                    [1.0,  0.5,  1.0,  1.0]],  // regular pattern 4

                   [[1.0,  0.7,  0.6,  1.0],   // single crease pattern 0
                    [1.0,  0.7,  0.6,  1.0],   // single crease pattern 1
                    [1.0,  0.7,  0.6,  1.0],   // single crease pattern 2
                    [1.0,  0.7,  0.6,  1.0],   // single crease pattern 3
                    [1.0,  0.7,  0.6,  1.0]],  // single crease pattern 4

                   [[0.0,  0.0,  0.75, 1.0],   // boundary pattern 0
                    [0.0,  0.2,  0.75, 1.0],   // boundary pattern 1
                    [0.0,  0.4,  0.75, 1.0],   // boundary pattern 2
                    [0.0,  0.6,  0.75, 1.0],   // boundary pattern 3
                    [0.0,  0.8,  0.75, 1.0]],  // boundary pattern 4

                   [[0.25, 0.25, 0.25, 1.0],   // corner pattern 0
                    [0.25, 0.25, 0.25, 1.0],   // corner pattern 1
                    [0.25, 0.25, 0.25, 1.0],   // corner pattern 2
                    [0.25, 0.25, 0.25, 1.0],   // corner pattern 3
                    [0.25, 0.25, 0.25, 1.0]]]; // corner pattern 4


function windowEvent()
{
    if (window.event)
        return window.event;
    var caller = arguments.callee.caller;
    while (caller) {
        var ob = caller.arguments[0];
        if (ob && ob.constructor == MouseEvent)
            return ob;
        caller = caller.caller;
    }
    return null;
}

function getMousePosition()
{
    var event = windowEvent();
    var canvas = $("#main").get(0);
    canvasOffsetX = canvas.offsetLeft;
    canvasOffsetY = canvas.offsetTop;
    var x = event.pageX - canvasOffsetX;
    var y = event.pageY - canvasOffsetY;
    return [x, y];
}

function buildProgram(vertexShader, fragmentShader)
{
    var define = "";
    if (usePtexColor) define += "#define PTEX_COLOR\n";
    if (usePtexDisplace) define += "#define PTEX_DISPLACE\n";
    define += "#define DISPLAY_MODE " + displayMode +"\n";
    if (displaceScale > 0) define += "#define DISPLACEMENT 1\n";

    var util = $('#shaderutil').text();
    var program = gl.createProgram();
    var vshader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vshader, define+util+$(vertexShader).text());
    gl.compileShader(vshader);
    if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS))
        alert(gl.getShaderInfoLog(vshader));
    var fshader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fshader, define+util+$(fragmentShader).text());
    gl.compileShader(fshader);
    if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS))
        alert(gl.getShaderInfoLog(fshader));
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);

    if (vertexShader == "#cageVS") {
        gl.bindAttribLocation(program, 0, "position");
    } else {
        gl.bindAttribLocation(program, 0, "inUV");
        gl.bindAttribLocation(program, 1, "patchData");
        gl.bindAttribLocation(program, 2, "tessLevel");
        gl.bindAttribLocation(program, 3, "inColor");
    }

    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        alert(gl.getProgramInfoLog(program));
    return program;
}

function getPOT(n)
{
    var r = Math.ceil(Math.sqrt(n));

    //return r + (32-r%32);
    if (r < 32) r = 32;
    else if (r < 64) r = 64;
    else if (r < 128) r = 128;
    else if (r < 256) r = 256;
    else if (r < 512) r = 512;
    else if (r < 1024) r = 1024;
    else r = 2048;
    return r;
}

function createTextureBuffer()
{
    var texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
}

function createVertexTexture(reso)
{
    var texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var data = new Array();
    data.length = reso*reso*3;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, reso, reso,
                  0, gl.RGB, gl.FLOAT, new Float32Array(data));
    return texture;
}

function setDisplacementScale(scale)
{
    if ((displaceScale == 0 && scale > 0) ||
        (displaceScale > 0 && scale == 0)) {
        displaceScale = scale;
        initialize();
    } else {
        displaceScale = scale;
    }
}

function initialize()
{
    // surface program
    if (tessProgram != null) gl.deleteProgram(tessProgram);
    tessProgram = buildProgram('#tessVertexShader', '#fshader');
    tessProgram.mvpMatrix = gl.getUniformLocation(tessProgram, "mvpMatrix");
    tessProgram.modelViewMatrix = gl.getUniformLocation(tessProgram, "modelViewMatrix");
    tessProgram.projMatrix = gl.getUniformLocation(tessProgram, "projMatrix");
    tessProgram.displayMode = gl.getUniformLocation(tessProgram, "displayMode");

    if (gregoryProgram != null) gl.deleteProgram(gregoryProgram);
    gregoryProgram = buildProgram('#gregoryVertexShader', '#fshader');
    gregoryProgram.mvpMatrix = gl.getUniformLocation(gregoryProgram, "mvpMatrix");
    gregoryProgram.modelViewMatrix = gl.getUniformLocation(gregoryProgram, "modelViewMatrix");
    gregoryProgram.projMatrix = gl.getUniformLocation(gregoryProgram, "projMatrix");
    gregoryProgram.displayMode = gl.getUniformLocation(gregoryProgram, "displayMode");

    // cage program
    if (cageProgram != null) gl.deleteProgram(cageProgram);
    cageProgram = buildProgram("#cageVS", "#cageFS");
    cageProgram.mvpMatrix = gl.getUniformLocation(cageProgram, "mvpMatrix");
}

function deleteModel()
{
    if (model == null) return;
    if (model.batches == null) return;

    for(var i=0; i<model.batches.length; ++i) {
        gl.deleteBuffer(model.batches[i].ibo);
        gl.deleteBuffer(model.batches[i].vbo);
        gl.deleteBuffer(model.batches[i].vboUnvarying);
    }
    model.batches = [];

    if (model.hullVerts) gl.deleteBuffer(model.hullVerts);
    if (model.hullIndices) gl.deleteBuffer(model.hullIndices);

    if (model.vTexture)
        gl.deleteTexture(model.vTexture);
    if (model.patchIndexTexture)
        gl.deleteTexture(model.patchIndexTexture);
    if (model.gregoryPatchIndexTexture)
        gl.deleteTexture(model.gregoryPatchIndexTexture);

    if (model.ptexTexture_color)
        gl.deleteTexture(model.ptexTexture_color);
    if (model.ptexTexture_displace)
        gl.deleteTexture(model.ptexTexture_displace);

    model.vTexture = null;
    model.patchIndexTexture = null;
    model.gregoryPatchIndexTexture = null;
    model.ptexTexture_color = null;
    model.ptexTexture_displace = null;
}

function fitCamera()
{
    if (model == null) return;

    var n = model.cageVerts.length;
    var min = [model.cageVerts[0], model.cageVerts[1], model.cageVerts[2]];
    var max = [min[0], min[1], min[2]];
    for (i = 0; i < n; i+= 3) {
        var p = [model.cageVerts[i], model.cageVerts[i+1], model.cageVerts[i+2]];
        for (var j = 0; j < 3; ++j) {
            min[j] = (min[j] < p[j]) ? min[j] : p[j];
            max[j] = (max[j] > p[j]) ? max[j] : p[j];
        }
    }
    model.size = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
    model.diag = Math.sqrt(model.size[0]*model.size[0] + model.size[1]*model.size[1] + model.size[2]*model.size[2]);

    camera.tz = model.diag*0.8;
    camera.setCenter((max[0]+min[0])*0.5,
                     (max[1]+min[1])*0.5,
                     (max[2]+min[2])*0.5);
}

function setModel(data, modelName)
{
    if (data == null) return;

    //console.log(data);

    // XXX: release buffers!
    deleteModel(model);

    model = {};

    var nCoarseVerts = data.points.length/3;
    var nRefinedVerts = data.stencils.length/2;

    var nGregoryPatches = data.gregoryPatches ? data.gregoryPatches.length/4 : 0;
    var nTotalVerts = nCoarseVerts + nRefinedVerts + nGregoryPatches*20;
    model.patchVerts  = new Float32Array(nTotalVerts * 3);
    model.gregoryVertsOffset = nCoarseVerts + nRefinedVerts;
    model.nGregoryPatches = nGregoryPatches;

    // control cage
    model.animVerts   = new Float32Array(data.points.length)
    model.cageVerts   = new Float32Array(data.points.length)
    for (var i = 0; i < data.points.length; i++) {
        model.cageVerts[i*3+0] = data.points[i*3+0];
        model.cageVerts[i*3+1] = data.points[i*3+1];
        model.cageVerts[i*3+2] = data.points[i*3+2];
        model.animVerts[i*3+0] = data.points[i*3+0];
        model.animVerts[i*3+1] = data.points[i*3+1];
        model.animVerts[i*3+2] = data.points[i*3+2];
        model.patchVerts[i*3+0] = data.points[i*3+0];
        model.patchVerts[i*3+1] = data.points[i*3+1];
        model.patchVerts[i*3+2] = data.points[i*3+2];
    }
    model.cageLines   = new Int16Array(data.hull.length)
    for (var i = 0; i < data.hull.length; i++) {
        model.cageLines[i] = data.hull[i];
    }

    model.hullVerts = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
    gl.bufferData(gl.ARRAY_BUFFER, model.animVerts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    var ibuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.cageLines, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    model.hullIndices = ibuffer;

    // stencils
    model.stencils = data.stencils;
    model.stencilIndices = data.stencilIndices;
    model.stencilWeights = data.stencilWeights;

    // patch indices
    model.patches = data.patches;
    model.patchParams = data.patchParams;
    model.gregoryPatches = data.gregoryPatches;

    model.maxValence = data.maxValence;
    model.valenceTable = data.vertexValences;
    model.quadOffsets = data.quadOffsets;

    // patch indices texture
    var nPatches = model.patches.length/16;
    var r = getPOT(nPatches*16);
    model.patchIndexTexture = createTextureBuffer();
    model.nPatchRes = r;

    model.nPoints = model.patchVerts.length/3;
    var r2 = getPOT(model.nPoints);
    model.nPointRes = r2;

    var dt = model.patches;
    var fd = new Float32Array(r*r*3);
    for (var i = 0; i < dt.length; ++i) {
        if (dt[i] == -1) {
          fd[i*3+0] = -1;
          fd[i*3+1] = -1;
        } else {
          fd[i*3+0] = (dt[i]%r2+0.5)/r2;
          fd[i*3+1] = (Math.floor(dt[i]/r2)+0.5)/r2;
        }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, r, r, 0, gl.RGB, gl.FLOAT, fd);

    // gregory eval patch verts
    model.gregoryEvalVerts = new Uint32Array(nGregoryPatches*20);
    for (var i = 0; i < nGregoryPatches*20; ++i) {
        model.gregoryEvalVerts[i] = i + model.gregoryVertsOffset;
    }

    // gregory patch indices texture
    model.gregoryPatchIndexTexture = createTextureBuffer();
    fd = new Float32Array(nGregoryPatches*20*3);
    for (var i = 0; i < model.gregoryEvalVerts.length; ++i) {
        var vid = model.gregoryEvalVerts[i];
        fd[i*3+0] = (vid%r2+0.5)/r2;
        fd[i*3+1] = (Math.floor(vid/r2)+0.5)/r2;
    }
    model.nGregoryPatchRes = [20, nGregoryPatches];
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 20, nGregoryPatches, 0, gl.RGB, gl.FLOAT, fd);

    // tessellation mesh

    fitCamera();

    updateGeom(tessFactor);
}

function animate(time)
{
    var r = 2 * Math.sin(time) / model.diag;
    for (var i = 0; i < model.cageVerts.length; i += 3) {
        var x = model.cageVerts[i+0];
        var y = model.cageVerts[i+1];
        var z = model.cageVerts[i+2];
        model.animVerts[i+0] = x * Math.cos(r*y) + z * Math.sin(r*y);
        model.animVerts[i+1] = y;
        model.animVerts[i+2] = - x * Math.sin(r*y) + z * Math.cos(r*y);
        model.patchVerts[i+0] = model.animVerts[i+0];
        model.patchVerts[i+1] = model.animVerts[i+1];
        model.patchVerts[i+2] = model.animVerts[i+2];
    }

    // hull animation
    if (drawHull) {
        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bufferData(gl.ARRAY_BUFFER, model.animVerts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}

function updateGeom(tf)
{
    if (tf != null) {
        // initialize
        createUVmesh();
        tessFactor = tf;
        model.batches = []
    }

    refine();
    evalGregory();

    uploadRefinedVerts();
    redraw();
}

function refine()
{
    if (model == null) return;

    var nStencils = model.stencils.length/2;
    for (i = 0; i < nStencils; ++i) {
        // apply stencil
        var x = 0, y = 0, z = 0;
        var ofs = model.stencils[i*2+0];
        var size = model.stencils[i*2+1];
        for (j = 0; j < size; j++) {
            var vindex = model.stencilIndices[ofs+j];
            var weight = model.stencilWeights[ofs+j];
            x += model.animVerts[vindex*3+0] * weight;
            y += model.animVerts[vindex*3+1] * weight;
            z += model.animVerts[vindex*3+2] * weight;
        }
        model.patchVerts[model.cageVerts.length + i*3+0] = x;
        model.patchVerts[model.cageVerts.length + i*3+1] = y;
        model.patchVerts[model.cageVerts.length + i*3+2] = z;
    }
}

function uploadRefinedVerts()
{
    // CP texture update
    var r = model.nPointRes;
    if (model.vTexture == null) {
        model.vTexture = createVertexTexture(r);
    }
    var pv = new Float32Array(r*r*3);
    for (var i = 0; i < model.patchVerts.length; ++i) {
        pv[i] = model.patchVerts[i];
    }

    gl.bindTexture(gl.TEXTURE_2D, model.vTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, r, r,
                         gl.RGB, gl.FLOAT, pv);
}

function evalGregory()
{
    if (model == null) return;

    var nGregoryPatches = model.nGregoryPatches;
    var evaluator = new PatchEvaluator(model.maxValence);
    var patchOffset = model.patches.length/16;
    var quadOffset = 0;
    var vOut = model.gregoryVertsOffset*3;
    for (var i = 0; i < nGregoryPatches; ++i) {
        var patchIndex = i + patchOffset;
        var type = model.patchParams[patchIndex*8+2];
        evaluator.evalGregory(model.gregoryPatches,
                              i, type, quadOffset);
        quadOffset += 4;

        // store GP[20]
        for (var j = 0; j < 20; ++j) {
            model.patchVerts[vOut++] = evaluator.GP[j][0];
            model.patchVerts[vOut++] = evaluator.GP[j][1];
            model.patchVerts[vOut++] = evaluator.GP[j][2];
        }
    }
}

function createUVmesh()
{
    model.tessMeshes = [];
    for(var d = 0; d < 8; ++d) {
        var tessMesh = {};
        var div = (1 << d) + 1;
        var vbo = [];
        var ibo = [];
        var vid = 0;

        var numTris = 0;
        for (var iu = 0; iu < div; iu++) {
            for (var iv = 0; iv < div; iv++) {
                var u = iu/(div-1);
                var v = iv/(div-1);
                vbo.push(u);
                vbo.push(v);
                vbo.push(iu);
                vbo.push(iv);
                if (iu != 0 && iv != 0) {
                    ibo.push(vid - div - 1);
                    ibo.push(vid - div);
                    ibo.push(vid);
                    ibo.push(vid - 1);
                    ibo.push(vid - div - 1);
                    ibo.push(vid);
                    numTris += 2;
                }
                ++vid;
            }
        }

        // tessellation index
        tessMesh.IBO = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ibo), gl.STATIC_DRAW);
        // tessellation UV
        tessMesh.VBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vbo), gl.STATIC_DRAW);
        tessMesh.numTris = numTris;

        model.tessMeshes.push(tessMesh);
    }
//    console.log("Bind", ibo, vbo);
}

function idle() {

    if (model == null) return;

    if (deform) {
        time = time + 0.1;
    } else {
        time = 0;
    }
    animate(time);
    updateGeom();
}

function redraw() {

    if (model == null || model.patches == null) return;

    //gl.clearColor(.1, .1, .2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);

    var canvas = $('#main');
    var w = canvas.width()*dpr;
    var h = canvas.height()*dpr;
    var aspect = w / h;
    gl.viewport(0, 0, w, h);

    camera.setAspect(aspect);
    var proj = camera.getProjection();
    var modelView = camera.getModelView();
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, proj, modelView);

    if (drawHull && model.cageLines != null) {
        gl.useProgram(cageProgram);
        gl.uniformMatrix4fv(cageProgram.mvpMatrix, false, mvpMatrix);

        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.hullIndices);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.LINES, model.cageLines.length, gl.UNSIGNED_SHORT, 0);
    }

    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.enableVertexAttribArray(3);
    ext.vertexAttribDivisorANGLE(1, 1);
    ext.vertexAttribDivisorANGLE(2, 1);
    ext.vertexAttribDivisorANGLE(3, 1);

    drawTris = 0;
    if (model != null) {
        prepareBatch(mvpMatrix, proj, aspect);

        // common textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, model.vTexture);

        // bspline patches
        var program = tessProgram;
        gl.useProgram(program);
        gl.uniformMatrix4fv(program.modelViewMatrix, false, modelView);
        gl.uniformMatrix4fv(program.projMatrix, false, proj);
        gl.uniformMatrix4fv(program.mvpMatrix, false, mvpMatrix);
        gl.uniform1i(program.displayMode, displayMode);

        gl.uniform1f(gl.getUniformLocation(program, "pointRes"),
                     model.nPointRes);
        gl.uniform1f(gl.getUniformLocation(program, "displaceScale"),
                     displaceScale);
        gl.uniform1i(gl.getUniformLocation(program, "texCP"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "texPatch"), 1);
        gl.uniform1f(gl.getUniformLocation(program, "patchRes"),
                     model.nPatchRes);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, model.patchIndexTexture);

        drawBSpline(model.bsplineInstanceData);

        // gregory patches
        var program = gregoryProgram;
        gl.useProgram(program);
        gl.uniformMatrix4fv(program.modelViewMatrix, false, modelView);
        gl.uniformMatrix4fv(program.projMatrix, false, proj);
        gl.uniformMatrix4fv(program.mvpMatrix, false, mvpMatrix);
        gl.uniform1i(program.displayMode, displayMode);

        gl.uniform1f(gl.getUniformLocation(program, "pointRes"),
                     model.nPointRes);
        gl.uniform1f(gl.getUniformLocation(program, "displaceScale"),
                     displaceScale);
        gl.uniform1i(gl.getUniformLocation(program, "texCP"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "texPatch"), 1);
        gl.uniform2f(gl.getUniformLocation(program, "patchRes"),
                     model.nGregoryPatchRes[0], model.nGregoryPatchRes[1]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, model.gregoryPatchIndexTexture);

        drawGregory(model.gregoryInstanceData);
    }

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    ext.vertexAttribDivisorANGLE(1, 0);
    ext.vertexAttribDivisorANGLE(2, 0);
    ext.vertexAttribDivisorANGLE(3, 0);

    var time = Date.now();
    var drawTime = time - prevTime;
    prevTime = time;
//  fps = (29 * fps + 1000.0/drawTime)/30.0;
//  fps = 1000.0/drawTime;
//  $('#fps').text(Math.round(fps));

    if (drawTris > 100000)
        drawTris = Math.floor(drawTris/100000)/10+" M";
    $('#triangles').text(drawTris);
}

function GetTessLevels(p0, p1, p2, p3, level,
                       pattern, rotation,
                       mvpMatrix, projection)
{
    var s = 10;

    var d0 = vec3.distance(p0, p1);
    var d1 = vec3.distance(p1, p3);
    var d2 = vec3.distance(p3, p2);
    var d3 = vec3.distance(p2, p0);
    var c0 = vec4.create();
    var c1 = vec4.create();
    var c2 = vec4.create();
    var c3 = vec4.create();
    vec4.lerp(c0, p0, p1, 0.5);
    vec4.lerp(c1, p1, p3, 0.5);
    vec4.lerp(c2, p3, p2, 0.5);
    vec4.lerp(c3, p2, p0, 0.5);
    vec4.transformMat4(c0, c0, mvpMatrix);
    vec4.transformMat4(c1, c1, mvpMatrix);
    vec4.transformMat4(c2, c2, mvpMatrix);
    vec4.transformMat4(c3, c3, mvpMatrix);
    d0 = Math.max(1, s*level*Math.abs(d0 * projection[5] / c0[3]));
    d1 = Math.max(1, s*level*Math.abs(d1 * projection[5] / c1[3]));
    d2 = Math.max(1, s*level*Math.abs(d2 * projection[5] / c2[3]));
    d3 = Math.max(1, s*level*Math.abs(d3 * projection[5] / c3[3]));

    var t0 = Math.floor(Math.log2(d0));
    var t1 = Math.floor(Math.log2(d1));
    var t2 = Math.floor(Math.log2(d2));
    var t3 = Math.floor(Math.log2(d3));
    if (t0 > 7) t0 = 7;
    else if (t0 < 0) t0 = 0;
    if (t1 > 7) t1 = 7;
    else if (t1 < 0) t1 = 0;
    if (t2 > 7) t2 = 7;
    else if (t2 < 0) t2 = 0;
    if (t3 > 7) t3 = 7;
    else if (t3 < 0) t3 = 0;

        /*
          p2 -t2-- p3
          |        |
          t3      t1
          |        |
          p0 -t0-- p1
         */

    // consider transition, rotation
    if (pattern == 1) {
        if (rotation == 0 && t3 == 0) t3 = 1;
    }

    // align to max
    var tess = t0 > t1 ? t0 : t1;
    tess = t2 > tess ? t2 : tess;
    tess = t3 > tess ? t3 : tess;

    return [tess, t0, t1, t2, t3];
}
function prepareBatch(mvpMatrix, projection, aspect)
{
    var evaluator = new PatchEvaluator(model.maxValence);

    // level buckets
    model.bsplineInstanceData = [];
    model.gregoryInstanceData = [];
    for (var d = 0; d < 8; ++d) {
        model.bsplineInstanceData[d] = [];
        model.gregoryInstanceData[d] = [];
    }

    // bspline patches
    var nPatches = model.patches.length/16;
    for (var i = 0; i < nPatches; ++i) {
        var depth = model.patchParams[i*8+0];
        var type     = model.patchParams[i*8+2];
        var pattern  = model.patchParams[i*8+3];
        var rotation = model.patchParams[i*8+4];
        var level = tessFactor - depth;
        var color = getPatchColor(type, pattern);

        // clip length
        var pn0 = evaluator.evalBSpline(model.patches, i, 0, 0);
        var p0 = vec4.fromValues(pn0[0][0], pn0[0][1], pn0[0][2], 1);
        var pn1 = evaluator.evalBSpline(model.patches, i, 1, 0);
        var p1 = vec4.fromValues(pn1[0][0], pn1[0][1], pn1[0][2], 1);
        var pn2 = evaluator.evalBSpline(model.patches, i, 0, 1);
        var p2 = vec4.fromValues(pn2[0][0], pn2[0][1], pn2[0][2], 1);
        var pn3 = evaluator.evalBSpline(model.patches, i, 1, 1);
        var p3 = vec4.fromValues(pn3[0][0], pn3[0][1], pn3[0][2], 1);
        var tessLevels = GetTessLevels(p0, p1, p2, p3, level,
                                       pattern, rotation,
                                       mvpMatrix, projection);
        var tess = tessLevels[0];
        // TODO: frustum culling ?
        model.bsplineInstanceData[tess].push(i);
        model.bsplineInstanceData[tess].push(1<<tess);
        model.bsplineInstanceData[tess].push(1<<(tess-tessLevels[1]));
        model.bsplineInstanceData[tess].push(1<<(tess-tessLevels[2]));
        model.bsplineInstanceData[tess].push(1<<(tess-tessLevels[3]));
        model.bsplineInstanceData[tess].push(1<<(tess-tessLevels[4]));
        model.bsplineInstanceData[tess].push(color[0]);
        model.bsplineInstanceData[tess].push(color[1]);
        model.bsplineInstanceData[tess].push(color[2]);
    }

    // gregory patches
    var nGregoryPatches = model.gregoryPatches.length/4;
    for (var i = 0; i < nGregoryPatches; ++i) {
        var patchIndex = i + nPatches;
        var depth    = model.patchParams[patchIndex*8+0];
        var type     = model.patchParams[patchIndex*8+2];
        var pattern  = model.patchParams[patchIndex*8+3];
        var tess = tessFactor - depth;
        var color = getPatchColor(type, pattern);
        if (tess < 0) tess = 0;

        // clip length
        var pn0 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 0, 0);
        var p0 = vec4.fromValues(pn0[0][0], pn0[0][1], pn0[0][2], 1);
        var pn1 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 1, 0);
        var p1 = vec4.fromValues(pn1[0][0], pn1[0][1], pn1[0][2], 1);
        var pn2 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 0, 1);
        var p2 = vec4.fromValues(pn2[0][0], pn2[0][1], pn2[0][2], 1);
        var pn3 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 1, 1);
        var p3 = vec4.fromValues(pn3[0][0], pn3[0][1], pn3[0][2], 1);

        var tessLevels = GetTessLevels(p0, p1, p2, p3, level,
                                       pattern, rotation,
                                       mvpMatrix, projection);
        var tess = tessLevels[0];
        // TODO: frustum culling ?
        model.gregoryInstanceData[tess].push(i);
        model.gregoryInstanceData[tess].push(1<<tess);
        model.gregoryInstanceData[tess].push(1<<(tess-tessLevels[1]));
        model.gregoryInstanceData[tess].push(1<<(tess-tessLevels[2]));
        model.gregoryInstanceData[tess].push(1<<(tess-tessLevels[3]));
        model.gregoryInstanceData[tess].push(1<<(tess-tessLevels[4]));
        model.gregoryInstanceData[tess].push(color[0]);
        model.gregoryInstanceData[tess].push(color[1]);
        model.gregoryInstanceData[tess].push(color[2]);
    }

    if (!model.instanceVBO) {
        model.instanceVBO = gl.createBuffer();
    }
}

function drawBSpline(instanceData)
{
    // draw by patch level
    for (var d = 0; d < instanceData.length; ++d) {
        if (instanceData[d].length == 0) continue;
        var tessMesh = model.tessMeshes[d];

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4*4, 0);  // uv, iuiv

        gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceData[d]),
                      gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 9*4, 0);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 9*4, 2*4);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 9*4, 6*4);

        var nPatches = instanceData[d].length/9;
        ext.drawElementsInstancedANGLE(gl.TRIANGLES,
                                      tessMesh.numTris*3,
                                      gl.UNSIGNED_SHORT,
                                      0, nPatches);

        drawTris += tessMesh.numTris * nPatches;
    }
}

function drawGregory(instanceData)
{
    // draw by patch level
    for (var d = 0; d < instanceData.length; ++d) {
        if (instanceData[d].length == 0) continue;
        var tessMesh = model.tessMeshes[d];

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4*4, 0);  // uv, iuiv

        gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceData[d]),
                      gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 9*4, 0);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 9*4, 2*4);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 9*4, 6*4);

        var nPatches = instanceData[d].length/9;
        ext.drawElementsInstancedANGLE(gl.TRIANGLES,
                                      tessMesh.numTris*3,
                                      gl.UNSIGNED_SHORT,
                                      0, nPatches);

        drawTris += tessMesh.numTris * nPatches;
    }
}

function loadModel(modelName)
{
    var url = "objs/" + modelName + ".json";
    var xhr = new XMLHttpRequest();
    var now = new Date();
    xhr.open('GET', url + "?"+now.getTime(), true);
    xhr.onload = function(e) {
        var data = eval("("+this.response+")");
        setModel(data.model, modelName);
        initialize();
        redraw();
    }
    xhr.send();
/*
    var type = "text";
    $("#loading").show();
    $.ajax({
        type: "GET",
        url: url,
        responseType:type,
        success: function(data) {
            console.log(data);
            setModel(data.model);
            displaceScale = 0;
            $("#loading").hide();
        }
    });
*/
}

function resizeCanvas() {
    var canvas = $("#main").get(0);

    dpr = window.devicePixelRatio || 1;

    // only change the size of the canvas if the size it's being displayed
    // has changed.
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (canvas.width != width*dpr || canvas.height != height*dpr) {
        // Change the size of the canvas to match the size it's being displayed
        canvas.width = width*dpr;
        canvas.height = height*dpr;
        redraw();
    }
}

function getUrlParameter(sParam)
{
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    for (var i = 0; i < sURLVariables.length; i++) 
    {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) 
        {
            return sParameterName[1];
        }
    }
}

$(function(){
    var canvas = $("#main").get(0);
    $.each(["webgl2", "experimental-webgl2", "webgl", "experimental-webgl", "webkit-3d", "moz-webgl"], function(i, name){
        try {
            gl = canvas.getContext(name);
            gl.getExtension('OES_standard_derivatives');
            //console.log(name);
        }
        catch (e) {
        }
        return !gl;
    });
    if (!gl) {
        alert("WebGL is not supported in this browser!");
        return;
    }
    if(!gl.getExtension('OES_texture_float')){
        alert("requires OES_texture_float extension");
    }
    if(gl.getExtension('OES_texture_float_linear')){
        floatFilter = gl.LINEAR;
    } else {
        floatFilter = gl.NEAREST;
    }
    ext = gl.getExtension('ANGLE_instanced_arrays');
    if(!ext) {
        alert("requires ANGLE_instanced_arrays");
    }

    var tess = getUrlParameter("tessFactor");
    if (tess != undefined) {
        tessFactor = tess;
    }
    var dmode = getUrlParameter("displayMode");
    if (dmode != undefined) {
        displayMode = dmode;
    }

    initialize();

    button = false;
    $("#main").keypress(function(e) {
        console.log(e.which);
        if (e.which == "f") {
            fitCamera();
            redraw();
        }
    });

    $("#main").bind({"touchmove mousemove": function(event) {
        var p = [event.pageX, event.pageY];
        var d = [p[0]-prev_position[0], p[1]-prev_position[1]];

        if (event.type == "touchmove") {
            p = [event.originalEvent.touches[0].pageX, event.originalEvent.touches[0].pageY];
            d = [p[0]-prev_position[0], p[1]-prev_position[1]];

            //console.log(event.originalEvent);
            if (event.originalEvent.touches.length > 1) {
                var t = event.originalEvent.touches;
                var v = [t[1].pageX-t[0].pageX, t[1].pageY-t[0].pageY];
                v = Math.sqrt(v[0]*v[0]+v[1]*v[1]);
                if (button == 1) {
                    button = 3;
                    d[0] = 0;
                    prev_pinch = v;
                } else if (button == 3) {
                    d[0] = v - prev_pinch;
                    prev_pinch = v;
                }
            } else {
                if (button == 3) {
                    button = 0;  // better than set to 1
                }
            }
        }
        if (button > 0) {
            prev_position = p;
            if (event.shiftKey && button == 1) button = 2;

            if (button == 1) {
                camera.rotate(d[0], d[1]);
            } else if(button == 3) {
                camera.dolly(0.005*d[0]*model.diag);
            } else if(button == 2){
                camera.translate(d[0]*0.01*model.diag, d[1]*0.01*model.diag);
            }
            redraw();
        }
        }});

    $("#main").bind("touchstart", function(event) {
        prev_position = [event.originalEvent.changedTouches[0].pageX,
                         event.originalEvent.changedTouches[0].pageY];
        if (event.originalEvent.changedTouches.length > 1) {
            button = 3;
            var t = event.originalEvent.changedTouches;
            var v = [t[1].pageX-t[0].pageX, t[1].pageY-t[0].pageY];
            prev_pinch = Math.sqrt(v[0]*v[0]+v[1]*v[1]);
        } else {
            button = 1;
        }
        event.preventDefault();
    });
    $("#main").bind("mousedown", function(event) {
        button = event.button+1;
        prev_position = [event.pageX, event.pageY];
        event.preventDefault();
    });
    $("#main").bind("touchend", function() {
        if (event.changedTouches.length == 0) {
            button = false;
        }
    });
    $("#main").bind("mouseup", function() {
        button = false;
    });

    document.oncontextmenu = function(e){
        return false;
    }

    window.addEventListener('resize', resizeCanvas);

    $("#modelSelect").selectmenu( {
        change: function(event, ui) {
            loadModel(this.value);
            redraw();
        } }).selectmenu("menuWidget").addClass("overflow");

    $( "#tessFactorRadio" ).buttonset();
    $( "#tf4" ).attr('checked', 'checked');
    $( "#tessFactorRadio" ).buttonset('refresh');
    $( 'input[name="tessFactorRadio"]:radio' ).change(
        function() {
            var tf = ({tf1:1, tf2:2, tf3:3, tf4:4, tf5:5, tf6:6, tf7:7 })[this.id];
            updateGeom(tf);
        });

    $( "#tessKernelRadio" ).buttonset();
    $( "#tk2" ).attr('checked', 'checked');
    $( "#tessKernelRadio" ).buttonset('refresh');
    $( 'input[name="tessKernelRadio"]:radio' ).change(
        function() {
            gpuTess = ({tk1:false, tk2:true })[this.id];
            updateGeom();
        });

    $( "#radio" ).buttonset();
    $(["#displayShade", "#displayPatchColor", "#displayWire", "#displayNormal",
     "#displayPatchCoord"][displayMode]).attr('checked', 'checked');
    $( "#radio" ).buttonset('refresh');
    $( 'input[name="radio"]:radio' ).change(
        function() {
            displayMode = ({
                displayShade:0,
                displayPatchColor:1,
                displayWire:2,
                displayNormal:3,
                displayPatchCoord:4
            })[this.id];
            initialize();
            redraw();
        });

    $( "#hullCheckbox" ).button().change(
        function(event, ui){
            drawHull = !drawHull;
            redraw();
        });

    $( "#deformCheckbox" ).button().change(
        function(event, ui){
            deform = !deform;
            if (deform) {
                interval = setInterval(idle, 16);
            } else {
                clearInterval(interval);
                interval = null;
                idle();
            }
            redraw();
        });
    $("#displaceScale").slider({
        min: 0,
        max: 100,
        change: function(event, ui){
            setDisplacementScale(model.diag*ui.value*0.0001);
            redraw();
        },
        slide: function(event, ui){
            setDisplacementScale(model.diag*ui.value*0.0001);
            redraw();
        }});

    var modelName = getUrlParameter("model");
    if (modelName == undefined) {
        //loadModel("face");
        loadModel("cube");
        //loadModel("catmark_edgecorner");
    } else {
        loadModel("modelName");
    }

    resizeCanvas();
});

