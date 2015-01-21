//
//   Copyright 2014 Takahito Tejima (tejimaya@gmail.com)
//

var camera = {
    rx : 0,
    ry : 0,
    dolly : 5,
    fov : 60
};

var button = false;
var prev_position = [0, 0];
var prev_pinch = 0;
var gpuTess = false;

var center = [0, 0, 0];
var time = 0;
var model = {};
var deform = false;
var drawHull = true;
var uvMapping = false;
var dpr = 1;

var prevTime = 0;
var fps = 0;

var uvimage = new Image();
var uvtex = null;

var program = null;
var tessProgram = null;
var cageProgram = null;

var interval = null;
var framebuffer = null;

var displayMode = 1;

var tessFactor = 1;

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
    if (uvMapping) define += "#define USE_UV_MAP\n";
    var util = $('#shaderutil').text();

    var program = gl.createProgram();
    var vshader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vshader, define+util+$(vertexShader).text());
    gl.compileShader(vshader);
    if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS))
        alert(gl.getShaderInfoLog(vshader));
    var fshader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fshader, define+$(fragmentShader).text());
    gl.compileShader(fshader);
    if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS))
        alert(gl.getShaderInfoLog(fshader));
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);

    gl.bindAttribLocation(program, 0, "position");
    gl.bindAttribLocation(program, 1, "inNormal");
    gl.bindAttribLocation(program, 2, "inUV");
    gl.bindAttribLocation(program, 3, "inColor");

    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        alert(gl.getProgramInfoLog(program));
    return program;
}

function createTextureBuffer(data, format, reso)
{
    if (format == gl.LUMINANCE) {
        data.length = reso*reso;
    } else if(format == gl.LUMINANCE_ALPHA) {
        data.length = reso*reso*2;
    } else if(format == gl.RGB) {
        data.length = reso*reso*3;
    } else if(format == gl.RGBA) {
        data.length = reso*reso*4;
    }

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(gl.TEXTURE_2D, 0, format, reso, reso,
                  0, format, gl.FLOAT, data);

    return texture;
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
    data.length = reso*3;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, reso, 1,
                  0, gl.RGB, gl.FLOAT, new Float32Array(data));
    return texture;
}

function dumpFrameBuffer()
{
    var buffer = new ArrayBuffer(reso*reso*4);
    var pixels = new Uint8Array(buffer);
    gl.readPixels(0, 0, reso, reso, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    console.log(pixels);
}

function initialize()
{
    // surface program
    if (program != null) gl.deleteProgram(program);
    program = buildProgram('#vertexShader', '#fshader');
    program.mvpMatrix = gl.getUniformLocation(program, "mvpMatrix");
    program.modelViewMatrix = gl.getUniformLocation(program, "modelViewMatrix");
    program.projMatrix = gl.getUniformLocation(program, "projMatrix");
    program.displayMode = gl.getUniformLocation(program, "displayMode");

    if (tessProgram != null) gl.deleteProgram(tessProgram);
    tessProgram = buildProgram('#tessVertexShader', '#fshader');
    tessProgram.mvpMatrix = gl.getUniformLocation(tessProgram, "mvpMatrix");
    tessProgram.modelViewMatrix = gl.getUniformLocation(tessProgram, "modelViewMatrix");
    tessProgram.projMatrix = gl.getUniformLocation(tessProgram, "projMatrix");
    tessProgram.displayMode = gl.getUniformLocation(tessProgram, "displayMode");

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
    }
    if (model.vTexture) gl.deleteTexture(model.vTexture);
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

    camera.dolly = model.diag*0.8;
    center = [(max[0]+min[0])*0.5, (max[1]+min[1])*0.5, (max[2]+min[2])*0.5];
}

