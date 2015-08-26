//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//

var version = "last updated:2015/02/03-22:58:35"

var app = {
    level : 3,
    IsGPU : function() {
        return (this.kernel == "GPU Uniform" || this.kernel == "GPU Adaptive");
    },
    kernel : 'GPU Adaptive',
    //kernel : 'JS',
    tessFactor : 3,
    displayMode : 2,
    animation : false,
    hull : false,
    displacement:  1.0,
    model : 'catmark_cube',
    sculptValue : 2.0,
    paintColor : [0, 100, 20]
};

var mesh = { objfile: "",
           };

var time = 0;
var model = {};
var dpr = 1;

var framebuffer = null;

var prevTime = 0;
var fps = 0;
var ext = null;

var cageProgram = null;
var drawPrograms = null;
var panitPrograms = null;
var sculptPrograms = null;

var interval = null;

var paintInfo = {
    pos : [0, 0]
};

var floatFilter = 0;
var mobile = false;

var drawTris = 0;


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

function buildProgram(shaderSource, attribBindings)
{
    var define = ""
    if (OES_standard_derivatives)
        define += "#extension GL_OES_standard_derivatives : enable\n"
        + "#define HAS_OES_STANDARD_DERIVATIVES\n";
    define += "precision highp float;\n";

    if (navigator.userAgent.indexOf('Android') > 0){
        define += "#define ANDROID\n";
    }

    define += "#define DISPLAY_MODE " + app.displayMode +"\n";
    define += "#define DISPLACEMENT 1\n";
    define += "#define COLOR_TEXTURE\n";

    var program = glUtil.linkProgram(
        "#define VERTEX_SHADER\n"+define+shaderSource,
        "#define FRAGMENT_SHADER\n"+define+shaderSource,
        attribBindings);
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

function setUniforms(program)
{
    camera.setMatrixUniforms(program);

    // TODO: remove getUniformLocations...

    var location;
    location = gl.getUniformLocation(program, "pointRes");
    if (location)
        gl.uniform1f(location, model.nPointRes);
    location = gl.getUniformLocation(program, "texCP");
    if (location)
        gl.uniform1i(location, 0);
    location = gl.getUniformLocation(program, "texPatch");
    if (location)
        gl.uniform1i(location, 1);
    location = gl.getUniformLocation(program, "texUVBuffer");
    if (location)
        gl.uniform1i(location, 2);
    location = gl.getUniformLocation(program, "uvColor");
    if (location)
        gl.uniform1i(location, 3);
    location = gl.getUniformLocation(program, "uvDisplacement");
    if (location)
        gl.uniform1i(location, 4);

    if (model.uv) {
        gl.uniform1f(gl.getUniformLocation(program, "uvBufferRes"),
                     model.uv.resolution);
    }

    // appearance
    location = gl.getUniformLocation(program, "displaceScale")
    if (location)
        gl.uniform1f(location, model.diag * 0.005 * app.displacement);

    // paint
    location = gl.getUniformLocation(program, "paintPos");
    if (location)
        gl.uniform2f(location, paintInfo.pos[0], paintInfo.pos[1]);

    if (program.paintColor) {
        gl.uniform3f(program.paintColor,
                     app.paintColor[0]/255,
                     app.paintColor[1]/255,
                     app.paintColor[2]/255);
    }
    if (program.sculptValue) {
        gl.uniform1f(program.sculptValue, app.sculptValue);
    }
}

function setUniformLocations(program)
{
    var uniforms = ["mvpMatrix", "modelViewMatrix", "projMatrix",
                    "paintColor", "sculptValue"]
    for (var i = 0; i < uniforms.length; ++i) {
        program[uniforms[i]] = gl.getUniformLocation(program, uniforms[i]);
    }
}

function initShaders()
{
    var common = getShaderSource("shaders/common.glsl");

    // cage program
    if (cageProgram != null) gl.deleteProgram(cageProgram);
    cageProgram = buildProgram(common+getShaderSource("shaders/cage.glsl"),
                              { position: 0 });
    setUniformLocations(cageProgram);

    var triAttribBindings = { position : 0,
                              inNormal : 1,
                              inUV : 2,
                              inColor : 3,
                              inPtexCoord : 4};
    var patchAttribBindings = { inUV : 0,
                                patchData : 1,
                                tessLevel : 2,
                                inColor : 3,
                                ptexParam : 4 };
    // surface drawing programs
    drawPrograms = {};


    // triangle
    var triProgram = buildProgram(common+getShaderSource("shaders/triangle.glsl"),
                                  triAttribBindings);
    setUniformLocations(triProgram);
    drawPrograms.triProgram = triProgram;

    // bspline
    var tessProgram = buildProgram(common+getShaderSource("shaders/bspline.glsl"),
                                   patchAttribBindings);
    setUniformLocations(tessProgram);
    drawPrograms.bsplineProgram = tessProgram;

    // texture painting programs
    paintPrograms = {};

    // triangle
    var paintdef = "#define PAINT\n";
    var triProgram = buildProgram(paintdef+common+getShaderSource("shaders/triangle.glsl"),
                                  triAttribBindings);
    setUniformLocations(triProgram);
    paintPrograms.triProgram = triProgram;

    // bspline
    var tessProgram = buildProgram(paintdef+common+
                                   getShaderSource("shaders/bspline.glsl"),
                                   patchAttribBindings);
    setUniformLocations(tessProgram);
    paintPrograms.bsplineProgram = tessProgram;

    // texture sculpting programs
    sculptPrograms = {};

    // triangle
    var sculptdef = "#define SCULPT\n";
    var triProgram = buildProgram(sculptdef+common+getShaderSource("shaders/triangle.glsl"),
                                  triAttribBindings);
    setUniformLocations(triProgram);
    sculptPrograms.triProgram = triProgram;

    // bspline
    var tessProgram = buildProgram(sculptdef+common+
                                   getShaderSource("shaders/bspline.glsl"),
                                   patchAttribBindings);
    setUniformLocations(tessProgram);
    sculptPrograms.bsplineProgram = tessProgram;

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

    if (model.ptxColor) {
        if (model.ptxColor.layout.texture)
            gl.deleteTexture(model.ptxColor.layout.texture);
        if (model.ptxColor.texel.texture)
            gl.deleteTexture(model.ptxColor.texel.texture);
    }
    if (model.ptxDisplace) {
        if (model.ptxDisplace.layout.texture)
            gl.deleteTexture(model.ptxDisplace.layout.texture);
        if (model.ptxDisplace.texel.texture)
            gl.deleteTexture(model.ptxDisplace.texel.texture);
    }

    model.vTexture = null;
    model.patchIndexTexture = null;
    model.ptxColor = null;
    model.ptxDisplace = null;
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
    model.diag = Math.sqrt(model.size[0]*model.size[0]
                           + model.size[1]*model.size[1]
                           + model.size[2]*model.size[2]);

    camera.tz = model.diag*0.8;
    camera.diag = model.diag;
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

    var nTotalVerts = nCoarseVerts + nRefinedVerts;// + nGregoryPatches*20;
    model.patchVerts  = new Float32Array(nTotalVerts * 3);

    // control cage
    model.animVerts   = new Float32Array(data.points.length)
    model.cageVerts   = new Float32Array(data.points.length)
    for (var i = 0; i < data.points.length; i++) {
        model.cageVerts[i*3+0] = data.points[i*3+0];
        model.cageVerts[i*3+1] = data.points[i*3+1]+0.2;
        model.cageVerts[i*3+2] = data.points[i*3+2];
        model.animVerts[i*3+0] = data.points[i*3+0];
        model.animVerts[i*3+1] = data.points[i*3+1]+0.2;
        model.animVerts[i*3+2] = data.points[i*3+2];
        model.patchVerts[i*3+0] = data.points[i*3+0];
        model.patchVerts[i*3+1] = data.points[i*3+1]+0.2;
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

    // framebuffer prep
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    framebuffer = gl.createFramebuffer();

    // UV
    //console.log(data.uv);
    if (data.uv) {
        // RGBA, RGBA (uv0, uv1, uv2, uv3)   pack 4-vec2 into 2 rgba.
        model.uv = {}
        model.uv.values = data.uv;
        model.uv.texture = gl.createTexture();
        model.uv.resolution = getPOT(nPatches*2);
        var uvData = new Float32Array(model.uv.resolution*model.uv.resolution*4);
        for (var i = 0; i < data.uv.length; ++i) {
            uvData[i] = data.uv[i];
        }
        gl.bindTexture(gl.TEXTURE_2D, model.uv.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                      model.uv.resolution,
                      model.uv.resolution,
                      0, gl.RGBA, gl.FLOAT, uvData);

        model.uvColor = {}
        // texel read
        var image = new Image();
        image.onload = function() {
            model.uvColor.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, model.uvColor.texture);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

            // update image size
            model.uvColor.dim = [image.width, image.height];
        }
        var now = new Date();
        image.src = "./objs/uv.png?"+now.getTime();

        model.uvDisplacement = {}
        // texel read
        if (false) {
            var image = new Image();
            image.onload = function() {
                model.uvDisplacement.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, model.uvDisplacement.texture);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

                // update image size
                model.uvDisplacement.dim = [image.width, image.height];
            }
            var now = new Date();
            image.src = "./objs/uv.png?"+now.getTime();
        } else {
            var dispRes = 1024;
            var buffer = new Float32Array(dispRes * dispRes * 3);
            for (var i = 0; i < dispRes*dispRes*3; ++i) buffer[i] = 0;

            model.uvDisplacement.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, model.uvDisplacement.texture);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB,
                          dispRes, dispRes, 0,
                          gl.RGB, gl.FLOAT, buffer);
            model.uvDisplacement.dim = [dispRes, dispRes];
        }

    }

    fitCamera();

    initGeom();
    updateGeom();
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
    if (app.hull) {
        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bufferData(gl.ARRAY_BUFFER, model.animVerts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}

function initGeom()
{
    if (app.IsGPU()) {
        createUVmesh();
        model.bsplineInstanceData = [];
    } else {
        model.batches = [];
        tessellateIndexAndUnvarying(model.patches, model.patchParams, false, 0);
    }
}

function updateGeom()
{
    refine();

    if (app.IsGPU()) {
        uploadRefinedVerts();
    } else {
        tessellate();
    }
    redraw();
}

function appendBatch(indices, primVars, nIndices, nPoints)
{
    var batch = {}

    var pdata = new Float32Array(nPoints * 6); // xyz, normal
    var uvdata = new Float32Array(nPoints * 12); // uv(4), color(3)+patchIndex
    var idata = new Uint16Array(nIndices);
    for (i = 0; i < nIndices; i++) {
        idata[i] = indices[i];
    }
    for (i = 0; i < nPoints*12; i++) {
        uvdata[i] = primVars[i];
    }
    batch.pData = pdata;
    batch.uvData = uvdata;
    batch.nPoints = nPoints;
    batch.nTris = nIndices/3;

    batch.vbo = gl.createBuffer();
    batch.vboUnvarying = gl.createBuffer();
    batch.ibo = gl.createBuffer();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idata, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pdata, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vboUnvarying);
    gl.bufferData(gl.ARRAY_BUFFER, uvdata, gl.STATIC_DRAW);

    model.batches.push(batch);
}

