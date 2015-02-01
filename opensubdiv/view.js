//
//   Copyright 2014 Takahito Tejima (tejimaya@gmail.com)
//
//

var version = "last updated:2015/01/31-22:16:59"

var app = {
    IsGPU : function() {
        return (this.kernel == "GPU Uniform" || this.kernel == "GPU Adaptive");
    },
    kernel : 'GPU Uniform',
    tessFactor : 3,
    displayMode : 2,
    animation : false,
    hull : false,
    displacement:  0,
    model : 'cube',
    sculpt : false
};

var time = 0;
var model = {};
var usePtexColor = false;
var usePtexDisplace = false;
var dpr = 1;
var displaceScale = 0;

var framebuffer = null;

var prevTime = 0;
var fps = 0;
var ext = null;

var cageProgram = null;

var drawPrograms = null;
var paintPrograms = null;

var interval = null;

var paintInfo = {
    pos : [0, 0]
};

var floatFilter = 0;
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
    if (usePtexColor) define += "#define PTEX_COLOR\n";
    if (usePtexDisplace) define += "#define PTEX_DISPLACE\n";
    if (displaceScale > 0) define += "#define DISPLACEMENT 1\n";

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

function setDisplacementScale(scale)
{
    if ((displaceScale == 0 && scale > 0) ||
        (displaceScale > 0 && scale == 0)) {
        displaceScale = scale;
        initShaders();
    } else {
        displaceScale = scale;
    }
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

    if (model.dimPtexColorL) {
        location = gl.getUniformLocation(program, "texPtexColor");
        if (location)
            gl.uniform1i(location, 2);
        location = gl.getUniformLocation(program, "texPtexColorL");
        if (location)
            gl.uniform1i(location, 3);
        location = gl.getUniformLocation(program, "dimPtexColorL");
        if (location)
            gl.uniform2f(location, model.dimPtexColorL[0], model.dimPtexColorL[1]);
    }
    if (model.dimPtexDisplaceL) {
        location = gl.getUniformLocation(program, "texPtexDisplace");
        if (location)
            gl.uniform1i(location, 4);
        location = gl.getUniformLocation(program, "texPtexDisplaceL");
        if (location)
            gl.uniform1i(location, 5);
        location = gl.getUniformLocation(program, "dimPtexDisplaceL");
        if (location)
            gl.uniform2f(location, model.dimPtexDisplaceL[0], model.dimPtexDisplaceL[1]);
    }

    // appearance
    if (program.displayMode)
        gl.uniform1i(program.displayMode, app.displayMode);

    location = gl.getUniformLocation(program, "displaceScale")
    if (location)
        gl.uniform1f(location, displaceScale);

    // paint
    location = gl.getUniformLocation(program, "paintPos");
    if (location)
        gl.uniform2f(location, paintInfo.pos[0], paintInfo.pos[1]);
}