function setModel(data)
{
    if (data == null) return;

    //console.log(data);

    // XXX: release buffers!
    deleteModel(model);
    model = {};
    model.patchVerts  = new Float32Array(3*(data.points.length + data.stencilIndices.length));

    // control cage
    model.animVerts   = new Float32Array(3*data.points.length)
    model.cageVerts   = new Float32Array(3*data.points.length)
    for (i = 0; i < data.points.length; i++) {
        model.cageVerts[i*3+0] = data.points[i][0];
        model.cageVerts[i*3+1] = data.points[i][1];
        model.cageVerts[i*3+2] = data.points[i][2];
        model.animVerts[i*3+0] = data.points[i][0];
        model.animVerts[i*3+1] = data.points[i][1];
        model.animVerts[i*3+2] = data.points[i][2];
        model.patchVerts[i*3+0] = data.points[i][0];
        model.patchVerts[i*3+1] = data.points[i][1];
        model.patchVerts[i*3+2] = data.points[i][2];
    }
    model.cageLines   = new Int16Array(data.hull.length)
    for (i = 0; i < data.hull.length; i++) {
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

    // patch vertices
    var nPoints = data.stencilIndices.length;
    model.stencilIndices = data.stencilIndices;
    model.stencilWeights = data.stencilWeights;

    // patch indices
    model.tessvbo = gl.createBuffer();
    model.patches = data.patches;
    model.patchParams = data.patchParams;

    model.maxValence = data.maxValence;
    model.valenceTable = data.vertexValences;
    model.quadOffsets = data.quadOffsets;

    // patch indices texture
    var nPatches = model.patches.length;
    model.patchIndexTexture = createTextureBuffer();
    var data = [];
    for (var i = 0; i < nPatches; ++i) {
        var ncp = model.patches[i].length;
        for (var j = 0; j < 16; ++j) {
            if (j < ncp) data.push(model.patches[i][j]);
            else data.push(-1);
        }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 16, nPatches,
                  0, gl.LUMINANCE, gl.FLOAT, new Float32Array(data));

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

    gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
    gl.bufferData(gl.ARRAY_BUFFER, model.animVerts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function updateGeom(tf)
{
    if (tf != null) {
        tessFactor = tf;
        tessellateIndexAndUnvarying();
        tessellate();
    }

    refine();
    if (!gpuTess) {
        tessellate();
    }
    redraw();
}

function refine()
{
    if (model == null) return;

    for (i = 0; i < model.stencilIndices.length; i++) {
        // apply stencil
        var x = 0, y = 0, z = 0;
        var size = model.stencilIndices[i].length;
        for (j = 0; j < size; j++) {
            var vindex = model.stencilIndices[i][j];
            var weight = model.stencilWeights[i][j];
            x += model.animVerts[vindex*3+0] * weight;
            y += model.animVerts[vindex*3+1] * weight;
            z += model.animVerts[vindex*3+2] * weight;
        }
        model.patchVerts[model.cageVerts.length + i*3+0] = x;
        model.patchVerts[model.cageVerts.length + i*3+1] = y;
        model.patchVerts[model.cageVerts.length + i*3+2] = z;
    }

    if (gpuTess) {
        // CP texture update
        var nPoints = model.patchVerts.length/3;
        if (model.vTexture == null) {
            model.vTexture = createVertexTexture(nPoints);
        }
        gl.bindTexture(gl.TEXTURE_2D, model.vTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nPoints, 1,
                         gl.RGB, gl.FLOAT, new Float32Array(model.patchVerts));
    }
}

function appendBatch(indices, primVars, nPoints)
{
    var batch = {}
    batch.nPoints = nPoints;

    var pdata = new Float32Array(nPoints * 6); // xyz, normal
    var uvdata = new Float32Array(nPoints * 8); // uv(4), color(3)+patchIndex
    batch.pData = pdata;
    var idata = new Uint16Array(indices.length);
    for (i = 0; i < indices.length; i++) {
        idata[i] = indices[i];
    }
    for (i = 0; i < primVars.length; i++) {
        uvdata[i] = primVars[i];
    }
    batch.nTris = idata.length/3;

    batch.vbo = gl.createBuffer();
    batch.vboUnvarying = gl.createBuffer();
    batch.ibo = gl.createBuffer();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idata, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vboUnvarying);
    gl.bufferData(gl.ARRAY_BUFFER, uvdata, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    model.batches.push(batch);
}

function setPoint(batchIndex, vid, pn)
{
    var pdata = model.batches[batchIndex].pData;
    var ofs = vid * 6;
    pdata[ofs++] = pn[0][0];
    pdata[ofs++] = pn[0][1];
    pdata[ofs++] = pn[0][2];
    pdata[ofs++] = pn[1][0];
    pdata[ofs++] = pn[1][1];
    pdata[ofs++] = pn[1][2];
}

function finalizeBatches()
{
    for (var i = 0; i < model.batches.length; i++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, model.batches[i].vbo);
        gl.bufferData(gl.ARRAY_BUFFER, model.batches[i].pData, gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function getTransitionParams(pattern, rotation)
{
//    pattern0        pattern1       pattern2        pattern3        pattern4
// +-------------+ +-------------+ +-------------+ +-------------+ +-------------+
// |     /\\     | | 0   /\\   2 | |             | |      |      | |      |      |
// | 1  /  \\  2 | |    /   \\   | |      0      | |  1   |  0   | |      |      |
// |   /    \\   | |   /  3   \\ | |-------------| |------|------| |  1   |   0  |
// |  /      \\  | |  /       /  | |\\    3    / | |      |      | |      |      |
// | /    0   \\ | | /    /    1 | |  \\     /   | |  3   |  2   | |      |      |
// |/          \\| |/ /          | | 1  \\ /   2 | |      |      | |      |      |
// +-------------+ +-------------+ +-------------+ +-------------+ +-------------+
    if (pattern == 0) {
        var p = [
            [[1,0],[0,0.5],[1,1],[1,0],[0, 0],[0,0.5],[1,1],[0,0.5],[0,1]],  // OK
            [[1,1],[0.5,0],[0,1],[1,1],[1, 0],[0.5,0],[0,1],[0.5,0],[0,0]],
            [[0,1],[1,0.5],[0,0],[0,1],[1, 1],[1,0.5],[0,0],[1,0.5],[1,0]],  // OK
            [[0,0],[0.5,1],[1,0],[0,0],[0, 1],[0.5,1],[1,0],[0.5,1],[1,1]]];
        return p[rotation];
    } else if (pattern == 1){
        var p = [
            [[1,1],[1,0],[0.5,0],[1,1],[0,0.5],[0,1],[0,0.5],[0.5,0],[0,0],[1,1],[0.5,0],[0,0.5]], // OK
            [[0,1],[1,1],[1,0.5],[0,1],[0.5,0],[0,0],[0.5,0],[1,0.5],[1,0],[0,1],[1,0.5],[0.5,0]], // OK
            [[0,0],[0,1],[0.5,1],[0,0],[1,0.5],[1,0],[1,0.5],[0.5,1],[1,1],[0,0],[0.5,1],[1,0.5]], // OK
            [[1,0],[0,0],[0,0.5],[1,0],[0.5,1],[1,1],[0.5,1],[0,0.5],[0,1],[1,0],[0,0.5],[0.5,1]]];
        return p[rotation];
    } else if (pattern == 2) {
        var p = [
            [[0,0.5],[0,1],[1,1],[0,.5],[1,1],[1,0.5],[0,0],[0,0.5],[0.5,0],[0.5,0],[1,0.5],[1,0],[0,0.5],[1,0.5],[0.5,0]],
            [[0,0.5],[0,1],[1,1],[0,.5],[1,1],[1,0.5],[0,0],[0,0.5],[0.5,0],[0.5,0],[1,0.5],[1,0],[0,0.5],[1,0.5],[0.5,0]],
            [[0,0.5],[0,1],[1,1],[0,.5],[1,1],[1,0.5],[0,0],[0,0.5],[0.5,0],[0.5,0],[1,0.5],[1,0],[0,0.5],[1,0.5],[0.5,0]],
            [[0,0.5],[0,1],[1,1],[0,.5],[1,1],[1,0.5],[0,0],[0,0.5],[0.5,0],[0.5,0],[1,0.5],[1,0],[0,0.5],[1,0.5],[0.5,0]]];
        return p[rotation];
    } else if (pattern == 3) {
        return [[0,0],[0,0.5],[0.5,0.5],[0,0],[0.5,0.5],[0.5,0],
                [0,0.5],[0,1],[0.5,1],[0,0.5],[0.5,1],[0.5,0.5],
                [0.5,0],[0.5,0.5],[1,0.5],[0.5,0],[1,0.5],[1,0],
                [0.5,0.5],[0.5,1],[1,1],[0.5,0,5],[1,1],[1,0.5]];
    } else if (pattern == 4) {
        return [[0,0],[0,1],[0.5,1],[0,0],[0.5,1],[0.5,0],
                [0.5,0],[0.5,1],[1,1],[0.5,0],[1,1],[1,0]];
    } else {
        console.log("Unknown" , pattern, rotation);
        return [];
    }
}

function tessellateIndexAndUnvarying() {
    if (model == null) return;
    model.batches = []

    var indices = [];
    var primVars = [];
    var vid = 0;

    for (var i = 0; i < model.patches.length; i++) {
        var ncp = model.patches[i].length;

        if (i >= model.patchParams.length) continue;
        var p = model.patchParams[i];
        if (p == null) continue;

        var level = tessFactor - p[0]/*depth*/;
        var color = (p[3] == 0) ?
            patchColors[0][p[2]-6] :
            patchColors[p[2]-6+1][p[3]-1];

        if (level <= 0 && p[3] != 0/*transition*/) {
            // under tessellated transition patch. need triangle patterns.
            var params = getTransitionParams(p[3]-1, p[4]);
            var edgeparams = [[0,0],[1,0],[0,1]];
            for (var j = 0; j < params.length; ++j) {
                var u = params[j][0];
                var v = params[j][1];
                var iu = edgeparams[j%3][0];
                var iv = edgeparams[j%3][1];
                primVars.push(u);
                primVars.push(v);
                primVars.push(iu);
                primVars.push(iv);
                primVars.push(color[0]);
                primVars.push(color[1]);
                primVars.push(color[2]);
                primVars.push(i+0.0);
                indices.push(vid++);
            }
        } else {
            if (level < 0) level = 0;
            var div = (1 << level) + 1;
            for (iu = 0; iu < div; iu++) {
                for (iv = 0; iv < div; iv++) {
                    var u = iu/(div-1);
                    var v = iv/(div-1);
                    primVars.push(u);
                    primVars.push(v);
                    primVars.push(iu);
                    primVars.push(iv);
                    primVars.push(color[0]);
                    primVars.push(color[1]);
                    primVars.push(color[2]);
                    primVars.push(i+0.0);
                    if (iu != 0 && iv != 0) {
                        indices.push(vid);
                        indices.push(vid-div);
                        indices.push(vid-div-1);
                        indices.push(vid-1);
                        indices.push(vid-div-1);
                        indices.push(vid);
                    }
                    ++vid;
                }
            }
        }

        // if it reached to 64K vertices, move to next batch
        if (vid > 60000) {
            appendBatch(indices, primVars, vid);
            indices = [];
            primVars = [];
            vid = 0;
        }
    }

    // residual
    appendBatch(indices, primVars, vid);
}

function tessellate() {
    if (model == null) return;

    var evaluator = new PatchEvaluator();
    var vid = 0;
    var quadOffset = 0;
    var batchIndex = 0;

    for (var i = 0; i < model.patches.length; i++) {
        var ncp = model.patches[i].length;

        if (i >= model.patchParams.length) continue;
        var p = model.patchParams[i];
        if (p == null) continue;

        var level = tessFactor - p[0]/*depth*/;
        if (level <= 0 && p[3] != 0/*transition*/) {
            // under tessellated transition patch. need triangle patterns.
            var params = getTransitionParams(p[3]-1, p[4]);
            for (var j = 0; j < params.length; ++j) {
                var u = params[j][0];
                var v = params[j][1];
                pn = evaluator.evalBSpline(model.patches[i], u, v);
                setPoint(batchIndex, vid, pn);
                vid++;
            }
        } else {
            if (level < 0) level = 0;
            var div = (1 << level) + 1;
            for (iu = 0; iu < div; iu++) {
                for (iv = 0; iv < div; iv++) {
                    var u = iu/(div-1);
                    var v = iv/(div-1);
                    if (ncp == 4) {
                        pn = evalGregory(model.patches[i], p[2], quadOffset, u, v);
                    } else {
                        pn = evaluator.evalBSpline(model.patches[i], u, v);
                    }
                    setPoint(batchIndex, vid, pn);
                    ++vid;
                }
            }
        }
        if (ncp == 4) {
            quadOffset += 4;
        }

        // if it reached to 64K vertices, move to next batch
        if (vid > 60000) {
            batchIndex++;
            vid = 0;
        }
    }
    finalizeBatches();
}

function syncbuffer()
{
    gl.flush();
//    dumpFrameBuffer();
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

    if (model == null) return;
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //gl.clearColor(.1, .1, .2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);

    var canvas = $('#main');
    var w = canvas.width()*dpr;
    var h = canvas.height()*dpr;
    var aspect = w / h;
    gl.viewport(0, 0, w, h);

    var proj = mat4.create();
    mat4.identity(proj);
    mat4.perspective(proj, camera.fov*6.28/360.0, aspect, 0.1, 1000.0);

    var modelView = mat4.create();
    mat4.identity(modelView);
    mat4.translate(modelView, modelView, vec3.fromValues(0, 0, -camera.dolly));
    mat4.rotate(modelView, modelView, camera.ry*Math.PI*2/360, vec3.fromValues(1, 0, 0));
    mat4.rotate(modelView, modelView, camera.rx*Math.PI*2/360, vec3.fromValues(0, 1, 0));
    mat4.translate(modelView, modelView, vec3.fromValues(-center[0], -center[1], -center[2]));

    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, proj, modelView);

    if (drawHull && model.cageLines != null) {
        gl.useProgram(cageProgram);
        gl.uniformMatrix4fv(cageProgram.mvpMatrix, false, mvpMatrix);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.hullIndices);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.LINES, model.cageLines.length, gl.UNSIGNED_SHORT, 0);
    }

    // ---------------------------
    if (gpuTess) {
        gl.useProgram(tessProgram);
        gl.uniformMatrix4fv(tessProgram.modelViewMatrix, false, modelView);
        gl.uniformMatrix4fv(tessProgram.projMatrix, false, proj);
        gl.uniformMatrix4fv(tessProgram.mvpMatrix, false, mvpMatrix);
        gl.uniform1i(tessProgram.displayMode, displayMode);
        // GPUtess texture
        gl.uniform1f(gl.getUniformLocation(tessProgram, "numPatches"), model.patches.length);
        gl.uniform1f(gl.getUniformLocation(tessProgram, "numPoints"), model.patchVerts.length/3);
        gl.uniform1i(gl.getUniformLocation(tessProgram, "texCP"), 0);
        gl.uniform1i(gl.getUniformLocation(tessProgram, "texPatch"), 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, model.vTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, model.patchIndexTexture);
    } else {
        gl.useProgram(program);
        gl.uniformMatrix4fv(program.modelViewMatrix, false, modelView);
        gl.uniformMatrix4fv(program.projMatrix, false, proj);
        gl.uniformMatrix4fv(program.mvpMatrix, false, mvpMatrix);
        gl.uniform1i(program.displayMode, displayMode);
    }

    var drawTris = 0;
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.enableVertexAttribArray(3);
    if (model.batches != null)
    for (var i = 0; i < model.batches.length; ++i) {
        var batch = model.batches[i];
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6*4, 0);    // XYZ
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6*4, 3*4);  // normal
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vboUnvarying);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 8*4, 0);  // uv, iuiv
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 8*4, 4*4); // color, patchIndex

        gl.drawElements(gl.TRIANGLES, batch.nTris*3, gl.UNSIGNED_SHORT, 0);
        //gl.drawElements(gl.POINTS, batch.nTris*3, gl.UNSIGNED_SHORT, 0);

        drawTris += batch.nTris;
    }

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);

    var time = Date.now();
    drawTime = time - prevTime;
    prevTime = time;
    //fps = (29 * fps + 1000.0/drawTime)/30.0;
    fps = 1000.0/drawTime;
    $('#fps').text(Math.round(fps));
    $('#triangles').text(drawTris);
}

