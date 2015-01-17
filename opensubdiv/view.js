//
//   Copyright 2014 Takahito Tejima (tejimaya@gmail.com)
//

var camera = {
    rx : 0,
    ry : 0,
    dolly : 5,
    fov : 60
};

var center = [0, 0, 0];
var time = 0;
var model = null;
var deform = false;
var drawHull = true;
var uvMapping = false;

var prevTime = 0;
var fps = 0;

var uvimage = new Image();
var uvtex = null;

var program = null;
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
    return vec3.create([x, y, 0]);
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
    program = buildProgram('#vshader', '#fshader');
    program.mvpMatrix = gl.getUniformLocation(program, "mvpMatrix");
    program.modelViewMatrix = gl.getUniformLocation(program, "modelViewMatrix");
    program.projMatrix = gl.getUniformLocation(program, "projMatrix");
    program.displayMode = gl.getUniformLocation(program, "displayMode");

    // cage program
    if (cageProgram != null) gl.deleteProgram(cageProgram);
    cageProgram = buildProgram("#cageVS", "#cageFS");
    cageProgram.mvpMatrix = gl.getUniformLocation(cageProgram, "mvpMatrix");
}

function deleteModel()
{
    if (model == null) return;

    for(var i=0; i<model.batches.length; ++i) {
        gl.deleteBuffer(model.batches[i].ibo);
        gl.deleteBuffer(model.batches[i].vbo);
    }
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
    model.patchVerts    = [];

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
        model.patchVerts[i] = data.points[i];
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

    fitCamera();

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
        model.patchVerts[i/3] = [model.animVerts[i+0],
                               model.animVerts[i+1],
                               model.animVerts[i+2]];
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
    gl.bufferData(gl.ARRAY_BUFFER, model.animVerts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function updateGeom()
{
    refine();
    tessellate();
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
        model.patchVerts[i + model.cageVerts.length/3] = [x,y,z];
    }
}

function evalCubicBezier(u, B, BU)
{
    var t = u;
    var s = 1 - u;

    var A0 = s * s;
    var A1 = 2 * s * t;
    var A2 = t * t;

    B[0] = s * A0;
    B[1] = t * A0 + s * A1;
    B[2] = t * A1 + s * A2;
    B[3] = t * A2;
    BU[0] =    - A0;
    BU[1] = A0 - A1;
    BU[2] = A1 - A2;
    BU[3] = A2;
}

function evalCubicBSpline(u, B, BU)
{
    var t = u;
    var s = 1 - u;
    var A0 =                     s * (0.5 * s);
    var A1 = t * (s + 0.5 * t) + s * (0.5 * s + t);
    var A2 = t * (    0.5 * t);
    B[0] =                                 1/3.0 * s              * A0;
    B[1] = (2/3.0 * s +         t) * A0 + (2/3.0 * s + 1/3.0 * t) * A1;
    B[2] = (1/3.0 * s + 2/3.0 * t) * A1 + (        s + 2/3.0 * t) * A2;
    B[3] =              1/3.0 * t  * A2;
    BU[0] =    - A0;
    BU[1] = A0 - A1;
    BU[2] = A1 - A2;
    BU[3] = A2;
}

function csf(n, j)
{
    if (j%2 == 0) {
        return Math.cos((2.0 * Math.PI * ((j-0)/2.0))/(n + 3.0));
    } else {
        return Math.sin((2.0 * Math.PI * ((j-1)/2.0))/(n + 3.0));
    }
}

function evalGregory(indices, type, quadOffset, u, v)
{
    var boundary = (type == 11)
    var valences = [];
    var maxValence = model.maxValence;

    var ef_small = [0.813008, 0.500000, 0.363636, 0.287505,
                    0.238692, 0.204549, 0.179211];

    var r = [], e0 = [], e1 = [];
    var rp;
    var f = [], pos, opos = [];
    var valenceTable = model.valenceTable;
    var quadOffsets = model.quadOffsets;
    var verts = model.patchVerts;
    var zerothNeighbors = [];
    var org = [];

    for (var vid=0; vid < 4; ++vid) {
        var boundaryEdgeNeighbors = [-1,-1];
        var currNeighbor = 0;
        var ibefore = 0;
        zerothNeighbors[vid] = 0;

        var vertexID = indices[vid];
        var valenceTableOffset = vertexID * (2*maxValence+1);
        var ivalence = valenceTable[valenceTableOffset];
        var valence = Math.abs(ivalence);
        valences[vid] = ivalence;

        // read vertexID
        pos = verts[vertexID];
        org[vid] = [pos[0], pos[1], pos[2]];

        rp = vid*maxValence;
        //var vofs = vid;
        opos[vid] = [0,0,0];

        for (var i=0; i<valence; ++i) {
            var im = (i+valence-1)%valence;
            var ip = (i+1)%valence;

            var idx_neighbor   = valenceTable[valenceTableOffset + 2*i  + 0 + 1];
            var idx_diagonal   = valenceTable[valenceTableOffset + 2*i  + 1 + 1];
            var idx_neighbor_p = valenceTable[valenceTableOffset + 2*ip + 0 + 1];
            var idx_neighbor_m = valenceTable[valenceTableOffset + 2*im + 0 + 1];
            var idx_diagonal_m = valenceTable[valenceTableOffset + 2*im + 1 + 1];

            var neighbor   = verts[idx_neighbor];
            var diagonal   = verts[idx_diagonal];
            var neighbor_p = verts[idx_neighbor_p];
            var neighbor_m = verts[idx_neighbor_m];
            var diagonal_m = verts[idx_diagonal_m];

            if (boundary) {
                var valenceNeighbor = valenceTable[idx_neighbor * (2*maxValence+1)];
                if (valenceNeighbor < 0) {
                    if (currNeighbor < 2) {
                        boundaryEdgeNeighbors[currNeighbor++] = idx_neighbor;
                    }

                    if (currNeighbor == 1) {
                        ibefore = i;
                        zerothNeighbors[vid] = i;
                    } else {
                        if (i - ibefore == 1) {
                            var tmp = boundaryEdgeNeighbors[0];
                            boundaryEdgeNeighbors[0] = boundaryEdgeNeighbors[1];
                            boundaryEdgeNeighbors[1] = tmp;
                            zerothNeighbors[vid] = i;
                        }
                    }
                }
            }

            //float  *fp = f+i*3;
            f[i] = [0,0,0];
            //r[rp] = [0,0,0];
            r[rp+i] = [0,0,0];
            for (var k=0; k<3; ++k) {
                f[i][k] = (pos[k]*valence
                           + (neighbor_p[k]+neighbor[k])*2.0
                           + diagonal[k])/(valence+5.0);

                opos[vid][k] += f[i][k];
                r[rp+i][k] =(neighbor_p[k]-neighbor_m[k])/3.0
                    + (diagonal[k]-diagonal_m[k])/6.0;
            }
        }

        // average opos
        for (var k=0; k<3; ++k) {
            opos[vid][k] /= valence;
        }

        // compute e0, e1
        e0[vid] = [0,0,0];
        e1[vid] = [0,0,0];
        for (var i=0; i<valence; ++i) {
            var im = (i+valence-1)%valence;
            for (var k=0; k<3; ++k) {
                var e = 0.5*(f[i][k] + f[im][k]);
                e0[vid][k] += csf(valence-3, 2*i) * e;
                e1[vid][k] += csf(valence-3, 2*i+1) * e;
            }
        }
        for (var k=0; k<3; ++k) {
            e0[vid][k] *= ef_small[valence-3];
            e1[vid][k] *= ef_small[valence-3];
        }

        if (boundary) {

            if (currNeighbor == 1) {
                boundaryEdgeNeighbors[1] = boundaryEdgeNeighbors[0];
            }

            if (ivalence < 0) {
                for (var k = 0; k < 3; ++k) {
                    if (valence > 2) {
                        opos[vid][k] = (verts[boundaryEdgeNeighbors[0]][k]
                                        + verts[boundaryEdgeNeighbors[1]][k] +
                                   4 * pos[k])/6.0;
                    } else {
                        opos[vid][k] = pos[k];
                    }
                }

                var fk = valence - 1;  // k is the number of faces
                var c = Math.cos(Math.PI/fk);
                var s = Math.sin(Math.PI/fk);
                var gamma = -(4.0*s)/(3.0*fk + c);
                var alpha_0k = -((1.0+2.0*c)*Math.sqrt(1.0+c))/((3.0*fk+c)*Math.sqrt(1.0-c));
                var beta_0 = s/(3.0*fk + c);

                var idx_diagonal = valenceTable[valenceTableOffset + 2*zerothNeighbors[vid]  + 1 + 1];
                idx_diagonal = Math.abs(idx_diagonal);

                var diagonal   = verts[idx_diagonal];

                for (var k = 0; k < 3; ++k) {
                    e0[vid][k] = (verts[boundaryEdgeNeighbors[0]][k] -
                                  verts[boundaryEdgeNeighbors[1]][k])/6.0;
                    e1[vid][k] = gamma * pos[k]
                        + alpha_0k * verts[boundaryEdgeNeighbors[0]][k]
                        + alpha_0k * verts[boundaryEdgeNeighbors[1]][k]
                        + beta_0 * diagonal[k];
                }

                for (var x = 1; x<valence - 1; ++x) {
                    var curri = ((x + zerothNeighbors[vid])%valence);
                    var alpha = (4.0*Math.sin((Math.PI * x)/fk))/(3.0*fk+c);
                    var beta = (Math.sin((Math.PI * x)/fk)
                                + Math.sin((Math.PI * (x+1))/fk))/(3.0*fk+c);

                    var idx_neighbor = valenceTable[valenceTableOffset + 2*curri + 0 + 1];
                    idx_neighbor = Math.abs(idx_neighbor);
                    var neighbor = verts[idx_neighbor];
                    idx_diagonal = valenceTable[valenceTableOffset + 2*curri + 1 + 1];
                    var diagonal = verts[idx_diagonal];

                    for (var k = 0; k < 3; ++k) {
                        e1[vid][k] += alpha * neighbor[k] + beta * diagonal[k];
                    }
                }
                for (var k = 0; k < 3; ++k) {
                    e1[vid][k] /= 3.0;
                }

            }
        }
    }
    var Ep = [[],[],[],[]];
    var Em = [[],[],[],[]];
    var Fp = [[],[],[],[]];
    var Fm = [[],[],[],[]];

    for (var vid=0; vid<4; ++vid) {
        var ip = (vid+1)%4;
        var im = (vid+3)%4;
        var n = Math.abs(valences[vid]); // ???
        var ivalence = n;

        var start = quadOffsets[quadOffset + vid] & 0x00ff;
        var prev = (quadOffsets[quadOffset + vid] & 0xff00) / 256;

        var np = Math.abs(valences[ip]);
        var nm = Math.abs(valences[im]);

        var start_m = quadOffsets[quadOffset + im] & 0x00ff;
        var prev_p  = (quadOffsets[quadOffset + ip] & 0xff00) / 256;

        if (boundary) {
            var Em_ip = [0,0,0];
            var Ep_im = [0,0,0];
            if (valences[ip] < -2) {
                var j = (np + prev_p - zerothNeighbors[ip]) % np;
                for (var k=0; k < 3; ++k) {
                    Em_ip[k] = opos[ip][k]
                        + Math.cos((Math.PI*j)/(np-1))*e0[ip][k]
                        + Math.sin((Math.PI*j)/(np-1))*e1[ip][k];
                }
            } else {
                for (var k=0; k < 3; ++k) {
                    Em_ip[k] = opos[ip][k]
                        + e0[ip][k]*csf(np-3, 2*prev_p)
                        + e1[ip][k]*csf(np-3, 2*prev_p + 1);
                }
            }

            if (valences[im] < -2) {
                var j = (nm + start_m - zerothNeighbors[im]) % nm;
                for (var k=0; k < 3; ++k) {
                    Ep_im[k] = opos[im][k]
                        + Math.cos((Math.PI*j)/(nm-1))*e0[im][k]
                        + Math.sin((Math.PI*j)/(nm-1))*e1[im][k];
                }
            } else {
                for (var k = 0; k < 3; ++k) {
                    Ep_im[k] = opos[im][k]
                        + e0[im][k]*csf(nm-3, 2*start_m)
                        + e1[im][k]*csf(nm-3, 2*start_m + 1);
                }
            }

            if (valences[vid] < 0) {
                n = (n-1)*2;
            }
            if (valences[im] < 0) {
                nm = (nm-1)*2;
            }
            if (valences[ip] < 0) {
                np = (np-1)*2;
            }
            rp = vid*maxValence;

            if (valences[vid] > 2) {
                var s1 = 3.0 - 2.0*csf(n-3,2)-csf(np-3,2);
                var s2 = 2.0*csf(n-3,2);
                var s3 = 3.0 - 2.0*Math.cos(2.0*Math.PI/n) - Math.cos(2.0*Math.PI/nm);

                for (var k=0; k <3; ++k) {
                    Ep[vid][k] = opos[vid][k]
                        + e0[vid][k]*csf(n-3, 2*start)
                        + e1[vid][k]*csf(n-3, 2*start + 1);
                    Em[vid][k] = opos[vid][k]
                        + e0[vid][k]*csf(n-3, 2*prev)
                        + e1[vid][k]*csf(n-3, 2*prev + 1);

                    Fp[vid][k] = (csf(np-3,2)*opos[vid][k]
                                  + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                    Fm[vid][k] = (csf(nm-3,2)*opos[vid][k]
                                  + s3*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
                }
            } else if (valences[vid] < -2) {
                var jp = (ivalence + start - zerothNeighbors[vid]) % ivalence;
                var jm = (ivalence + prev  - zerothNeighbors[vid]) % ivalence;

                var s1 = 3-2*csf(n-3,2)-csf(np-3,2);
                var s2 = 2*csf(n-3,2);
                var s3 = 3.0-2.0*Math.cos(2.0*Math.PI/n)-Math.cos(2.0*Math.PI/nm);

                for (var k=0; k < 3; ++k){
                    Ep[vid][k] = opos[vid][k]
                        + Math.cos((Math.PI*jp)/(ivalence-1))*e0[vid][k]
                        + Math.sin((Math.PI*jp)/(ivalence-1))*e1[vid][k];
                    Em[vid][k] = opos[vid][k]
                        + Math.cos((Math.PI*jm)/(ivalence-1))*e0[vid][k]
                        + Math.sin((Math.PI*jm)/(ivalence-1))*e1[vid][k];
                    Fp[vid][k] = (csf(np-3,2)*opos[vid][k]
                                  + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                    Fm[vid][k] = (csf(nm-3,2)*opos[vid][k]
                                  + s3*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
                }

                if (valences[im] <0) {
                    s1 = 3-2*csf(n-3,2)-csf(np-3,2);
                    for (var k=0; k < 3; ++k){
                        Fp[vid][k] = Fm[vid][k] =
                            (csf(np-3,2)*opos[vid][k]
                             + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                    }
                } else if (valences[ip] < 0) {
                    s1 = 3.0-2.0*Math.cos(2.0*Math.PI/n)-Math.cos(2.0*Math.PI/nm);
                    for (var k=0; k < 3; ++k){
                        Fm[vid][k] = Fp[vid][k] =
                            (csf(nm-3,2)*opos[vid][k]
                             + s1*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
                    }
                }
            } else if (valences[vid] == -2) {
                for (var k=0; k < 3; ++k){
                    Ep[vid][k] = (2.0 * org[vid][k] + org[ip][k])/3.0;
                    Em[vid][k] = (2.0 * org[vid][k] + org[im][k])/3.0;
                    Fp[vid][k] = Fm[vid][k] =
                        (4.0 * org[vid][k] + org[(vid+2)%n][k]
                         + 2.0 * org[ip][k] + 2.0 * org[im][k])/9.0;
                }
            }
        } else {
            // no-boundary
            for (var k=0; k<3; ++k) {
                Ep[vid][k] = opos[vid][k] + e0[vid][k] * csf(n-3, 2*start)
                    + e1[vid][k]*csf(n-3, 2*start +1);
                Em[vid][k] = opos[vid][k] + e0[vid][k] * csf(n-3, 2*prev )
                    + e1[vid][k]*csf(n-3, 2*prev + 1);
            }

            var prev_p = (quadOffsets[quadOffset + ip] & 0xff00) / 256;
            var start_m = quadOffsets[quadOffset + im] & 0x00ff;

            var Em_ip = [0,0,0];
            var Ep_im = [0,0,0];

            for (var k=0; k<3; ++k) {
                Em_ip[k] = opos[ip][k] + e0[ip][k]*csf(np-3, 2*prev_p)
                    + e1[ip][k]*csf(np-3, 2*prev_p+1);
                Ep_im[k] = opos[im][k] + e0[im][k]*csf(nm-3, 2*start_m)
                    + e1[im][k]*csf(nm-3, 2*start_m+1);
            }

            var s1 = 3.0 - 2.0*csf(n-3,2)-csf(np-3,2);
            var s2 = 2.0 * csf(n-3,2);
            var s3 = 3.0 - 2.0*Math.cos(2.0*Math.PI/n) - Math.cos(2.0*Math.PI/nm);

            rp = vid*maxValence;
            for (var k=0; k<3; ++k) {
                Fp[vid][k] = (csf(np-3,2)*opos[vid][k]
                              + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                Fm[vid][k] = (csf(nm-3,2)*opos[vid][k]
                              + s3*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
            }
        }
    }

    var p = [];
    for (var i=0; i<4; ++i) {
        p[i*5+0] = opos[i];
        p[i*5+1] =   Ep[i];
        p[i*5+2] =   Em[i];
        p[i*5+3] =   Fp[i];
        p[i*5+4] =   Fm[i];
    }

    var U = 1-u, V=1-v;
    var d11 = u+v; if(u+v==0.0) d11 = 1.0;
    var d12 = U+v; if(U+v==0.0) d12 = 1.0;
    var d21 = u+V; if(u+V==0.0) d21 = 1.0;
    var d22 = U+V; if(U+V==0.0) d22 = 1.0;

    var q = [];
    for (var i= 0; i<16; ++i) q[i] = [0,0,0];
    for (var k=0; k<3; ++k) {
        q[ 5][k] = (u*p[ 3][k] + v*p[ 4][k])/d11;
        q[ 6][k] = (U*p[ 9][k] + v*p[ 8][k])/d12;
        q[ 9][k] = (u*p[19][k] + V*p[18][k])/d21;
        q[10][k] = (U*p[13][k] + V*p[14][k])/d22;

        q[ 0][k] = p[ 0][k];
        q[ 1][k] = p[ 1][k];
        q[ 2][k] = p[ 7][k];
        q[ 3][k] = p[ 5][k];
        q[ 4][k] = p[ 2][k];
        q[ 7][k] = p[ 6][k];
        q[ 8][k] = p[16][k];
        q[11][k] = p[12][k];
        q[12][k] = p[15][k];
        q[13][k] = p[17][k];
        q[14][k] = p[11][k];
        q[15][k] = p[10][k];
    }

    // bezier evaluation

    B = [0, 0, 0, 0];
    D = [0, 0, 0, 0];
    BU = [[0,0,0], [0,0,0], [0,0,0], [0,0,0]];
    DU = [[0,0,0], [0,0,0], [0,0,0], [0,0,0]];

    evalCubicBezier(u, B, D);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j<4;j++){
            for(var k=0; k<3; k++){
                BU[i][k] += q[i+j*4][k] * B[j];
                DU[i][k] += q[i+j*4][k] * D[j];
            }
        }
    }
    evalCubicBezier(v, B, D);

    Q = [0, 0, 0];
    QU = [0, 0, 0];
    QV = [0, 0, 0];
    for(var i=0;i<4; i++){
        for (var k=0; k<3; k++) {
            Q[k] += BU[i][k] * B[i];
            QU[k] += DU[i][k] * B[i];
            QV[k] += BU[i][k] * D[i];
        }
    }
    N = [QU[1]*QV[2]-QU[2]*QV[1],
         QU[2]*QV[0]-QU[0]*QV[2],
         QU[0]*QV[1]-QU[1]*QV[0]];

    return [Q[0], Q[1], Q[2], -N[0], -N[1], -N[2]];
}

function evalBSpline(indices, u, v)
{
    var B = [0, 0, 0, 0];
    var D = [0, 0, 0, 0];
    var BU = [[0,0,0], [0,0,0], [0,0,0], [0,0,0]];
    var DU = [[0,0,0], [0,0,0], [0,0,0], [0,0,0]];

    var verts = new Array(16);
    var border = (indices.length == 12);
    var corner = (indices.length == 9);
    var vofs = (border || corner) ? 4 : 0;
    for (var i = 0; i < indices.length; ++i) {
        verts[i+vofs] = model.patchVerts[indices[i]];
    }
    if (border) {
        verts[0] = [];
        verts[1] = [];
        verts[2] = [];
        verts[3] = [];
        for (var k = 0; k < 3; ++k) {
            verts[0][k] = 2*verts[4][k] - verts[8][k];
            verts[1][k] = 2*verts[5][k] - verts[9][k];
            verts[2][k] = 2*verts[6][k] - verts[10][k];
            verts[3][k] = 2*verts[7][k] - verts[11][k];
        }
    } else if (corner) {
        verts[15] = [];
        verts[14] = verts[12];
        verts[13] = verts[11];
        verts[12] = verts[10];
        verts[11] = [];
        verts[10] = verts[9];
        verts[9] = verts[8];
        verts[8] = verts[7];
        verts[7] = [];
        verts[0] = [];
        verts[1] = [];
        verts[2] = [];
        verts[3] = [];
        for (var k = 0; k < 3; ++k) {
            verts[0][k] = 2*verts[4][k] - verts[8][k];
            verts[1][k] = 2*verts[5][k] - verts[9][k];
            verts[2][k] = 2*verts[6][k] - verts[10][k];
            verts[3][k] = 2*verts[6][k] - verts[9][k];
            verts[7][k] = 2*verts[6][k] - verts[5][k];
            verts[11][k] = 2*verts[10][k] - verts[9][k];
            verts[15][k] = 2*verts[14][k] - verts[13][k];
        }
    }

    evalCubicBSpline(u, B, D);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j < 4;j++){
            var vid = indices[i+j*4];
            for(var k=0; k<3; k++){
                BU[i][k] += verts[i+j*4][k] * B[j];
                DU[i][k] += verts[i+j*4][k] * D[j];
            }
        }
    }
    evalCubicBSpline(v, B, D);

    var Q = [0, 0, 0];
    var QU = [0, 0, 0];
    var QV = [0, 0, 0];
    for(var i=0;i<4; i++){
        for (var k=0; k<3; k++) {
            Q[k] += BU[i][k] * B[i];
            QU[k] += DU[i][k] * B[i];
            QV[k] += BU[i][k] * D[i];
        }
    }
    var N = [QU[1]*QV[2]-QU[2]*QV[1],
             QU[2]*QV[0]-QU[0]*QV[2],
             QU[0]*QV[1]-QU[1]*QV[0]];
    return [Q[0], Q[1], Q[2], -N[0], -N[1], -N[2]];
}

function appendVBO(points, indices)
{
    var batch = {}

    var pdata = new Float32Array(points.length);
    for (i = 0; i < points.length; i++) {
        pdata[i] = points[i];
    }
    batch.nPoints = pdata.length/3;
    var idata = new Uint16Array(indices.length);
    for (i = 0; i < indices.length; i++) {
        idata[i] = indices[i];
    }
    batch.nTris = idata.length/3;

    batch.vbo = gl.createBuffer();
    batch.ibo = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pdata, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idata, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    model.batches.push(batch);
}

function addPoints(points, pn, u, v, iu, iv, color)
{
    points.push(pn[0]);
    points.push(pn[1]);
    points.push(pn[2]);
    points.push(pn[3]);
    points.push(pn[4]);
    points.push(pn[5]);
    points.push(u);
    points.push(v);
    points.push(iu);
    points.push(iv);
    points.push(color[0]);
    points.push(color[1]);
    points.push(color[2]);
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
        // todo!
        return [];
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

function tessellate() {
    if (model == null) return;

    model.batches = []

    var points = [];
    var indices = [];
    var vid = 0;
    var quadOffset = 0;
    for (var i = 0; i < model.patches.length; i++) {
        var ncp = model.patches[i].length;

        if (i >= model.patchParams.length) continue;
        var p = model.patchParams[i];
        if (p == null) continue;

        var color = (p[3] == 0) ?
            patchColors[0][p[2]-6] :
            patchColors[p[2]-6+1][p[3]-1];

        var level = tessFactor - p[0]/*depth*/;
        if (level <= 0 && p[3] != 0/*transition*/) {
            // under tessellated transition patch. need triangle patterns.
            var params = getTransitionParams(p[3]-1, p[4]);
            var edgeparams = [[0,0],[1,0],[0,1]];
            for (var j = 0; j < params.length; ++j) {
                var u = params[j][0];
                var v = params[j][1];
                var iu = edgeparams[j%3][0];
                var iv = edgeparams[j%3][1];
                pn = evalBSpline(model.patches[i], u, v);
                addPoints(points, pn, u, v, iu, iv, color);
                indices.push(vid++);
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
                    pn = evalBSpline(model.patches[i], u, v);
                }
                addPoints(points, pn, u, v, iu, iv, color);
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
        if (ncp == 4) {
            quadOffset += 4;
        }

        // if it reached to 64K vertices, move to next batch
        if (vid > 60000) {
            appendVBO(points, indices);
            points = [];
            indices = [];
            vid = 0;
        }
    }

    // residual
    appendVBO(points, indices);
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
    var w = canvas.width();
    var h = canvas.height();
    var aspect = w / h;
    gl.viewport(0, 0, w, h);

    var proj = mat4.create();
    mat4.identity(proj);
    mat4.perspective(camera.fov, aspect, 0.1, 1000.0, proj);

    var modelView = mat4.create();
    mat4.identity(modelView);
    mat4.translate(modelView, [0, 0, -camera.dolly], modelView);
    mat4.rotate(modelView, camera.ry*Math.PI*2/360, [1, 0, 0], modelView);
    mat4.rotate(modelView, camera.rx*Math.PI*2/360, [0, 1, 0], modelView);
    mat4.translate(modelView, [-center[0], -center[1], -center[2]], modelView);

    var mvpMatrix = mat4.create();
    mat4.multiply(proj, modelView, mvpMatrix);

    if (drawHull) {
        gl.useProgram(cageProgram);
        gl.uniformMatrix4fv(cageProgram.mvpMatrix, false, mvpMatrix);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.hullVerts);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.hullIndices);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.drawElements(gl.LINES, model.cageLines.length, gl.UNSIGNED_SHORT, 0);
    }

    // ---------------------------
    gl.useProgram(program);
    gl.uniformMatrix4fv(program.modelViewMatrix, false, modelView);
    gl.uniformMatrix4fv(program.projMatrix, false, proj);
    gl.uniformMatrix4fv(program.mvpMatrix, false, mvpMatrix);
    gl.uniform1i(program.displayMode, displayMode);

    var drawTris = 0;
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.enableVertexAttribArray(3);
    for (var i = 0; i < model.batches.length; ++i) {
        var batch = model.batches[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ibo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 13*4, 0);    // XYZ
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 13*4, 3*4);  // normal
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 13*4, 6*4);  // uv, iuiv
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 13*4, 10*4); // color

        gl.drawElements(gl.TRIANGLES, batch.nTris*3, gl.UNSIGNED_SHORT, 0);

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
   // only change the size of the canvas if the size it's being displayed
   // has changed.
   var width = canvas.clientWidth;
   var height = canvas.clientHeight;
   if (canvas.width != width ||
       canvas.height != height) {
     // Change the size of the canvas to match the size it's being displayed
     canvas.width = width;
     canvas.height = height;
       redraw();
   }
}

$(function(){
    var canvas = $("#main").get(0);
    $.each(["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"], function(i, name){
        try {
            gl = canvas.getContext(name);
            gl.getExtension('OES_standard_derivatives');
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

    var button = false;
    var prev_position;
    document.onmousemove = function(e){
        var event = windowEvent();
        var p = getMousePosition();
        if (button > 0) {
            var d = vec3.subtract(p, prev_position, vec3.create());
            prev_position = p;
            if (button == 1) {
                camera.rx += d[0];
                camera.ry += d[1];
                if(camera.ry > 90) camera.ry = 90;
                if(camera.ry < -90) camera.ry = -90;
            }
            else if(button == 3){
                camera.dolly -= 0.01*d[0];
                if (camera.dolly < 0.1) camera.dolly = 0.001;
            }
            redraw();
        }
        return false;
    };
/*
    document.onmousewheel = function(e){
        var event = windowEvent();
        camera.dolly -= event.wheelDelta/200;
        if (camera.dolly < 0.1) camera.dolly = 0.1;
        redraw();
        return false;
    };
*/
    canvas.onmousedown = function(e){
        var event = windowEvent();
        button = event.button + 1;
        prev_position = getMousePosition();
        return false; // keep cursor shape
    };
    document.onmouseup = function(e){
        button = false;
        return false; // prevent context menu
    }
    document.oncontextmenu = function(e){
        return false;
    }

    window.addEventListener('resize', resizeCanvas);

    var modelSelect = $("#modelSelect").get(0);
    modelSelect.onclick = function(e){
        loadModel("objs/"+modelSelect.value+".json");
        redraw();
    }

    $( "#tessFactorRadio" ).buttonset();
    $( 'input[name="tessFactorRadio"]:radio' ).change(
        function() {
            tessFactor = ({tf1:1, tf2:2, tf3:3, tf4:4, tf5:5, tf6:6, tf7:7 })[this.id];
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

