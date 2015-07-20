"use strict"

var version = "last updated:2015/07/11-22:58:35"

var toJS;
var gl;
var app = {
    level : 4,
    adaptive : true,
    tessFactor : 5,
    displayMode : 3,
    animation : false,
    hull : false,
    model : 'catmark_tet',
    glExt : null,
    OES_standard_derivatives : false,
    devicePixelRatio : 1
};

var mesh = {
    objfile: "",
    batches: null,
    vTexture: null,
    patchIndexTexture: null
};

var time = 0;
var prevTime = 0;
var fps = 0;
var drawTris = 0;

var cageProgram = null;
var drawPrograms = null;
var interval = null;

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
    if (app.OES_standard_derivatives)
        define += "#extension GL_OES_standard_derivatives : enable\n"
        + "#define HAS_OES_STANDARD_DERIVATIVES\n";
    define += "precision highp float;\n";

    if (navigator.userAgent.indexOf('Android') > 0){
        define += "#define ANDROID\n";
    }

    define += "#define DISPLAY_MODE " + app.displayMode +"\n";

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
        gl.uniform1f(location, mesh.nPointRes);
    location = gl.getUniformLocation(program, "texCP");
    if (location)
        gl.uniform1i(location, 0);
    location = gl.getUniformLocation(program, "texPatch");
    if (location)
        gl.uniform1i(location, 1);
}

function setUniformLocations(program)
{
    var uniforms = ["mvpMatrix", "modelViewMatrix", "projMatrix" ]
    for (var i = 0; i < uniforms.length; ++i) {
        program[uniforms[i]] = gl.getUniformLocation(program, uniforms[i]);
    }
}

function initShaders()
{
    // cage program
    if (cageProgram != null) gl.deleteProgram(cageProgram);
    cageProgram = buildProgram(getShaderSource("shaders/cage.glsl"),
                              { position: 0 });
    setUniformLocations(cageProgram);

    var patchAttribBindings = { inUV : 0,
                                patchData : 1,
                                tessLevel : 2,
                                inColor : 3 };
    // surface drawing programs
    drawPrograms = {};

    // bspline
    var tessProgram = buildProgram(getShaderSource("shaders/bspline.glsl"),
                                   patchAttribBindings);
    setUniformLocations(tessProgram);
    drawPrograms.bsplineProgram = tessProgram;

    // TODO: gregory
}

function deleteModel()
{
    if (mesh == null) return;
    if (mesh.batches == null) return;

    for(var i=0; i<mesh.batches.length; ++i) {
        gl.deleteBuffer(mesh.batches[i].ibo);
        gl.deleteBuffer(mesh.batches[i].vbo);
        gl.deleteBuffer(mesh.batches[i].vboUnvarying);
    }
    mesh.batches = [];

    if (mesh.hullVerts) gl.deleteBuffer(mesh.hullVerts);
    if (mesh.hullIndices) gl.deleteBuffer(mesh.hullIndices);

    if (mesh.vTexture) {
        gl.deleteTexture(mesh.vTexture);
        mesh.vTexture = null;
    }
    if (mesh.patchIndexTexture) {
        gl.deleteTexture(mesh.patchIndexTexture);
        mesh.patchIndexTexture = null;
    }
}

function setModel(data, modelName)
{
    if (data == null) return;

    //console.log(data);

    // XXX: release buffers!
    deleteModel();

    var nCoarseVerts = data.points.length/3;
    var nRefinedVerts = data.stencils.length/2;

    var nTotalVerts = nCoarseVerts + nRefinedVerts;// + nGregoryPatches*20;
    mesh.patchVerts  = new Float32Array(nTotalVerts * 3);

    // control cage
    mesh.animVerts   = new Float32Array(data.points.length)
    mesh.cageVerts   = new Float32Array(data.points.length)
    for (var i = 0; i < data.points.length; i++) {
        mesh.cageVerts[i*3+0] = data.points[i*3+0];
        mesh.cageVerts[i*3+1] = data.points[i*3+1];
        mesh.cageVerts[i*3+2] = data.points[i*3+2];
        mesh.animVerts[i*3+0] = data.points[i*3+0];
        mesh.animVerts[i*3+1] = data.points[i*3+1];
        mesh.animVerts[i*3+2] = data.points[i*3+2];
        mesh.patchVerts[i*3+0] = data.points[i*3+0];
        mesh.patchVerts[i*3+1] = data.points[i*3+1];
        mesh.patchVerts[i*3+2] = data.points[i*3+2];
    }
    mesh.cageLines   = new Int16Array(data.hull.length)
    for (var i = 0; i < data.hull.length; i++) {
        mesh.cageLines[i] = data.hull[i];
    }

    mesh.hullVerts = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.hullVerts);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.animVerts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    var ibuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.cageLines, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    mesh.hullIndices = ibuffer;

    // stencils
    mesh.stencils = data.stencils;
    mesh.stencilIndices = data.stencilIndices;
    mesh.stencilWeights = data.stencilWeights;

    // patch indices
    mesh.patches = data.patches;
    mesh.patchParams = data.patchParams;

    // patch indices texture
    var nPatches = mesh.patches.length/16;
    var r = getPOT(nPatches*16);
    mesh.patchIndexTexture = createTextureBuffer();
    mesh.nPatchRes = r;

    mesh.nPoints = mesh.patchVerts.length/3;
    var r2 = getPOT(mesh.nPoints);
    mesh.nPointRes = r2;

    var dt = mesh.patches;
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

    initGeom();
    updateGeom();
}