function finalizeBatches(batch)
{
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, batch.pData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function mix(a, b, r)
{
    return a * (1-r) + b * r;
}

function tessellateIndexAndUnvarying(patches, patchParams, patchOffset)
{
    if (patches == null) return;

    var indices = new Uint16Array(10*65536);
    var primVars = new Float32Array(12*65536);
    var vid = 0;
    var nIndices = 0;
    var edgeparams = [[0,0],[1,0],[0,1]];

    var nPatches = patches.length/16;

    for (var i = 0; i < nPatches; ++i) {
        // patchparam: depth, ptexRot, type, pattern, rotation
        var patchIndex = i + patchOffset;
        if (patchIndex*2 >= patchParams.length) continue;

        var field0 = model.patchParams[patchIndex*2+0];
        var field1 = model.patchParams[patchIndex*2+1];

        var depth      = (field1 & 0xf);
        var transition = ((field0 >> 28) & 0xf);
        var boundary   = ((field1 >>  8) & 0xf);

        var ncp = 16;

        if (vid > 40000) {
            appendBatch(indices, primVars, nIndices, vid);
            nIndices = 0;
            vid = 0;
        }

        var color = getPatchColor(transition, boundary);

        // TODO: interpolate UV here.
        var level = Math.max(0, app.tessFactor - depth);
        var l0 = level, l1 = level, l2 = level, l3 = level;

        // transition edge remapping
        if (level == 0) {
            if ((transition & 1) != 0) {
                level = 1;
                l3 = 1;
            }
            if ((transition & 2) != 0) {
                level = 1;
                l2 = 1;
            }
            if ((transition & 4) != 0) {
                level = 1;
                l1 = 1;
            }
            if ((transition & 8) != 0) {
                level = 1;
                l0 = 1;
            }
        }

        var div = (1 << level) + 1;
        var t0 = 1 << (level - l0);
        var t1 = 1 << (level - l1);
        var t2 = 1 << (level - l2);
        var t3 = 1 << (level - l3);

        var fvarUV = [[model.uv.values[i*8+0], model.uv.values[i*8+1]],
                      [model.uv.values[i*8+2], model.uv.values[i*8+3]],
                      [model.uv.values[i*8+4], model.uv.values[i*8+5]],
                      [model.uv.values[i*8+6], model.uv.values[i*8+7]]];
        for (iu = 0; iu < div; iu++) {
            for (iv = 0; iv < div; iv++) {
                var u = iu/(div-1);
                var v = iv/(div-1);

                // stitch
                if (u == 0.0) {
                    v = Math.floor(iv/t3) / ((1<<level)/t3);
                } else if (u == 1.0) {
                    v = Math.floor(iv/t1) / ((1<<level)/t1);
                } else if (v == 0.0) {
                    u = Math.floor(iu/t0) / ((1<<level)/t0);
                } else if (v == 1.0) {
                    u = Math.floor(iu/t2) / ((1<<level)/t2);
                }

                // texture coordinate (fvar)
                var texCoordU = mix(mix(fvarUV[0][0], fvarUV[1][0], v),
                                    mix(fvarUV[3][0], fvarUV[2][0], v), u);
                var texCoordV = mix(mix(fvarUV[0][1], fvarUV[1][1], v),
                                    mix(fvarUV[3][1], fvarUV[2][1], v), u);

                primVars[vid*12+0] = u;
                primVars[vid*12+1] = v;
                primVars[vid*12+2] = iu;
                primVars[vid*12+3] = iv;
                primVars[vid*12+4] = color[0];
                primVars[vid*12+5] = color[1];
                primVars[vid*12+6] = color[2];
                primVars[vid*12+7] = i;
                primVars[vid*12+8] = texCoordU;
                primVars[vid*12+9] = texCoordV;
                primVars[vid*12+10] = 0;
                primVars[vid*12+11] = 0;
                if (iu != 0 && iv != 0) {
                    indices[nIndices++] = vid - div - 1;
                    indices[nIndices++] = vid - div;
                    indices[nIndices++] = vid;
                    indices[nIndices++] = vid - 1;
                    indices[nIndices++] = vid - div - 1;
                    indices[nIndices++] = vid;
                    nIndices += 6;
                }
                ++vid;
            }
        }
    }

    // residual
    appendBatch(indices, primVars, nIndices, vid);

}

function tessellate()
{
    if (model == null) return;

    var evaluator = new PatchEvaluator(model.maxValence);
    var vid = 0;

    for (var i = 0; i < model.batches.length; ++i) {
        var batch = model.batches[i];
        var pid = 0;
        var uvid = 0;

        for (var j = 0; j < batch.nPoints; ++j) {
            var patchIndex = batch.uvData[uvid+7];

            var u = batch.uvData[uvid+0];
            var v = batch.uvData[uvid+1];

            var field0 = model.patchParams[patchIndex*2+0];
            var field1 = model.patchParams[patchIndex*2+1];
            var boundary   = ((field1 >>  8) & 0xf);

            pn = evaluator.evalBSpline(model.patches, patchIndex, u, v, boundary);

            batch.pData[pid+0] = pn[0][0];
            batch.pData[pid+1] = pn[0][1];
            batch.pData[pid+2] = pn[0][2];
            batch.pData[pid+3] = pn[1][0];
            batch.pData[pid+4] = pn[1][1];
            batch.pData[pid+5] = pn[1][2];

            pid += 6; // xyz, normal
            uvid += 12; // uv, color
        }
        finalizeBatches(batch);
    }
}

function refine()
{
    if (model == null) return;

    var nStencils = model.stencils.length/2;
    for (i = 0; i < nStencils; ++i) {
        // apply stencil
        var x = 0, y = 0, z = 0;
        var size = model.stencils[i*2+0];
        var ofs = model.stencils[i*2+1];
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
}

function idle()
{
    if (model == null) return;

    if (app.animation) {
        time = time + 0.1;
    } else {
        time = 0;
    }
    animate(time);
    updateGeom();
}

function drawModel(programs)
{
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.enableVertexAttribArray(3);
    gl.enableVertexAttribArray(4);

    if (app.IsGPU()) {
        ext.vertexAttribDivisorANGLE(1, 1);
        ext.vertexAttribDivisorANGLE(2, 1);
        ext.vertexAttribDivisorANGLE(3, 1);
        ext.vertexAttribDivisorANGLE(4, 1);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, model.vTexture);

        // bspline patches
        if (programs.bsplineProgram) {
            gl.useProgram(programs.bsplineProgram);

            setUniforms(programs.bsplineProgram);
            gl.uniform1f(gl.getUniformLocation(programs.bsplineProgram, "patchRes"),
                         model.nPatchRes);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, model.patchIndexTexture);

            drawTris += drawPatches(model.bsplineInstanceData);
        }

        ext.vertexAttribDivisorANGLE(1, 0);
        ext.vertexAttribDivisorANGLE(2, 0);
        ext.vertexAttribDivisorANGLE(3, 0);
        ext.vertexAttribDivisorANGLE(4, 0);
    } else {
        gl.useProgram(programs.triProgram);

        camera.setMatrixUniforms(programs.triProgram);
        setUniforms(programs.triProgram);

        for (var i = 0; i < model.batches.length; ++i) {
            var batch = model.batches[i];
            if (batch.vboUnvarying == null) continue;

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
            gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 6*4, 0);    // XYZ
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6*4, 3*4);  // normal
            gl.bindBuffer(gl.ARRAY_BUFFER, batch.vboUnvarying);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 12*4, 0);  // uv, iuiv
            gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 12*4, 4*4); // color, patchIndex
            gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 12*4, 8*4); // ptexFace, ptexU, ptexV

            gl.drawElements(gl.TRIANGLES, batch.nTris*3, gl.UNSIGNED_SHORT, 0);

            drawTris += batch.nTris;
        }
    }
    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    gl.disableVertexAttribArray(4);
}

