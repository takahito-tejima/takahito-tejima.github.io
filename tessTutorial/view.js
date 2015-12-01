//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   last updated:2015/11/30-22:58:35
"use strict"

var gl;

var app = {
    nPatches : 1,
    tessFactor : 16,
    wireframe : true,
    OES_standard_derivatives : false,
    ANGLE_instanced_arrays : false,
    time : 0,
    dpr : 1,
};

var cpTexture = null;
var tessMesh = {};
var drawProgram = {};

function initShader()
{
    var req = new XMLHttpRequest();
    req.open("GET", "bspline.glsl");
    req.onreadystatechange = function() {
        if (req.readyState == 4) {
            var shaderSource = req.responseText;
            var define = '';
            if (app.OES_standard_derivatives)
                define += "#extension GL_OES_standard_derivatives : enable\n"
                + "#define HAS_OES_STANDARD_DERIVATIVES\n";

            var program = glUtil.linkProgram(
                "#define VERTEX_SHADER\n" + define + shaderSource,
                "#define FRAGMENT_SHADER\n" + define + shaderSource,
                {inUV : 0, patchIndices: 1} );

            drawProgram.modelViewMatrix
                = gl.getUniformLocation(program, "modelViewMatrix");
            drawProgram.projectionMatrix
                = gl.getUniformLocation(program, "projectionMatrix");
            drawProgram.nPatches
                = gl.getUniformLocation(program, "nPatches");
            drawProgram.wireframe
                = gl.getUniformLocation(program, "wireframe");
            drawProgram.program = program;
        }
    }
    req.send();
}

function morton(index)
{
    var value1 = index;
    var value2 = value1 >> 1;
    value1 &= 0x00000155;
    value2 &= 0x00000155;
    value1 |= ( value1 >> 1 );
    value2 |= ( value2 >> 1 );
    value1 &= 0x00000133;
    value2 &= 0x00000133;
    value1 |= ( value1 >> 2 );
    value2 |= ( value2 >> 2 );
    value1 &= 0x0000010f;
    value2 &= 0x0000010f;
    return [value1, value2];
}

function animate(time)
{
    // create 16 control points for each patch
    var cp = new Float32Array(16*3*app.nPatches);
    var idx = 0;
    var center = Math.sqrt(app.nPatches)*0.5;
    for (var p = 0; p < app.nPatches; ++p) {
        var loc = morton(p);
        var xOffset = loc[0] - center;
        var zOffset = loc[1] - center;
        for (var i = 0; i < 4; ++i) {
            for (var j = 0; j < 4; ++j) {
                var x = i/3.0 + xOffset;
                var z = j/3.0 + zOffset;
                var r = Math.sqrt(x*x+z*z);
                var y = 0.2*Math.sin(4*r+time);
                cp[idx+0] = x;
                cp[idx+1] = y;
                cp[idx+2] = z;
                idx += 3;
            }
        }
    }

    // CP texture update
    gl.activeTexture(gl.TEXTURE0);
    if (cpTexture == null) {
        cpTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, cpTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
        gl.bindTexture(gl.TEXTURE_2D, cpTexture);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 16, app.nPatches, 0, gl.RGB, gl.FLOAT, cp);
}

function createUVmesh()
{
    var div = app.tessFactor;
    var vbo = [], ibo = [];
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
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // tessellation UV
    tessMesh.VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vbo), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    tessMesh.numTris = numTris;
}

function createPatchIndices()
{
    if (app.ANGLE_instanced_arrays) {
        var patches = [];
        for (var i = 0; i < app.nPatches; ++i) patches.push(i);

        tessMesh.PatchVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.PatchVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(patches), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}

function idle()
{
    app.time = app.time + 0.05;
    animate(app.time);
    redraw();
}

function redraw()
{
    gl.clearColor(.1, .1, .2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    var canvas = $('#main');
    var w = canvas.width() * app.dpr;
    var h = canvas.height() * app.dpr;
    var aspect = w / h;
    gl.viewport(0, 0, w, h);

    if (drawProgram.program == null) return;

    gl.useProgram(drawProgram.program);

    camera.setAspect(aspect);
    camera.computeMatrixUniforms();

    gl.uniformMatrix4fv(drawProgram.projectionMatrix, false, camera.proj);
    gl.uniformMatrix4fv(drawProgram.modelViewMatrix, false, camera.modelView);
    gl.uniform1f(drawProgram.nPatches, app.nPatches);
    gl.uniform1i(drawProgram.wireframe, app.wireframe);

    camera.setMatrixUniforms(drawProgram);

    // draw subdiv
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cpTexture);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tessMesh.IBO);
    gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.VBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

    if (app.ANGLE_instanced_arrays) {
        gl.enableVertexAttribArray(1);
        gl.bindBuffer(gl.ARRAY_BUFFER, tessMesh.PatchVBO);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

        app.ANGLE_instanced_arrays.vertexAttribDivisorANGLE(1, 1);

        app.ANGLE_instanced_arrays.drawElementsInstancedANGLE(
            gl.TRIANGLES,
            tessMesh.numTris*3,
            gl.UNSIGNED_SHORT,
            0, app.nPatches);

        gl.disableVertexAttribArray(1);
        app.ANGLE_instanced_arrays.vertexAttribDivisorANGLE(1, 0);
    } else {
        gl.drawElements(gl.TRIANGLES,
                        tessMesh.numTris*3,
                        gl.UNSIGNED_SHORT,
                        0);
    }


    gl.disableVertexAttribArray(0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function resizeCanvas() {
    var canvas = $("#main").get(0);

    app.dpr = window.devicePixelRatio || 1;

    // only change the size of the canvas if the size it's being displayed
    // has changed.
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (canvas.width != width * app.dpr
        || canvas.height != height * app.dpr) {
        // Change the size of the canvas to match the size it's being displayed
        canvas.width = width * app.dpr;
        canvas.height = height * app.dpr;
        redraw();
    }
}

$(function(){
    var canvas = $("#main").get(0);

    // initialize WebGL
    $.each(["webgl2", "experimental-webgl2", "webgl", "experimental-webgl",
            "webkit-3d", "moz-webgl"], function(i, name){
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
    if (!gl.getExtension('OES_texture_float')){
        alert("requires OES_texture_float extension");
    }
    app.OES_standard_derivatives =
        gl.getExtension('OES_standard_derivatives');
    app.ANGLE_instanced_arrays =
        gl.getExtension('ANGLE_instanced_arrays');

    // GUI build
    var gui = new dat.GUI();

    gui.add(app, 'wireframe');
    
    // tess factor
    gui.add(app, 'tessFactor', 2, 64)
        .step(1)
        .onChange(function(value) {
            createUVmesh();
        });
    gui.add(app, 'nPatches', 1, 256)
        .step(1)
        .onChange(function(value) {
            createPatchIndices();
        });
    createUVmesh();
    createPatchIndices();

    camera.bindControl("#main", redraw);
    document.oncontextmenu = function(e){ return false; }

    initShader();

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    setInterval(idle, 16);
});

