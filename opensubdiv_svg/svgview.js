//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//

var version = "last updated:2015/06/13-11:39:56"

var app = {
};

var button = false;
var mousePosition;

var mesh = { paths: [],
             patches: [] };

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

function toScreen(v, w, h)
{
    return [(v[0]/v[3])*w*0.5, (-v[1]/v[3])*h*0.5, v[2]/v[3]];
}

function drawAxis(w, h)
{
    var xaxis = $("#xaxis").get(0);
    var p0 = vec4.fromValues(-1, 0, 0, 1);
    var p1 = vec4.fromValues( 1, 0, 0, 1);
    vec4.transformMat4(p0, p0, camera.mvpMatrix);
    vec4.transformMat4(p1, p1, camera.mvpMatrix);
    p0 = toScreen(p0, w, h);
    p1 = toScreen(p1, w, h);
    xaxis.setAttribute("d", "M "+p0[0]+" "+p0[1]+" L "+p1[0]+" "+p1[1]);

    var yaxis = $("#yaxis").get(0);
    p0 = vec4.fromValues(0, -1, 0, 1);
    p1 = vec4.fromValues(0, 1, 0, 1);
    vec4.transformMat4(p0, p0, camera.mvpMatrix);
    vec4.transformMat4(p1, p1, camera.mvpMatrix);
    p0 = toScreen(p0, w, h);
    p1 = toScreen(p1, w, h);
    yaxis.setAttribute("d", "M "+p0[0]+" "+p0[1]+" L "+p1[0]+" "+p1[1]);

    var zaxis = $("#zaxis").get(0);
    p0 = vec4.fromValues(0, 0, -1, 1);
    p1 = vec4.fromValues(0, 0, 1, 1);
    vec4.transformMat4(p0, p0, camera.mvpMatrix);
    vec4.transformMat4(p1, p1, camera.mvpMatrix);
    p0 = toScreen(p0, w, h);
    p1 = toScreen(p1, w, h);
    zaxis.setAttribute("d", "M "+p0[0]+" "+p0[1]+" L "+p1[0]+" "+p1[1]);
}

function createModel(data)
{
    var src = $.parseJSON(data);
    mesh.patches = [];
    mesh.paths = [];

    var ns = 'http://www.w3.org/2000/svg';
    var numPatches = src.length/3/16;

    for (var i = 0; i < numPatches; i++) {
        var patch = {}
        patch.p = [];
        patch.verts = [];
        for(var j = 0; j < 16; j++) {
            var p = vec4.fromValues(
                src[(i*16+j)*3+0],
                src[(i*16+j)*3+1],
                src[(i*16+j)*3+2], 1);
            patch.verts.push(p);
        }
        for (var j = 0; j < 13; j++) {
            patch.p.push(vec4.create());
        }
        patch.center = vec4.create();
        mesh.patches.push(patch);

        // create a path for each patch
        var path = document.createElementNS(ns, "path");
        path.setAttribute("style", "fill:white; stroke:black; stroke-width:0.5px");
        mesh.paths.push(path);
        area.appendChild(path);
    }
    display();
}

function display()
{
    var w = $("#viewframe").width();
    var h = $("#viewframe").height();
    var area = $("#area").get(0);
    var frame = $("#frame").get(0);
    frame.setAttribute("transform",
                       "translate("+w*0.5+", "+h*0.5+") "+
                       "scale(1, 1)");

    camera.setAspect(w/h);
    camera.computeMatrixUniforms();

    var area = $("#area").get(0);
    for (var i = 0; i < mesh.patches.length; i++) {
        var d = '';
        var patch = mesh.patches[i];
        vec4.transformMat4(patch.p[0], patch.verts[0], camera.mvpMatrix);
        vec4.transformMat4(patch.p[1], patch.verts[1], camera.mvpMatrix);
        vec4.transformMat4(patch.p[2], patch.verts[2], camera.mvpMatrix);
        vec4.transformMat4(patch.p[3], patch.verts[3], camera.mvpMatrix);
        vec4.transformMat4(patch.p[4], patch.verts[7], camera.mvpMatrix);
        vec4.transformMat4(patch.p[5], patch.verts[11], camera.mvpMatrix);
        vec4.transformMat4(patch.p[6], patch.verts[15], camera.mvpMatrix);
        vec4.transformMat4(patch.p[7], patch.verts[14], camera.mvpMatrix);
        vec4.transformMat4(patch.p[8], patch.verts[13], camera.mvpMatrix);
        vec4.transformMat4(patch.p[9], patch.verts[12], camera.mvpMatrix);
        vec4.transformMat4(patch.p[10], patch.verts[8], camera.mvpMatrix);
        vec4.transformMat4(patch.p[11], patch.verts[4], camera.mvpMatrix);
        vec4.transformMat4(patch.p[12], patch.verts[0], camera.mvpMatrix);

        vec4.transformMat4(patch.center, patch.verts[5], camera.mvpMatrix);
    }

    // Z sort
    mesh.patches.sort(function(a, b) {
        return b.center[2] - a.center[2];
    });

    // convert to path
    for (var i = 0; i < mesh.patches.length; i++) {
        var d = ''
        for (var j = 0; j < 13; ++j) {
            if (j == 0) d += 'M ';
            else if (j == 1) d += ' C ';
            else d += ' ';
            var screenPos = toScreen(mesh.patches[i].p[j], w, h);
            d += screenPos[0].toFixed(3) + ' ' + screenPos[1].toFixed(3);
        }
        mesh.paths[i].setAttribute("d", d);
    }
}

$(function(){
    var svg = $("#main");
    svg.mousedown(function(e){
        button = true;
        mousePosition = getMousePosition();
    });
    svg.mouseup(function(e){
        button = false;
    });

    // events
    camera.ty = 0;
    camera.tz = 3;
    camera.ry = 0;
    camera.fov = 40;
    camera.bindControl("#main", display);

    /*
    $.get("tet.js", function(data) {
    });
*/

    toBezier = Module.cwrap('toBezier', 'string', ['number']);
    createModel(toBezier(6));
//    console.log(toBezier(3));
});