function redraw()
{
    if (model == null || model.patches == null) return;

    gl.clearColor(.1, .1, .2, 1);
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
    camera.computeMatrixUniforms();

    // draw grid
    glUtil.drawGrid(camera.mvpMatrix);

    // draw hull
    if (app.hull && cageProgram != null && model.cageLines != null) {
        gl.useProgram(cageProgram);
        camera.setMatrixUniforms(cageProgram);

        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.hullIndices);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.LINES, model.cageLines.length, gl.UNSIGNED_SHORT, 0);
    }

    // draw subdiv
    drawTris = 0;

    if (app.IsGPU()) {
        if (model.bsplineInstanceData == null) return;
        prepareBatch(camera.mvpMatrix, camera.proj, camera.aspect);
    }

    // bind uv buffer and texels
    if (model.uv) {
        if (model.uv.texture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, model.uv.texture);
        }
        if (model.uvColor.texture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, model.uvColor.texture);
        }
        if (model.uvDisplacement.texture) {
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, model.uvDisplacement.texture);
        }
    }

    if (drawPrograms) drawModel(drawPrograms);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, null);


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

function GetTessLevels(p0, p1, p2, p3, level, transition,
                       mvpMatrix, projection)
{
    var s = level*level*2;

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
    d0 = Math.max(1, s*Math.abs(d0 * projection[5] / c0[3]));
    d1 = Math.max(1, s*Math.abs(d1 * projection[5] / c1[3]));
    d2 = Math.max(1, s*Math.abs(d2 * projection[5] / c2[3]));
    d3 = Math.max(1, s*Math.abs(d3 * projection[5] / c3[3]));

    var t0 = Math.ceil(Math.log(d0)*1.442695040888963407);
    var t1 = Math.ceil(Math.log(d1)*1.442695040888963407);
    var t2 = Math.ceil(Math.log(d2)*1.442695040888963407);
    var t3 = Math.ceil(Math.log(d3)*1.442695040888963407);
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
    if ((transition & 1) != 0 && t3 == 0) t3 = 1;
    if ((transition & 2) != 0 && t2 == 0) t2 = 1;
    if ((transition & 4) != 0 && t1 == 0) t1 = 1;
    if ((transition & 8) != 0 && t0 == 0) t0 = 1;

    // align to max
    var tess = t0 > t1 ? t0 : t1;
    tess = t2 > tess ? t2 : tess;
    tess = t3 > tess ? t3 : tess;

    return [tess, t0, t1, t2, t3];
}