function loadModel(url)
{
/*
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
       setModelBin(this.response);
       redraw();
    }
    xhr.send();
*/
    var type = "text"
    $.ajax({
        type: "GET",
        url: url,
        responseType:type,
        success: function(data) {
            setModel(data.model);
            redraw();
        }
    });
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

    initialize();

    button = false;

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
            if (button == 1) {
                camera.rx += d[0];
                camera.ry += d[1];
                if(camera.ry > 90) camera.ry = 90;
                if(camera.ry < -90) camera.ry = -90;
            }
            else if(button == 3) {
                camera.dolly -= 0.005*d[0]*model.diag;
                if (camera.dolly < 0.1) camera.dolly = 0.001;
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

/*
    document.onmousewheel = function(e){
        var event = windowEvent();
        camera.dolly -= event.wheelDelta/200;
        if (camera.dolly < 0.1) camera.dolly = 0.1;
        redraw();
        return false;
    };
*/
    document.oncontextmenu = function(e){
        return false;
    }

    window.addEventListener('resize', resizeCanvas);

    $("#modelSelect").selectmenu( {
        change: function(event, ui) {
            loadModel("objs/"+this.value+".json");
            redraw();
        } }).selectmenu("menuWidget").addClass("overflow");
/*
    var modelSelect = $("#modelSelect").get(0);
    modelSelect.onchange = function(e){
        if (model.name == modelSelect.value) return;
        loadModel("objs/"+modelSelect.value+".json");
        model.name = modelSelect.value;
        redraw();
    }
    modelSelect.onclick = function(e){
        if (model.name == modelSelect.value) return;
        loadModel("objs/"+modelSelect.value+".json");
        model.name = modelSelect.value;
        redraw();
    }
*/

    $( "#tessFactorRadio" ).buttonset();
    $( 'input[name="tessFactorRadio"]:radio' ).change(
        function() {
            var tf = ({tf1:1, tf2:2, tf3:3, tf4:4, tf5:5, tf6:6, tf7:7 })[this.id];
            updateGeom(tf);
        });

    $( "#tessKernelRadio" ).buttonset();
    $( 'input[name="tessKernelRadio"]:radio' ).change(
        function() {
            gpuTess = ({tk1:false, tk2:true })[this.id];
            updateGeom();
        });

    $( "#radio" ).buttonset();
    $( 'input[name="radio"]:radio' ).change(
        function() {
            displayMode = ({
                displayShade:0,
                displayPatchColor:1,
                displayWire:2,
                displayNormal:3,
                displayPatchCoord:4
            })[this.id];
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

    /*
    uvimage.onload = function() {
    uvtex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, uvtex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uvimage);
    redraw();
    }
    */
    loadModel("objs/cube.json");
    resizeCanvas();
});