function animate(time)
{
    var r = 2 * Math.sin(time);
    for (var i = 0; i < mesh.cageVerts.length; i += 3) {
        var x = mesh.cageVerts[i+0];
        var y = mesh.cageVerts[i+1];
        var z = mesh.cageVerts[i+2];
        mesh.animVerts[i+0] = x * Math.cos(r*y) + z * Math.sin(r*y);
        mesh.animVerts[i+1] = y;
        mesh.animVerts[i+2] = - x * Math.sin(r*y) + z * Math.cos(r*y);
        mesh.patchVerts[i+0] = mesh.animVerts[i+0];
        mesh.patchVerts[i+1] = mesh.animVerts[i+1];
        mesh.patchVerts[i+2] = mesh.animVerts[i+2];
    }

    // hull animation
    if (app.hull) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.hullVerts);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.animVerts, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}

function updateGeom()
{
    refine();
    uploadRefinedVerts();
    redraw();
}

function refine()
{
    if (mesh == null) return;

    var nStencils = mesh.stencils.length/2;
    for (var i = 0; i < nStencils; ++i) {
        // apply stencil
        // TODO: do this in shader
        var x = 0, y = 0, z = 0;
        var size = mesh.stencils[i*2+0];
        var ofs = mesh.stencils[i*2+1];
        for (var j = 0; j < size; j++) {
            var vindex = mesh.stencilIndices[ofs+j];
            var weight = mesh.stencilWeights[ofs+j];
            x += mesh.animVerts[vindex*3+0] * weight;
            y += mesh.animVerts[vindex*3+1] * weight;
            z += mesh.animVerts[vindex*3+2] * weight;
        }
        mesh.patchVerts[mesh.cageVerts.length + i*3+0] = x;
        mesh.patchVerts[mesh.cageVerts.length + i*3+1] = y;
        mesh.patchVerts[mesh.cageVerts.length + i*3+2] = z;
    }
}

function uploadRefinedVerts()
{
    // CP texture update
    var r = mesh.nPointRes;
    if (mesh.vTexture == null) {
        mesh.vTexture = createVertexTexture(r);
    }
    var pv = new Float32Array(r*r*3);
    for (var i = 0; i < mesh.patchVerts.length; ++i) {
        pv[i] = mesh.patchVerts[i];
    }

    gl.bindTexture(gl.TEXTURE_2D, mesh.vTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, r, r,
                         gl.RGB, gl.FLOAT, pv);
}

function initGeom()
{
    mesh.tessMeshes = [];
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

        mesh.tessMeshes.push(tessMesh);
    }
    mesh.bsplineInstanceData = [];
}

function idle()
{
    if (mesh == null) return;

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

    app.glExt.vertexAttribDivisorANGLE(1, 1);
    app.glExt.vertexAttribDivisorANGLE(2, 1);
    app.glExt.vertexAttribDivisorANGLE(3, 1);

    // vertex position texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mesh.vTexture);

    // bspline patches
    if (programs.bsplineProgram) {
        gl.useProgram(programs.bsplineProgram);

        setUniforms(programs.bsplineProgram);
        gl.uniform1f(gl.getUniformLocation(programs.bsplineProgram, "patchRes"),
                     mesh.nPatchRes);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mesh.patchIndexTexture);

        drawTris += drawPatches(mesh.bsplineInstanceData);
    }

    app.glExt.vertexAttribDivisorANGLE(1, 0);
    app.glExt.vertexAttribDivisorANGLE(2, 0);
    app.glExt.vertexAttribDivisorANGLE(3, 0);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
}

function redraw()
{
    if (mesh == null || mesh.patches == null) return;

    // Clear to transparent, bg is layered in css.
    gl.clearColor(0, 0, 0, 0);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);

    var canvas = $('#main');
    var w = canvas.width() * app.devicePixelRatio;
    var h = canvas.height() * app.devicePixelRatio;
    var aspect = w / h;
    gl.viewport(0, 0, w, h);

    camera.setAspect(aspect);
    camera.computeMatrixUniforms();

    // draw grid
    //glUtil.drawGrid(camera.mvpMatrix);

    // draw hull
    if (app.hull && cageProgram != null && mesh.cageLines != null) {
        gl.useProgram(cageProgram);
        camera.setMatrixUniforms(cageProgram);

        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.hullVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.hullIndices);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.LINES, mesh.cageLines.length, gl.UNSIGNED_SHORT, 0);
    }

    // draw subdiv
    drawTris = 0;

    if (mesh.bsplineInstanceData == null) return;
    prepareBatch(camera.mvpMatrix, camera.proj);

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

    //fps = (29 * fps + 1000.0/drawTime)/30.0;
    fps = 1000.0/drawTime;
    if (fps > 99)
        fps = 99.0;
    $('#fps').text(Math.round(fps));

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