function prepareBatch(mvpMatrix, projection, aspect)
{
    var evaluator = new PatchEvaluator(model.maxValence);

    var nPatches = model.patches.length/16;

    // level buckets
    for (var d = 0; d < 8; ++d) {
        model.bsplineInstanceData[d] = new Float32Array(nPatches*16);
        model.bsplineInstanceData[d].nPatches = 0;
    }

    var p0 = vec4.fromValues(0,0,0,1);
    var p1 = vec4.fromValues(0,0,0,1);
    var p2 = vec4.fromValues(0,0,0,1);
    var p3 = vec4.fromValues(0,0,0,1);

    // bspline patches
    var gpuAdaptive = app.kernel == "GPU Adaptive";
    for (var i = 0; i < nPatches; ++i) {
        var field0 = model.patchParams[i*2+0];
        var field1 = model.patchParams[i*2+1];

        var depth      = (field1 & 0xf);
        var transition = ((field0 >> 28) & 0xf);
        var boundary   = ((field1 >>  8) & 0xf);

        var type     = 0; //model.patchParams[i*8+2];
        var pattern  = 0; //model.patchParams[i*8+3];
        var rotation = 0;
        var level = app.tessFactor;
        var color = getPatchColor(transition, boundary);

        var t = Math.max(0, app.tessFactor - depth);
        var tessLevels = [t, t, t, t, t];
        if (gpuAdaptive) {
            // adaptive tessellation based on the limit length
            vec3.copy(p0, evaluator.evalBSplineP(model.patches, i, 0, 0));
            vec3.copy(p1, evaluator.evalBSplineP(model.patches, i, 1, 0));
            vec3.copy(p2, evaluator.evalBSplineP(model.patches, i, 0, 1));
            vec3.copy(p3, evaluator.evalBSplineP(model.patches, i, 1, 1));
            tessLevels = GetTessLevels(p0, p1, p2, p3, level,
                                       transition,
                                       mvpMatrix, projection);
        } else {
            // uniform tessellation
            if (tessLevels[0] == 0) {
                if ((transition & 1) != 0) {
                    tessLevels[0] = 1;
                    tessLevels[4] = 1;
                }
                if ((transition & 2) != 0) {
                    tessLevels[0] = 1;
                    tessLevels[3] = 1;
                }
                if ((transition & 4) != 0) {
                    tessLevels[0] = 1;
                    tessLevels[2] = 1;
                }
                if ((transition & 8) != 0) {
                    tessLevels[0] = 1;
                    tessLevels[1] = 1;
                }
            }
        }
        var tess = tessLevels[0];
        if (tess < 0) continue;

        var data = model.bsplineInstanceData[tess];
        var index = data.nPatches*16;
        // TODO: frustum culling ?
        data[index++] = i;
        data[index++] = 1 << tess;
        data[index++] = depth;
        data[index++] = boundary;
        data[index++] = 1 << (tess-tessLevels[1]);
        data[index++] = 1 << (tess-tessLevels[2]);
        data[index++] = 1 << (tess-tessLevels[3]);
        data[index++] = 1 << (tess-tessLevels[4]);
        data[index++] = color[0];
        data[index++] = color[1];
        data[index++] = color[2];
        data[index++] = 1.0;
        data[index++] = 0;
        data[index++] = 0;
        data[index++] = 0;
        data[index++] = 0;
        data.nPatches++;
    }

    if (!model.instanceVBO) {
        model.instanceVBO = gl.createBuffer();
    }
}