function initShaders()
{
    var common = getShaderSource("shaders/common.glsl");

    // cage program
    if (cageProgram != null) gl.deleteProgram(cageProgram);
    cageProgram = buildProgram(common+getShaderSource("shaders/cage.glsl"),
                              { position: 0 });
    cageProgram.mvpMatrix = gl.getUniformLocation(cageProgram, "mvpMatrix");

    // surface drawing programs
    drawPrograms = {};

    // triangle
    var triProgram = buildProgram(common+getShaderSource("shaders/triangle.glsl"),
                                  { position : 0,
                                    inNormal : 1,
                                    inUV : 2,
                                    inColor : 3,
                                    inPtexCoord : 4});
    triProgram.mvpMatrix = gl.getUniformLocation(triProgram, "mvpMatrix");
    triProgram.modelViewMatrix = gl.getUniformLocation(triProgram, "modelViewMatrix");
    triProgram.projMatrix = gl.getUniformLocation(triProgram, "projMatrix");
    triProgram.displayMode = gl.getUniformLocation(triProgram, "displayMode");
    drawPrograms.triProgram = triProgram;

    // bspline
    var tessProgram = buildProgram(common+getShaderSource("shaders/bspline.glsl"),
                              { inUV : 0,
                                patchData : 1,
                                tessLevel : 2,
                                inColor : 3,
                                ptexParam : 4 });
    tessProgram.mvpMatrix = gl.getUniformLocation(tessProgram, "mvpMatrix");
    tessProgram.modelViewMatrix = gl.getUniformLocation(tessProgram, "modelViewMatrix");
    tessProgram.projMatrix = gl.getUniformLocation(tessProgram, "projMatrix");
    tessProgram.displayMode = gl.getUniformLocation(tessProgram, "displayMode");
    drawPrograms.bsplineProgram = tessProgram;


    // gregory
    var gregoryProgram = buildProgram(common+getShaderSource("shaders/gregory.glsl"),
                                  { inUV : 0,
                                    patchData : 1,
                                    tessLevel : 2,
                                    inColor : 3,
                                    ptexParam : 4 });
    gregoryProgram.mvpMatrix = gl.getUniformLocation(gregoryProgram, "mvpMatrix");
    gregoryProgram.modelViewMatrix = gl.getUniformLocation(gregoryProgram, "modelViewMatrix");
    gregoryProgram.projMatrix = gl.getUniformLocation(gregoryProgram, "projMatrix");
    gregoryProgram.displayMode = gl.getUniformLocation(gregoryProgram, "displayMode");
    drawPrograms.gregoryProgram = gregoryProgram;

    // ptex painting programs
    paintPrograms = {};

    // triangle
    var paintdef = "#define PAINT\n";
    var triProgram = buildProgram(paintdef+common+getShaderSource("shaders/triangle.glsl"),
                                  { position : 0,
                                    inNormal : 1,
                                    inUV : 2,
                                    inColor : 3,
                                    inPtexCoord : 4});
    triProgram.mvpMatrix = gl.getUniformLocation(triProgram, "mvpMatrix");
    triProgram.modelViewMatrix = gl.getUniformLocation(triProgram, "modelViewMatrix");
    triProgram.projMatrix = gl.getUniformLocation(triProgram, "projMatrix");
    triProgram.displayMode = gl.getUniformLocation(triProgram, "displayMode");
    paintPrograms.triProgram = triProgram;

    // bspline
    var tessProgram = buildProgram(paintdef+common+
                                   getShaderSource("shaders/bspline.glsl"),
                                   { inUV : 0,
                                     patchData : 1,
                                     tessLevel : 2,
                                     inColor : 3,
                                     ptexParam : 4 });
    tessProgram.mvpMatrix = gl.getUniformLocation(tessProgram, "mvpMatrix");
    tessProgram.modelViewMatrix = gl.getUniformLocation(tessProgram, "modelViewMatrix");
    tessProgram.projMatrix = gl.getUniformLocation(tessProgram, "projMatrix");
    tessProgram.displayMode = gl.getUniformLocation(tessProgram, "displayMode");
    paintPrograms.bsplineProgram = tessProgram;
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

    // framebuffer prep
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    framebuffer = gl.createFramebuffer();

    // PTEX read
    usePtexColor = false;
    usePtexDisplace = false;
    if (data.ptexDim_color != undefined) {
        usePtexColor = true;
        model.ptexDim_color = data.ptexDim_color;
        model.ptexLayout_color = data.ptexLayout_color;
        var now = new Date();

        // ptex layout
        var numPtexFace = model.ptexLayout_color.length/6;
        model.dimPtexColorL = [512, Math.ceil(numPtexFace/512)];
        model.ptexNumFace_color = numPtexFace;
        var layout = new Float32Array(4*model.dimPtexColorL[0]*model.dimPtexColorL[1]);
        var dim = model.ptexDim_color;
        for (var i = 0; i < numPtexFace; ++i) {
            layout[i*4+0] = model.ptexLayout_color[i*6 + 2]/dim[0];
            layout[i*4+1] = model.ptexLayout_color[i*6 + 3]/dim[1];
            var wh = model.ptexLayout_color[i*6 + 5];
            layout[i*4+2] = ((1<<(wh >> 8)))/(dim[0]);
            layout[i*4+3] = ((1<<(wh & 0xff)))/(dim[1]);
        }

        model.ptexTexture_colorL = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_colorL);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                      model.dimPtexColorL[0],
                      model.dimPtexColorL[1],
                      0, gl.RGBA, gl.FLOAT, layout);

        // ptex texel
        var image = new Image();
        image.onload = function() {
            model.ptexTexture_color = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_color);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

            model.dimPtexColor = [image.width, image.height];

            redraw();
        }
        image.src = "./objs/"+modelName+"_color.png?"+now.getTime();
    }
    if (data.ptexDim_displace != undefined) {
        usePtexDisplace = true;
        model.ptexDim_displace = data.ptexDim_displace;
        model.ptexLayout_displace = data.ptexLayout_displace;
        var now = new Date();

        // ptex layout
        var numPtexFace = model.ptexLayout_displace.length/6;
        model.dimPtexDisplaceL = [512, Math.ceil(numPtexFace/512)];
        model.ptexNumFace_displace = numPtexFace;
        var layout = new Float32Array(4*model.dimPtexDisplaceL[0]*model.dimPtexDisplaceL[1]);
        var dim = model.ptexDim_displace;
        for (var i = 0; i < numPtexFace; ++i) {
            layout[i*4+0] = model.ptexLayout_displace[i*6 + 2]/dim[0];
            layout[i*4+1] = model.ptexLayout_displace[i*6 + 3]/dim[1];
            var wh = model.ptexLayout_displace[i*6 + 5];
            layout[i*4+2] = ((1<<(wh >> 8)))/(dim[0]);
            layout[i*4+3] = ((1<<(wh & 0xff)))/(dim[1]);
        }

        model.ptexTexture_displaceL = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_displaceL);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                      model.dimPtexDisplaceL[0],
                      model.dimPtexDisplaceL[1],
                      0, gl.RGBA, gl.FLOAT, layout);

        // ptex texel
        var xhr = new XMLHttpRequest();
        xhr.open('GET', "./objs/"+modelName+"_displace.raw?"+now.getTime(), true);
        xhr.responseType = "arraybuffer";

        xhr.onload = function(e) {
            // expand to RGB (unfortunately)
            var w = model.ptexDim_displace[0];
            var h = model.ptexDim_displace[1];
            var fdata = new Float32Array(this.response);
            var data = new Float32Array(w*h*3);
            for (var i = 0; i < w*h; ++i) {
                data[i*3+0] = fdata[i];
                data[i*3+1] = fdata[i];
                data[i*3+2] = fdata[i];
            }

            model.ptexTexture_displace = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_displace);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, true);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, floatFilter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, floatFilter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, w, h,
                          0, gl.RGB, gl.FLOAT, data);
        }
        xhr.send();
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
        model.gregoryInstanceData = [];
    } else {
        model.batches = [];
        tessellateIndexAndUnvarying(model.patches, model.patchParams, false, 0);
        tessellateIndexAndUnvarying(model.gregoryPatches, model.patchParams,
                                    true, model.patches.length/16);
    }
}

