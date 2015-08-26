//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//

var version = "last updated:2015/06/13-23:01:51"

var app = {
    level : 3,
    model : 'catmark_tet',
    fillColor : "#f0f0f0",
    wireColor : "#000000",
    wireWidth : .5,
};

var mesh = { objfile: "",
             paths: [],
             patches: [] };

function display() {
    $("path").css("fill", app.fillColor);
    $("path").css("stroke", app.wireColor);
    $("path").css("stroke-width", app.wireWidth);

    var w = $("#main").width();
    var h = $("#main").height();
    var frame = $("#frame").get(0);
    frame.setAttribute("transform",
                       "translate("+w*0.5+", "+h*0.5+") "+
                       "scale(1, 1)");

    camera.setAspect(w/h);
    camera.computeMatrixUniforms();

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
            var sp = mesh.patches[i].p[j];

            // strictly speaking, this is incorrect since we're drawing 2d-bezier
            // using post perspective projection control points
            // (orthographic projection is ok)
            // but we prefer perspective and it actually looks not bad.
            var sx = (sp[0]/sp[3])*w*0.5;
            var sy = (-sp[1]/sp[3])*h*0.5;
            d += sx.toFixed(1) + ' ' + sy.toFixed(1);
        }
        mesh.paths[i].setAttribute("d", d);
    }
}

mesh.load = function(file) {
    var url = "objs/" + file;

    var xhr = new XMLHttpRequest();
    var now = new Date();
    xhr.open('GET', url + "?"+now.getTime(), true);

    $("#status").text("Loading model "+file);
    xhr.onload = function(e) {
        mesh.data = this.response;
        $("#status").text("Building mesh...");
        setTimeout(function(){
            mesh.rebuild();
            display();
            $("#status").text("");

        }, 0);
    }
    xhr.send();
}

mesh.rebuild = function() {
    var data = toBezier(mesh.data, app.level);

    var src = $.parseJSON(data);
    mesh.patches = [];
    mesh.paths = [];

    var ns = 'http://www.w3.org/2000/svg';
    var numPatches = src.length/3/16;

    var svgMesh = $("#mesh").get(0);
    $("#mesh").empty();

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
        mesh.paths.push(path);
        svgMesh.appendChild(path);
    }

    $('#patches').text(numPatches);

    display();
}

$(function(){

    // events
    camera.ty = 0;
    camera.tz = 5;
    camera.ry = 0;
    camera.fov = 40;
    camera.bindControl("#main", display);

    // disable context menu
    document.oncontextmenu=function(event) {
        return false;
    };

    document.onmouseup=function(event) {
        display();
    };

    // Emscripten interface
    toBezier = Module.cwrap('toBezier', 'string', ['string', 'number']);

    // GUI build
    var gui = new dat.GUI();

    // model menu
    gui.add(app, 'model',
            ['catmark_tet',
             'catmark_cube_creases0',
             'catmark_cube_creases1',
             'catmark_cube_corner0',
             'catmark_cube_corner1',
             'catmark_cube_corner2',
             'catmark_cube_corner3',
             'catmark_cube_corner4',
             'catmark_cube',
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
             'catmark_gregory_test5',
             'catmark_gregory_test6',
             'catmark_gregory_test7',
             'catmark_gregory_test8',
             'catmark_pyramid_creases0',
             'catmark_pyramid_creases1',
             'catmark_pyramid_creases2',
             'catmark_lefthanded',
             'catmark_righthanded',
             'catmark_pole8',
             'catmark_pole64',
             'catmark_righthanded',
             'catmark_single_crease',
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
             'catmark_pawn'])
        .onChange(function(value){
            mesh.load(value+".obj");
        });

    // isolation factor
    gui.add(app, 'level', 1, 10)
        .step(1)
        .onChange(function(value) {
            mesh.rebuild()
        });

    gui.addColor(app, 'fillColor');
    gui.addColor(app, 'wireColor');
    gui.add(app, 'wireWidth', 0, 10);

    mesh.load("catmark_tet.obj")

    $("#version").text(version);
});