function drawPatches(instanceData)
{
    // draw by patch level
    var nTris = 0;
    for (var d = 0; d < instanceData.length; ++d) {
        var nPatches = instanceData[d].nPatches;
        if (nPatches == 0) continue;
        var tessMesh = model.tessMeshes[d];

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4*4, 0);  // uv, iuiv

        gl.bindBuffer(gl.ARRAY_BUFFER, model.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, instanceData[d], gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16*4, 0);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16*4, 4*4);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16*4, 8*4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 16*4, 12*4);

        ext.drawElementsInstancedANGLE(gl.TRIANGLES,
                                      tessMesh.numTris*3,
                                      gl.UNSIGNED_SHORT,
                                      0, nPatches);

        nTris += tessMesh.numTris * nPatches;
    }
    return nTris;
}

function sculpt(x, y)
{
    textureDraw(x, y, sculptPrograms, model.uvDisplacement);
}
function paint(x, y)
{
    textureDraw(x, y, paintPrograms, model.uvColor);
}

function textureDraw(x, y, programs, tex)
{
    if (!tex || !tex.texture) return;
    var dim = tex.dim;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, tex.texture, 0);

    gl.viewport(0, 0, dim[0], dim[1]);

    var canvas = $('#main');
    var w = canvas.width();
    var h = canvas.height();
    paintInfo.pos[0] = 2.0 * (x / w) - 1.0;
    paintInfo.pos[1] = 1.0 - 2.0 * (y / h);

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // bind uv buffer
    if (model.uv) {
        if (model.uv.texture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, model.uv.texture);
        }
        if (model.uvColor.texture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, model.uvColor.texture);
        }
        if (model.uvDisplacement.texture) {
//            gl.activeTexture(gl.TEXTURE4);
//            gl.bindTexture(gl.TEXTURE_2D, model.uvDisplacement.texture);
        }
    }

    if (paintPrograms) drawModel(programs);

    gl.disable(gl.BLEND);

    gl.useProgram(null);

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function loadModel(modelName)
{
    var url = "../objs/" + modelName + ".obj";
    var xhr = new XMLHttpRequest();
    var now = new Date();
    xhr.open('GET', url + "?"+now.getTime(), true);

    $("#status").text("Loading model "+modelName);
    console.log(url);
    xhr.onload = function(e) {
        mesh.modelName = modelName;
        mesh.data = this.response;
        setTimeout(function(){
            mesh.rebuild();
            $("#status").text("");
        }, 0);

/*
        var data = eval("("+this.response+")");
        $("#status").text("Building mesh...");
        setTimeout(function(){
            setModel(data.model, modelName);
            initShaders();
            redraw();
            $("#status").text("");

            // credit XXX: put into json.
            if (modelName == "scorpion") {
                $("#credit").text("\"re-scorpion\" (C) 2009 Kenichi Nishida");
            } else if (modelName == "barbarian") {
                $("#credit").text("\"Turtle Barbarian\" (C) 2011 Jesse Sandifer");
            } else {
                $("#credit").text("");
            }
        }, 0);
*/
    }
    xhr.send();
}