function updateGeom()
{
    refine();
    evalGregory();

    if (app.IsGPU()) {
        uploadRefinedVerts();
    } else {
        tessellate();
    }
    redraw();
}

function appendBatch(indices, primVars, nIndices, nPoints, gregory)
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
    batch.gregory = gregory;

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

function getPtexPacking(ret, layout, dim, ptexFace)
{
    var ptexX = (layout[ptexFace*6 + 2]) / (dim[0]);
    var ptexY = (layout[ptexFace*6 + 3]) / (dim[1]);
    var wh = layout[ptexFace*6 + 5];
    var ptexW = ((1<<(wh >> 8)))/(dim[0]);
    var ptexH = ((1<<(wh & 0xff)))/(dim[1]);
    vec4.set(ret, ptexX, ptexY, ptexW, ptexH);
}

function getPtexCoord(ret, u, v, ptexU, ptexV, ptexPacking, ptexRot, depth)
{
    var lv = 1 << depth;
    var pu = v;
    var pv = u;
    if (ptexRot == 1) {
        pu = 1-u;
        pv = v;
    } else if (ptexRot == 2){
        pu = 1-v;
        pv = 1-u;
    } else if (ptexRot == 3){
        pu = u;
        pv = 1-v;
    }
    pu = pu / lv + ptexU/lv;
    pv = pv / lv + ptexV/lv;
    pu = ptexPacking[0] + pu * ptexPacking[2];
    pv = ptexPacking[1] + pv * ptexPacking[3];
    vec2.set(ret, pu, pv);
}