function prepareBatch(mvpMatrix, projection)
{
    var evaluator = new PatchEvaluator(mesh.maxValence);

    var nPatches = mesh.patches.length/16;

    // level buckets
    for (var d = 0; d < 8; ++d) {
        mesh.bsplineInstanceData[d] = new Float32Array(nPatches*16);
        mesh.bsplineInstanceData[d].nPatches = 0;
    }

    var p0 = vec4.fromValues(0,0,0,1);
    var p1 = vec4.fromValues(0,0,0,1);
    var p2 = vec4.fromValues(0,0,0,1);
    var p3 = vec4.fromValues(0,0,0,1);

    // bspline patches
    var gpuAdaptive = app.adaptive;
    for (var i = 0; i < nPatches; ++i) {
        var field0 = mesh.patchParams[i*2+0];
        var field1 = mesh.patchParams[i*2+1];

        var depth      = (field1 & 0xf);
        var transition = ((field0 >> 28) & 0xf);
        var boundary   = ((field1 >>  8) & 0xf);

        var type     = 0; //mesh.patchParams[i*8+2];
        var pattern  = 0; //mesh.patchParams[i*8+3];
        var rotation = 0;
        var level = app.tessFactor;
        var color = getPatchColor(transition, boundary);

        var t = Math.max(0, app.tessFactor - depth);
        var tessLevels = [t, t, t, t, t];
        if (gpuAdaptive) {
            // adaptive tessellation based on the limit length
            vec3.copy(p0, evaluator.evalBSplineP(mesh.patches, i, 0, 0));
            vec3.copy(p1, evaluator.evalBSplineP(mesh.patches, i, 1, 0));
            vec3.copy(p2, evaluator.evalBSplineP(mesh.patches, i, 0, 1));
            vec3.copy(p3, evaluator.evalBSplineP(mesh.patches, i, 1, 1));
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

        var data = mesh.bsplineInstanceData[tess];
        var index = data.nPatches*12;
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
        data.nPatches++;
    }

    if (!mesh.instanceVBO) {
        mesh.instanceVBO = gl.createBuffer();
    }
}

function drawPatches(instanceData)
{
    // draw by patch level
    var nTris = 0;
    for (var d = 0; d < instanceData.length; ++d) {
        var nPatches = instanceData[d].nPatches;
        if (nPatches == 0) continue;
        var tessMesh = mesh.tessMeshes[d];

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 4*4, 0);  // uv, iuiv

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, instanceData[d], gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 12*4, 0);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 12*4, 4*4);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 12*4, 8*4);

        app.glExt.drawElementsInstancedANGLE(gl.TRIANGLES,
                                             tessMesh.numTris*3,
                                             gl.UNSIGNED_SHORT,
                                             0, nPatches);

        nTris += tessMesh.numTris * nPatches;
    }
    return nTris;
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
    }
    xhr.send();
}

mesh.rebuild = function() {
    var data = eval("("+toJS(mesh.data, app.level)+")");

    setModel(data.model, this.modelName);
    initShaders();
    redraw();
}

function resizeCanvas() {
    var canvas = $("#main").get(0);

    app.devicePixelRatio = window.devicePixelRatio || 1;

    // only change the size of the canvas if the size it's being displayed
    // has changed.
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (canvas.width != width * app.devicePixelRatio ||
        canvas.height != height * app.devicePixelRatio) {
        // Change the size of the canvas to match the size it's being displayed
        canvas.width = width * app.devicePixelRatio;
        canvas.height = height * app.devicePixelRatio;
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
    app.OES_standard_derivatives =
        gl.getExtension('OES_standard_derivatives');
    if(!gl.getExtension('OES_texture_float')){
        alert("requires OES_texture_float extension");
    }
    app.glExt = gl.getExtension('ANGLE_instanced_arrays');

    if(!app.glExt) {
        alert("requires ANGLE_instanced_arrays");
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
    gui.add(app, 'adaptive')
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
                                                   PatchWire : 3,
                                                   Normal : 4,
                                                   Coord : 5})
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

    $("#version").text(version);

    // events
    camera.ty = 0;
    camera.tz = 2;
    camera.bindControl("#main", redraw);

    document.oncontextmenu = function(e){ return false; }

    loadModel(app.model);

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
});