mesh.rebuild = function() {
    var data = eval("("+toJS(mesh.data, app.level)+")");
//    console.log(data.model);

    setModel(data.model, this.modelName);
    initShaders();
    redraw();
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

    // initialize WebGL
    $.each(["webgl2", "experimental-webgl2", "webgl", "experimental-webgl", "webkit-3d", "moz-webgl"], function(i, name){
        try {
            gl = canvas.getContext(name);
        }
        catch (e) {
        }
        return !gl;
    });
    if (!gl) {
        alert("WebGL is not supported in this browser!");
        return;
    }
    OES_standard_derivatives =
        gl.getExtension('OES_standard_derivatives');
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
//        alert("requires ANGLE_instanced_arrays");
    }

    if (navigator.userAgent.indexOf('Android') >= 0 ||
        navigator.userAgent.indexOf('iPhone') >= 0) {
        mobile = true;
    }

    // URL parameters
    var tess = getUrlParameter("tessFactor");
    if (tess != undefined) {
        app.tessFactor = tess;
    }
    var dmode = getUrlParameter("displayMode");
    if (dmode != undefined) {
        app.displayMode = dmode;
    }
    var modelName = getUrlParameter("model");
    if (modelName != undefined) {
        app.model = modelName;
    }

    // Emscripten interface
    toJS = Module.cwrap('toJS', 'string', ['string', 'number']);

    // GUI build
    var gui = new dat.GUI();

    // kernel select
    gui.add(app, 'kernel', ['JS',
                            'GPU Uniform',
                            'GPU Adaptive'])
        .onChange(function(value) {
            $("#status").text("Initializing mesh...");
            setTimeout(function(){
                initGeom();
                updateGeom();
                $("#status").text("");
            }, 0);
        });

    // isolation levels
    gui.add(app, 'level', 1, 8)
        .step(1)
        .onChange(function(value) {
            $("#status").text("Initializing mesh...");
            setTimeout(function(){
                mesh.rebuild();
                $("#status").text("");
            }, 0);
        });

    // tess factor
    gui.add(app, 'tessFactor', 1, 7)
        .step(1)
        .onChange(function(value) {
            $("#status").text("Initializing mesh...");
            setTimeout(function(){
                initGeom();
                updateGeom();
                $("#status").text("");
            }, 0);
        });

    // display style
    var displayMode = gui.add(app, 'displayMode', {Shade : 0,
                                                   Patch : 1,
                                                   Wire : 2,
                                                   Normal : 3,
                                                   Coord : 4})
        .onChange(function(value) {
            initShaders();
            redraw();
        });

    //
    gui.add(app, 'animation')
        .onChange(function(value){
            if (value) {
                interval = setInterval(idle, 16);
            } else {
                clearInterval(interval);
                interval = null;
                idle();
            }
            redraw();
        });

    gui.add(app, 'hull')
        .onChange(function(value) {
            redraw();
        });

    // displace scale
    gui.add(app, 'displacement', 0, 2)
        .onChange(function(value){
            redraw();
        });

    // model menu
    gui.add(app, 'model',
            ['catmark_tet',
             'catmark_cube',
             'catmark_cube_corner0',
             'catmark_cube_corner1',
             'catmark_cube_corner2',
             'catmark_cube_corner3',
             'catmark_cube_corner4',
             'catmark_cube_creases0',
             'catmark_cube_creases1',
             'catmark_cube_creases2',
             'catmark_dart_edgecorner',
             'catmark_dart_edgeonly',
             'catmark_edgecorner',
             'catmark_edgeonly',
             'catmark_fan',
             'catmark_flap',
             'catmark_flap2',
             'catmark_fvar_bound0',
             'catmark_fvar_bound1',
             'catmark_fvar_bound2',
             'catmark_gregory_test0',
             'catmark_gregory_test1',
             'catmark_gregory_test2',
             'catmark_gregory_test3',
             'catmark_gregory_test4',
             'catmark_gregory_test6',
             'catmark_gregory_test7',
             'catmark_pyramid_creases0',
             'catmark_pyramid_creases1',
             'catmark_pyramid_creases2',
             'catmark_torus',
             'catmark_torus_creases0',
             'catmark_chaikin0',
             'catmark_chaikin1',
             'catmark_chaikin2',
             'catmark_hole_test1',
             'catmark_hole_test2',
             'catmark_hole_test3',
             'catmark_hole_test4',
             'catmark_tent_creases0',
             'catmark_tent_creases1',
             'catmark_tent',
             'catmark_helmet',
             'catmark_car',
             'catmark_bishop',
             'catmark_rook',
             'catmark_pawn',
             'scorpion',
             'barbarian'])
        .onChange(function(value){
            loadModel(value);
            redraw();
        });

    // paint color
    gui.addColor(app, 'paintColor');

    // mode (tmp)
    $( "#toolbox" ).buttonset().addClass("ui-buttonset-vertical")
        .find( "label" ).removeClass( "ui-corner-left ui-corner-right" )
        .on( "mouseenter", function( e ) {
            $( this ).next().next().addClass( "ui-transparent-border-top" );
        })
        .on( "mouseleave", function( e ) {
            $( this ).next().next().removeClass( "ui-transparent-border-top" );
        })
        .filter( ":first" ).addClass( "ui-corner-top" )
        .end()
        .filter( ":last" ).addClass( "ui-corner-bottom" );
    $("#toolbox :radio").click(function(e) {
        if (this.id == "toolCamera") {
            camera.override = null;
        } else if (this.id == "toolPaint") {
            camera.override = paint;
            app.displayMode = 0;
            initShaders();
            redraw();
            displayMode.updateDisplay();
        } else if (this.id == "toolSculpt") {
            app.sculptValue = 2.0;
            camera.override = sculpt;
        } else if (this.id == "toolRevert") {
            app.sculptValue = 0.0;
            camera.override = sculpt;
        }
    });

    $("#version").text(version);

    // events
    camera.bindControl("#main", redraw);

    document.oncontextmenu = function(e){ return false; }

    loadModel(app.model);

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
});