function tessellateIndexAndUnvarying(patches, patchParams, gregory, patchOffset)
{
    if (patches == null) return;

    var indices = new Uint16Array(10*65536);
    var primVars = new Float32Array(12*65536);
    var vid = 0;
    var nIndices = 0;
    var edgeparams = [[0,0],[1,0],[0,1]];

    var nPatches = gregory ? patches.length/4 : patches.length/16;

    var ptexPackingColor = vec4.create();
    var ptexPackingDisplace = vec4.create();
    var ptexCoordColor = vec2.create();
    var ptexCoordDisplace = vec2.create();

    for (var i = 0; i < nPatches; ++i) {
        // patchparam: depth, ptexRot, type, pattern, rotation
        var patchIndex = i + patchOffset;
        if (patchIndex*8 >= patchParams.length) continue;
        var depth    = patchParams[patchIndex*8+0];
        var type     = patchParams[patchIndex*8+2];
        var pattern  = patchParams[patchIndex*8+3];
        var rotation = patchParams[patchIndex*8+4];
        var ptexRot  = patchParams[patchIndex*8+1];

        var ncp = 16;
        if (type == 10 || type == 11) ncp = 4;
        else if (patches[i*16+9] == -1) ncp = 9;
        else if (patches[i*16+12] == -1) ncp = 12;

        if (vid > 40000) {
            appendBatch(indices, primVars, nIndices, vid, gregory);
            nIndices = 0;
            vid = 0;
        }

        var level = app.tessFactor - depth;
        var color = getPatchColor(type, pattern);

        var ptexU = patchParams[patchIndex*8+5];
        var ptexV = patchParams[patchIndex*8+6];
        var ptexFace = patchParams[patchIndex*8+7];

        // resolve ptex coordinate here!
        if (model.ptexLayout_color != undefined) {
            getPtexPacking(ptexPackingColor,
                           model.ptexLayout_color,
                           model.ptexDim_color,
                           ptexFace);
        }
        if (model.ptexLayout_displace != undefined) {
            getPtexPacking(ptexPackingDisplace,
                           model.ptexLayout_displace,
                           model.ptexDim_displace,
                           ptexFace);
        }

        if (level <= 0 && pattern != 0) {
            // under tessellated transition patch. need triangle patterns.
            var params = getTransitionParams(pattern-1, rotation);
            for (var j = 0; j < params.length; ++j) {
                var u = params[j][0];
                var v = params[j][1];
                var iu = edgeparams[j%3][0];
                var iv = edgeparams[j%3][1];

                getPtexCoord(ptexCoordColor,
                             u, v, ptexU, ptexV,
                             ptexPackingColor, ptexRot, depth);
                getPtexCoord(ptexCoordDisplace,
                             u, v, ptexU, ptexV,
                             ptexPackingDisplace, ptexRot, depth);

                // gregory patch requires relative index for patchIndex
                primVars[vid*12+0] = u;
                primVars[vid*12+1] = v;
                primVars[vid*12+2] = iu;
                primVars[vid*12+3] = iv;
                primVars[vid*12+4] = color[0];
                primVars[vid*12+5] = color[1];
                primVars[vid*12+6] = color[2];
                primVars[vid*12+7] = i;
                primVars[vid*12+8] = ptexCoordColor[0];
                primVars[vid*12+9] = ptexCoordColor[1];
                primVars[vid*12+10] = ptexCoordDisplace[0];
                primVars[vid*12+11] = ptexCoordDisplace[1];
                indices[nIndices++] = vid++;
            }
        } else {
            if (level < 0) level = 0;
            var div = (1 << level) + 1;

            for (iu = 0; iu < div; iu++) {
                for (iv = 0; iv < div; iv++) {
                    var u = iu/(div-1);
                    var v = iv/(div-1);

                    getPtexCoord(ptexCoordColor,
                                 u, v, ptexU, ptexV,
                                 ptexPackingColor, ptexRot, depth);
                    getPtexCoord(ptexCoordDisplace,
                                 u, v, ptexU, ptexV,
                                 ptexPackingDisplace, ptexRot, depth);

                    primVars[vid*12+0] = u;
                    primVars[vid*12+1] = v;
                    primVars[vid*12+2] = iu;
                    primVars[vid*12+3] = iv;
                    primVars[vid*12+4] = color[0];
                    primVars[vid*12+5] = color[1];
                    primVars[vid*12+6] = color[2];
                    primVars[vid*12+7] = i;
                    primVars[vid*12+8] = ptexCoordColor[0];
                    primVars[vid*12+9] = ptexCoordColor[1];
                    primVars[vid*12+10] = ptexCoordDisplace[0];
                    primVars[vid*12+11] = ptexCoordDisplace[1];
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
    }

    // residual
    appendBatch(indices, primVars, nIndices, vid, gregory);

}

function tessellate() {
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

            if (batch.gregory) {
                pn  = evaluator.evalGregoryBasis(model.gregoryEvalVerts,
                                                 patchIndex,
                                                 u, v);
            } else {
                pn = evaluator.evalBSpline(model.patches,
                                           patchIndex, u, v);
            }

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
}

function idle() {

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

        // gregory patches
        if (programs.gregoryProgram) {
            gl.useProgram(programs.gregoryProgram);

            setUniforms(programs.gregoryProgram);
            gl.uniform2f(gl.getUniformLocation(programs.gregoryProgram, "patchRes"),
                         model.nGregoryPatchRes[0], model.nGregoryPatchRes[1]);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, model.gregoryPatchIndexTexture);

            drawTris += drawPatches(model.gregoryInstanceData);
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

    // bind ptexs if exist
    if (model.ptexTexture_color != undefined) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_color);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_colorL);
    }
    if (model.ptexTexture_displace != undefined) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_displace);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, model.ptexTexture_displaceL);
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

function GetTessLevels(p0, p1, p2, p3, level,
                       pattern, rotation,
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

    var nPatches = model.patches.length/16;
    var nGregoryPatches = model.gregoryPatches.length/4;

    // level buckets
    for (var d = 0; d < 8; ++d) {
        model.bsplineInstanceData[d] = new Float32Array(nPatches*16);
        model.gregoryInstanceData[d] = new Float32Array(nGregoryPatches*16);
        model.bsplineInstanceData[d].nPatches = 0;
        model.gregoryInstanceData[d].nPatches = 0;
    }

    var p0 = vec4.fromValues(0,0,0,1);
    var p1 = vec4.fromValues(0,0,0,1);
    var p2 = vec4.fromValues(0,0,0,1);
    var p3 = vec4.fromValues(0,0,0,1);

    // bspline patches
    var gpuAdaptive = app.kernel == "GPU Adaptive";
    for (var i = 0; i < nPatches; ++i) {
        var depth = model.patchParams[i*8+0];
        var type     = model.patchParams[i*8+2];
        var pattern  = model.patchParams[i*8+3];
        var rotation = model.patchParams[i*8+4];
        var ptexRot = model.patchParams[i*8+1];
        var ptexU = model.patchParams[i*8+5];
        var ptexV = model.patchParams[i*8+6];
        var ptexFaceIndex = model.patchParams[i*8+7];
        var level = app.tessFactor;
        var color = getPatchColor(type, pattern);
        var t = Math.max(0, app.tessFactor - depth);
        var tessLevels = [t, t, t, t, t];
        if (gpuAdaptive) {
            // clip length
            vec3.copy(p0, evaluator.evalBSplineP(model.patches, i, 0, 0));
            vec3.copy(p1, evaluator.evalBSplineP(model.patches, i, 1, 0));
            vec3.copy(p2, evaluator.evalBSplineP(model.patches, i, 0, 1));
            vec3.copy(p3, evaluator.evalBSplineP(model.patches, i, 1, 1));
            tessLevels = GetTessLevels(p0, p1, p2, p3, level,
                                       pattern, rotation,
                                       mvpMatrix, projection);
        } else {
            if (pattern == 1 && tessLevels[0] == 0) {
                if (rotation == 0) {
                    tessLevels[0]++;
                    tessLevels[4] = 1;
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
        data[index++] = 0;
        data[index++] = 1 << (tess-tessLevels[1]);
        data[index++] = 1 << (tess-tessLevels[2]);
        data[index++] = 1 << (tess-tessLevels[3]);
        data[index++] = 1 << (tess-tessLevels[4]);
        data[index++] = color[0];
        data[index++] = color[1];
        data[index++] = color[2];
        data[index++] = 1.0;
        data[index++] = ptexFaceIndex;
        data[index++] = ptexU;
        data[index++] = ptexV;
        data[index++] = ptexRot;
        data.nPatches++;
    }

    // gregory patches
    var gpuAdaptive = app.kernel == "GPU Adaptive";
    for (var i = 0; i < nGregoryPatches; ++i) {
        var patchIndex = i + nPatches;
        var depth    = model.patchParams[patchIndex*8+0];
        var type     = model.patchParams[patchIndex*8+2];
        var pattern  = model.patchParams[patchIndex*8+3];
        var ptexRot = model.patchParams[patchIndex*8+1];
        var ptexU = model.patchParams[patchIndex*8+5];
        var ptexV = model.patchParams[patchIndex*8+6];
        var ptexFaceIndex = model.patchParams[patchIndex*8+7];
        var t = Math.max(0, app.tessFactor - depth);
        var color = getPatchColor(type, pattern);

        var tessLevels = [t, t, t, t, t];
        if (gpuAdaptive) {
            // clip length
            var pn0 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 0, 0);
            var p0 = vec4.fromValues(pn0[0][0], pn0[0][1], pn0[0][2], 1);
            var pn1 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 1, 0);
            var p1 = vec4.fromValues(pn1[0][0], pn1[0][1], pn1[0][2], 1);
            var pn2 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 0, 1);
            var p2 = vec4.fromValues(pn2[0][0], pn2[0][1], pn2[0][2], 1);
            var pn3 = evaluator.evalGregoryBasis(model.gregoryEvalVerts, i, 1, 1);
            var p3 = vec4.fromValues(pn3[0][0], pn3[0][1], pn3[0][2], 1);

            tessLevels = GetTessLevels(p0, p1, p2, p3, level,
                                       pattern, rotation,
                                       mvpMatrix, projection);
        }

        var tess = tessLevels[0];
        if (tess < 0) continue;

        // TODO: frustum culling ?
        var data = model.gregoryInstanceData[tess];
        var index = data.nPatches*16;

        data[index++] = i;
        data[index++] = 1<<tess;
        data[index++] = depth;
        data[index++] = i;
        data[index++] = 1<<(tess-tessLevels[1]);
        data[index++] = 1<<(tess-tessLevels[2]);
        data[index++] = 1<<(tess-tessLevels[3]);
        data[index++] = 1<<(tess-tessLevels[4]);
        data[index++] = color[0];
        data[index++] = color[1];
        data[index++] = color[2];
        data[index++] = 1.0;
        data[index++] = ptexFaceIndex;
        data[index++] = ptexU;
        data[index++] = ptexV;
        data[index++] = ptexRot;
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

function paint(x, y)
{
    var texture = model.ptexTexture_displace;
    var dim = model.ptexDim_displace;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, texture, 0);

    gl.viewport(0, 0, model.dimPtexColor[0], model.dimPtexColor[1]);

    var canvas = $('#main');
    var w = canvas.width();
    var h = canvas.height();
    paintInfo.pos[0] = 2.0 * (x / w) - 1.0;
    paintInfo.pos[1] = 1.0 - 2.0 * (y / h);

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (paintPrograms) drawModel(paintPrograms);

    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function loadModel(modelName)
{
    var url = "objs/" + modelName + ".json";
    var xhr = new XMLHttpRequest();
    var now = new Date();
    xhr.open('GET', url + "?"+now.getTime(), true);

    $("#status").text("Loading model "+modelName);
    xhr.onload = function(e) {
        var data = eval("("+this.response+")");
        $("#status").text("Building mesh...");
        setTimeout(function(){
            setModel(data.model, modelName);
            initShaders();
            redraw();
            $("#status").text("");

            // credit
            if (modelName == "scorpion") {
                $("#credit").text("\"re-scorpion\" (C) 2009 Kenichi Nishida");
            }
        }, 0);
    }
    xhr.send();
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
    gui.add(app, 'displayMode', {Shade : 0,
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
    gui.add(app, 'displacement', 0, 1).listen()
        .onChange(function(value){
            setDisplacementScale(model.diag*value*0.01);
            redraw();
        });

    // model menu
    gui.add(app, 'model',
            ['cube',
             'scorpion',
             'ptex', 'torus', 'dino', 'face',
             'catmark_cube_creases0',
             'catmark_cube_creases1',
             'catmark_cube_corner0',
             'catmark_cube_corner1',
             'catmark_cube_corner2',
             'catmark_cube_corner3',
             'catmark_dart_edgecorner',
             'catmark_dart_edgeonly',
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
             'catmark_helmet',
             'catmark_car',
             'catmark_bishop',
             'catmark_rook',
             'catmark_pawn',
             'barbarian'])
        .onChange(function(value){
            loadModel(value);
            redraw();
        });

    // mode (tmp)
/*
    gui.add(app, 'sculpt')
        .onChange(function(value){
            if(value) {
                camera.override = paint;
            } else {
                camera.override = null;
            }
        });
*/

    $("#version").text(version);

    // events
    camera.bindControl("#main", redraw);

    document.oncontextmenu = function(e){ return false; }

    loadModel(app.model);

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
});

