//
//   Copyright 2014 Takahito Tejima (tejimaya@gmail.com)
//

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

function evalCubicBSplineP(u, B)
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
}

function csf0(n, j)
{
    return Math.cos((2.0 * Math.PI * j)/n);
}
function csf1(n, j)
{
    return Math.sin((2.0 * Math.PI * j)/n);
}

function readVertex(out, verts, vid)
{
    return vec3.set(out, verts[vid*3+0], verts[vid*3+1], verts[vid*3+2]);
}

function PatchEvaluator(maxValence) {
    this.B = vec4.create();
    this.D = vec4.create();
    this.BU = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.DU = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.verts = new Array(16);
    for (var i = 0; i < 16; ++i) this.verts[i] = vec3.create();
    this.Q = vec3.fromValues(0,0,0);
    this.N = vec3.fromValues(0,0,0);
    this.QU = vec3.fromValues(0,0,0);
    this.QV = vec3.fromValues(0,0,0);

    this.GP = new Array(20);
    for (var i = 0; i < 20; ++i) this.GP[i] = vec3.create();
    this.GQ = new Array(16);
    for (var i = 0; i < 16; ++i) this.GQ[i] = vec3.create();
    this.opos = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.org = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.e0 = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.e1 = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.Ep = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.Em = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.Fp = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.Fm = [vec3.create(), vec3.create(), vec3.create(), vec3.create()];
    this.Etmp = vec3.create();
    this.Em_ip = vec3.create();
    this.Ep_im = vec3.create();
    this.f = [];
    this.r = [];
    this.maxValence = maxValence;
    for (var i = 0; i < maxValence; ++i) {
        this.f.push(vec3.create());
        for (var j = 0; j < 4; ++j) {
            this.r.push(vec3.create());
        }
    }
    this.ef_small = [0.813008, 0.500000, 0.363636, 0.287505,
                     0.238692, 0.204549, 0.179211, 0.159657,
                     0.144042, 0.131276, 0.120632, 0.111614,
                     0.103872, 0.09715, 0.0912559, 0.0860444,
                     0.0814022, 0.0772401, 0.0734867, 0.0700842,
                     0.0669851, 0.0641504, 0.0615475, 0.0591488,
                     0.0569311, 0.0548745, 0.0529621];
    this.valences = [0, 0, 0, 0];
    this.pos = vec3.create();
    this.neighbor   = vec3.create();
    this.diagonal   = vec3.create();
    this.neighbor_p = vec3.create();
    this.neighbor_m = vec3.create();
    this.diagonal_m = vec3.create();

}

PatchEvaluator.prototype.evalGregory =
    function(vertsIndices, patchIndex, type, quadOffset)
{
    var valences = this.valences;
    var boundary = (type == 11)
    var ef_small = this.ef_small;
    var rp;
    var valenceTable = model.valenceTable;
    var quadOffsets = model.quadOffsets;
    var verts = model.patchVerts;
    var zerothNeighbors = [];
    var org = this.org;
    var opos = this.opos;
    var e0 = this.e0;
    var e1 = this.e1;
    var boundaryEdgeNeighbors = [-1,-1];
    var f = this.f;
    var r = this.r;
    var maxValence = this.maxValence;
    var Etmp = this.Etmp;

    var pos = this.pos;
    var neighbor   = this.neighbor;
    var diagonal   = this.diagonal;
    var neighbor_p = this.neighbor_p;
    var neighbor_m = this.neighbor_m;
    var diagonal_m = this.diagonal_m;

    for (var vid=0; vid < 4; ++vid) {
        boundaryEdgeNeighbors[0] = -1;
        boundaryEdgeNeighbors[1] = -1;
        var currNeighbor = 0;
        var ibefore = 0;
        zerothNeighbors[vid] = 0;

        var vertexID = vertsIndices[patchIndex*4 + vid];
        var valenceTableOffset = vertexID * (2*maxValence+1);
        var ivalence = valenceTable[valenceTableOffset];
        var valence = Math.abs(ivalence);
        valences[vid] = ivalence;

        // read vertexID
        readVertex(pos, verts, vertexID);
        vec3.copy(org[vid], pos);

        rp = vid*maxValence;
        //var vofs = vid;
        vec3.set(opos[vid], 0, 0, 0);

        for (var i=0; i<valence; ++i) {
            var im = (i+valence-1)%valence;
            var ip = (i+1)%valence;

            var idx_neighbor   = valenceTable[valenceTableOffset + 2*i  + 0 + 1];
            var idx_diagonal   = valenceTable[valenceTableOffset + 2*i  + 1 + 1];
            var idx_neighbor_p = valenceTable[valenceTableOffset + 2*ip + 0 + 1];
            var idx_neighbor_m = valenceTable[valenceTableOffset + 2*im + 0 + 1];
            var idx_diagonal_m = valenceTable[valenceTableOffset + 2*im + 1 + 1];

            readVertex(neighbor, verts, idx_neighbor);
            readVertex(diagonal, verts, idx_diagonal);
            readVertex(neighbor_p, verts, idx_neighbor_p);
            readVertex(neighbor_m, verts, idx_neighbor_m);
            readVertex(diagonal_m, verts, idx_diagonal_m);

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

            vec3.scale(f[i], pos, valence);
            vec3.scaleAndAdd(f[i], f[i], neighbor_p, 2.0);
            vec3.scaleAndAdd(f[i], f[i], neighbor,   2.0);
            vec3.add(f[i], f[i], diagonal);
            vec3.scale(f[i], f[i], 1.0/(valence+5.0));

            vec3.add(opos[vid], opos[vid], f[i]);

            for (var k = 0; k < 3; ++k) {
                r[rp+i][k] = (neighbor_p[k] - neighbor_m[k])/3.0 +
                    (diagonal[k] - diagonal_m[k])/6.0;
            }
            /*
            vec3.sub(r[rp+i], neighbor_p, neighbor_m);
            vec3.scale(r[rp+i], r[rp+i], 2);
            vec3.add(r[rp+i], r[rp+i], diagonal);
            vec3.sub(r[rp+i], r[rp+i], diagonal_m);
            vec3.scale(r[rp+i], r[rp+i], 1.0/6.0);
            */
        }

        // average opos
        vec3.scale(opos[vid], opos[vid], 1.0/valence);

        // compute e0, e1
        vec3.set(e0[vid], 0,0,0);
        vec3.set(e1[vid], 0,0,0);
        for (var i=0; i<valence; ++i) {
            var im = (i+valence-1)%valence;

            vec3.add(Etmp, f[i], f[im]);
            vec3.scale(Etmp, Etmp, 0.5*csf0(valence, i));
            vec3.add(e0[vid], e0[vid], Etmp);

            vec3.add(Etmp, f[i], f[im]);
            vec3.scale(Etmp, Etmp, 0.5*csf1(valence, i));
            vec3.add(e1[vid], e1[vid], Etmp);
        }
        vec3.scale(e0[vid], e0[vid], ef_small[valence-3]);
        vec3.scale(e1[vid], e1[vid], ef_small[valence-3]);

        if (boundary) {
            if (currNeighbor == 1) {
                boundaryEdgeNeighbors[1] = boundaryEdgeNeighbors[0];
            }

            if (ivalence < 0) {
                if (valence > 2) {
                    readVertex(Etmp, verts, boundaryEdgeNeighbors[0]);
                    readVertex(opos[vid], verts, boundaryEdgeNeighbors[1]);
                    vec3.add(opos[vid], opos[vid], Etmp);
                    vec3.scaleAndAdd(opos[vid], opos[vid], pos, 4);
                    vec3.scale(opos[vid], opos[vid], 1.0/6.0);
                } else {
                    vec3.copy(opos[vid], pos);
                }

                var fk = valence - 1;  // k is the number of faces
                var c = Math.cos(Math.PI/fk);
                var s = Math.sin(Math.PI/fk);
                var gamma = -(4.0*s)/(3.0*fk + c);
                var alpha_0k = -((1.0+2.0*c)*Math.sqrt(1.0+c))/((3.0*fk+c)*Math.sqrt(1.0-c));
                var beta_0 = s/(3.0*fk + c);

                var idx_diagonal = valenceTable[valenceTableOffset + 2*zerothNeighbors[vid]  + 1 + 1];
                idx_diagonal = Math.abs(idx_diagonal);

                readVertex(diagonal, verts, idx_diagonal);

                readVertex(e0[vid], verts, boundaryEdgeNeighbors[0]);
                readVertex(Etmp, verts, boundaryEdgeNeighbors[1]);
                vec3.sub(e0[vid], e0[vid], Etmp);
                vec3.scale(e0[vid], e0[vid], 1.0/6.0);

                vec3.scale(e1[vid], pos, gamma);
                readVertex(Etmp, verts, boundaryEdgeNeighbors[0]);
                vec3.scaleAndAdd(e1[vid], e1[vid], Etmp, alpha_0k);
                readVertex(Etmp, verts, boundaryEdgeNeighbors[1]);
                vec3.scaleAndAdd(e1[vid], e1[vid], Etmp, alpha_0k);
                vec3.scaleAndAdd(e1[vid], e1[vid], diagonal, beta_0);

                for (var x = 1; x<valence - 1; ++x) {
                    var curri = ((x + zerothNeighbors[vid])%valence);
                    var alpha = (4.0*Math.sin((Math.PI * x)/fk))/(3.0*fk+c);
                    var beta = (Math.sin((Math.PI * x)/fk)
                                + Math.sin((Math.PI * (x+1))/fk))/(3.0*fk+c);

                    var idx_neighbor = valenceTable[valenceTableOffset + 2*curri + 0 + 1];
                    idx_neighbor = Math.abs(idx_neighbor);
                    readVertex(neighbor, verts, idx_neighbor);
                    idx_diagonal = valenceTable[valenceTableOffset + 2*curri + 1 + 1];
                    readVertex(diagonal, verts, idx_diagonal);

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
    var Ep = this.Ep;
    var Em = this.Em;
    var Fp = this.Fp;
    var Fm = this.Fm;
    var Em_ip = this.Em_ip;
    var Ep_im = this.Ep_im;

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
            if (valences[ip] < -2) {
                var j = (np + prev_p - zerothNeighbors[ip]) % np;
                vec3.scaleAndAdd(Em_ip, opos[ip], e0[ip],
                                 Math.cos((Math.PI*j)/(np-1)));
                vec3.scaleAndAdd(Em_ip, Em_ip, e1[ip],
                                 Math.sin((Math.PI*j)/(np-1)));
            } else {
                vec3.scaleAndAdd(Em_ip, opos[ip], e0[ip], csf0(np, prev_p));
                vec3.scaleAndAdd(Em_ip, Em_ip,    e1[ip], csf1(np, prev_p));
            }

            if (valences[im] < -2) {
                var j = (nm + start_m - zerothNeighbors[im]) % nm;
                vec3.scaleAndAdd(Ep_im, opos[im], e0[im],
                                 Math.cos((Math.PI*j)/(nm-1)));
                vec3.scaleAndAdd(Ep_im, Ep_im, e1[im],
                                 Math.sin((Math.PI*j)/(nm-1)));
            } else {
                vec3.scaleAndAdd(Ep_im, opos[im], e0[im], csf0(nm, start_m));
                vec3.scaleAndAdd(Ep_im, Ep_im,    e1[im], csf1(nm, start_m));
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
                var s1 = 3.0 - 2.0*csf0(n,1)-csf0(np,1);
                var s2 =       2.0*csf0(n,1);
                var s3 = 3.0 - 2.0*Math.cos(2.0*Math.PI/n) - Math.cos(2.0*Math.PI/nm);

                vec3.scaleAndAdd(Ep[vid], opos[vid], e0[vid], csf0(n, start));
                vec3.scaleAndAdd(Ep[vid], Ep[vid],   e1[vid], csf1(n, start));
                vec3.scaleAndAdd(Em[vid], opos[vid], e0[vid], csf0(n, prev));
                vec3.scaleAndAdd(Em[vid], Em[vid],   e1[vid], csf1(n, prev));

                vec3.scale(Fp[vid], opos[vid], csf0(np,1));
                vec3.scaleAndAdd(Fp[vid], Fp[vid], Ep[vid], s1);
                vec3.scaleAndAdd(Fp[vid], Fp[vid], Em_ip, s2);
                vec3.add(Fp[vid], Fp[vid], r[rp+start]);
                vec3.scale(Fp[vid], Fp[vid], 1.0/3.0);

                vec3.scale(Fm[vid], opos[vid], csf0(nm,1));
                vec3.scaleAndAdd(Fm[vid], Fm[vid], Em[vid], s3);
                vec3.scaleAndAdd(Fm[vid], Fm[vid], Ep_im, s2);
                vec3.add(Fm[vid], Fm[vid], r[rp+prev]);
                vec3.scale(Fm[vid], Fm[vid], 1.0/3.0);

            } else if (valences[vid] < -2) {
                var jp = (ivalence + start - zerothNeighbors[vid]) % ivalence;
                var jm = (ivalence + prev  - zerothNeighbors[vid]) % ivalence;

                var s1 = 3-2*csf0(n,1)-csf0(np,1);
                var s2 = 2*csf0(n,1);
                var s3 = 3.0-2.0*Math.cos(2.0*Math.PI/n)-Math.cos(2.0*Math.PI/nm);

                for (var k=0; k < 3; ++k){
                    Ep[vid][k] = opos[vid][k]
                        + Math.cos((Math.PI*jp)/(ivalence-1))*e0[vid][k]
                        + Math.sin((Math.PI*jp)/(ivalence-1))*e1[vid][k];
                    Em[vid][k] = opos[vid][k]
                        + Math.cos((Math.PI*jm)/(ivalence-1))*e0[vid][k]
                        + Math.sin((Math.PI*jm)/(ivalence-1))*e1[vid][k];
                    Fp[vid][k] = (csf0(np,1)*opos[vid][k]
                                  + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                    Fm[vid][k] = (csf0(nm,1)*opos[vid][k]
                                  + s3*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
                }

                if (valences[im] <0) {
                    s1 = 3-2*csf0(n,1)-csf0(np,1);
                    for (var k=0; k < 3; ++k){
                        Fp[vid][k] = Fm[vid][k] =
                            (csf0(np,1)*opos[vid][k]
                             + s1*Ep[vid][k] + s2*Em_ip[k] + r[rp+start][k])/3.0;
                    }
                } else if (valences[ip] < 0) {
                    s1 = 3.0-2.0*Math.cos(2.0*Math.PI/n)-Math.cos(2.0*Math.PI/nm);
                    for (var k=0; k < 3; ++k){
                        Fm[vid][k] = Fp[vid][k] =
                            (csf0(nm,1)*opos[vid][k]
                             + s1*Em[vid][k] + s2*Ep_im[k] - r[rp+prev][k])/3.0;
                    }
                }
            } else if (valences[vid] == -2) {
                vec3.scaleAndAdd(Ep[vid], org[ip], org[vid]*2);
                vec3.scale(Ep[vid], Ep[vid], 1.0/3.0);
                vec3.scaleAndAdd(Em[vid], org[im], org[vid]*2);
                vec3.scale(Em[vid], Em[vid], 1.0/3.0);
                vec3.scaleAndAdd(Fp[vid], org[(vid+2)%n], org[vid], 4);
                vec3.scaleAndAdd(Fp[vid], Fp[vid], org[ip], 2);
                vec3.scaleAndAdd(Fp[vid], Fp[vid], org[im], 2);
                vec3.scale(Fp[vid], Fp[vid], 1.0/9.0);
                vec3.copy(Fm[vid], Fp[vid]);
            }
        } else {
            // no-boundary
            vec3.scale(Ep[vid], e0[vid], csf0(n, start));
            vec3.scale(Etmp,    e1[vid], csf1(n, start));
            vec3.add(Ep[vid], opos[vid], Ep[vid]);
            vec3.add(Ep[vid], Ep[vid], Etmp);

            vec3.scale(Em[vid], e0[vid], csf0(n, prev));
            vec3.scale(Etmp,    e1[vid], csf1(n, prev));
            vec3.add(Em[vid], opos[vid], Em[vid]);
            vec3.add(Em[vid], Em[vid], Etmp);

            var prev_p = (quadOffsets[quadOffset + ip] & 0xff00) / 256;
            var start_m = quadOffsets[quadOffset + im] & 0x00ff;

            vec3.scale(Em_ip, e0[ip], csf0(np, prev_p));
            vec3.scale(Etmp,  e1[ip], csf1(np, prev_p));
            vec3.add(Em_ip, opos[ip], Em_ip);
            vec3.add(Em_ip, Em_ip, Etmp);
            vec3.scale(Ep_im, e0[im], csf0(nm, start_m));
            vec3.scale(Etmp,  e1[im], csf1(nm, start_m));
            vec3.add(Ep_im, opos[im], Ep_im);
            vec3.add(Ep_im, Ep_im, Etmp);

            var s1 = 3.0 - 2.0*csf0(n,1)-csf0(np,1);
            var s2 = 2.0 * csf0(n,1);
            var s3 = 3.0 - 2.0*Math.cos(2.0*Math.PI/n) - Math.cos(2.0*Math.PI/nm);

            rp = vid*maxValence;

            vec3.scale(Fp[vid], opos[vid], csf0(np, 1));
            vec3.scaleAndAdd(Fp[vid], Fp[vid], Ep[vid], s1);
            vec3.scaleAndAdd(Fp[vid], Fp[vid], Em_ip, s2);
            vec3.add(Fp[vid], Fp[vid], r[rp+start]);
            vec3.scale(Fp[vid], Fp[vid], 1.0/3.0);

            vec3.scale(Fm[vid], opos[vid], csf0(nm, 1));
            vec3.scaleAndAdd(Fm[vid], Fm[vid], Em[vid], s3);
            vec3.scaleAndAdd(Fm[vid], Fm[vid], Ep_im, s2);
            vec3.sub(Fm[vid], Fm[vid], r[rp+prev]);
            vec3.scale(Fm[vid], Fm[vid], 1.0/3.0);
        }
    }

    for (var i=0; i<4; ++i) {
        vec3.copy(this.GP[i*5+0], opos[i]);
        vec3.copy(this.GP[i*5+1], Ep[i]);
        vec3.copy(this.GP[i*5+2], Em[i]);
        vec3.copy(this.GP[i*5+3], Fp[i]);
        vec3.copy(this.GP[i*5+4], Fm[i]);
    }
}

PatchEvaluator.prototype.evalGregoryUV =
    function(GP, u, v)
{
    var U = 1-u, V=1-v;
    var d11 = u+v; if(u+v==0.0) d11 = 1.0;
    var d12 = U+v; if(U+v==0.0) d12 = 1.0;
    var d21 = u+V; if(u+V==0.0) d21 = 1.0;
    var d22 = U+V; if(U+V==0.0) d22 = 1.0;

    for (var k=0; k<3; ++k) {
        this.GQ[ 5][k] = (u*GP[ 3][k] + v*GP[ 4][k])/d11;
        this.GQ[ 6][k] = (U*GP[ 9][k] + v*GP[ 8][k])/d12;
        this.GQ[ 9][k] = (u*GP[19][k] + V*GP[18][k])/d21;
        this.GQ[10][k] = (U*GP[13][k] + V*GP[14][k])/d22;
    }

    vec3.copy(this.GQ[ 0], GP[ 0]);
    vec3.copy(this.GQ[ 1], GP[ 1]);
    vec3.copy(this.GQ[ 2], GP[ 7]);
    vec3.copy(this.GQ[ 3], GP[ 5]);
    vec3.copy(this.GQ[ 4], GP[ 2]);
    vec3.copy(this.GQ[ 7], GP[ 6]);
    vec3.copy(this.GQ[ 8], GP[16]);
    vec3.copy(this.GQ[11], GP[12]);
    vec3.copy(this.GQ[12], GP[15]);
    vec3.copy(this.GQ[13], GP[17]);
    vec3.copy(this.GQ[14], GP[11]);
    vec3.copy(this.GQ[15], GP[10]);

    // bezier evaluation
    vec3.set(this.BU[0],0,0,0);
    vec3.set(this.BU[1],0,0,0);
    vec3.set(this.BU[2],0,0,0);
    vec3.set(this.BU[3],0,0,0);
    vec3.set(this.DU[0],0,0,0);
    vec3.set(this.DU[1],0,0,0);
    vec3.set(this.DU[2],0,0,0);
    vec3.set(this.DU[3],0,0,0);
    vec3.set(this.Q,0,0,0);
    vec3.set(this.N,0,0,0);
    vec3.set(this.QU,0,0,0);
    vec3.set(this.QV,0,0,0);

    evalCubicBezier(u, this.B, this.D);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j < 4;j++){
            vec3.scaleAndAdd(this.BU[i], this.BU[i], this.GQ[i+j*4], this.B[j]);
            vec3.scaleAndAdd(this.DU[i], this.DU[i], this.GQ[i+j*4], this.D[j]);
        }
    }
    evalCubicBezier(v, this.B, this.D);
    for(var i=0;i<4; i++){
        vec3.scaleAndAdd(this.Q, this.Q, this.BU[i], this.B[i]);
        vec3.scaleAndAdd(this.QU, this.QU, this.DU[i], this.B[i]);
        vec3.scaleAndAdd(this.QV, this.QV, this.BU[i], this.D[i]);
    }
    vec3.cross(this.N, this.QV, this.QU);

    return [this.Q, this.N];
}

PatchEvaluator.prototype.evalGregoryDirect =
    function(vertsIndices, patchIndex, type, quadOffset, u, v)
{
    this.evalGregory(vertsIndices, patchIndex, type, quadOffset);

    return this.evalGregoryUV(this.GP, u, v);
}

PatchEvaluator.prototype.evalGregoryBasis =
    function(vertsIndices, patchIndex, u, v)
{
    for (var i = 0; i < 20; ++i) {
        var vid = vertsIndices[patchIndex*20 + i]
        vec3.set(this.GP[i], model.patchVerts[vid*3], model.patchVerts[vid*3+1], model.patchVerts[vid*3+2]);
    }
    return this.evalGregoryUV(this.GP, u, v);
}

PatchEvaluator.prototype.evalBSplineP =
    function(vertsIndices, patchIndex, u, v)
{
    vec3.set(this.BU[0],0,0,0);
    vec3.set(this.BU[1],0,0,0);
    vec3.set(this.BU[2],0,0,0);
    vec3.set(this.BU[3],0,0,0);

    var ncp = 16;
    if (vertsIndices[patchIndex*16+4] == -1) ncp = 4;
    else if (vertsIndices[patchIndex*16+9] == -1) ncp = 9;
    else if (vertsIndices[patchIndex*16+12] == -1) ncp = 12;

    var border = (ncp == 12);
    var corner = (ncp == 9);
    var vofs = (border || corner) ? 4 : 0;
    for (var i = 0; i < ncp; ++i) {
        var x = model.patchVerts[vertsIndices[patchIndex*16+i]*3+0];
        var y = model.patchVerts[vertsIndices[patchIndex*16+i]*3+1];
        var z = model.patchVerts[vertsIndices[patchIndex*16+i]*3+2];
        vec3.set(this.verts[i+vofs], x, y, z);
    }

    // mirroring boundary vertices.
    if (border) {
        vec3.scale(this.verts[0], this.verts[4], 2);
        vec3.scale(this.verts[1], this.verts[5], 2);
        vec3.scale(this.verts[2], this.verts[6], 2);
        vec3.scale(this.verts[3], this.verts[7], 2);
        vec3.sub(this.verts[0], this.verts[0], this.verts[8]);
        vec3.sub(this.verts[1], this.verts[1], this.verts[9]);
        vec3.sub(this.verts[2], this.verts[2], this.verts[10]);
        vec3.sub(this.verts[3], this.verts[3], this.verts[11]);
    } else if (corner) {
        vec3.copy(this.verts[14], this.verts[12]);
        vec3.copy(this.verts[13], this.verts[11]);
        vec3.copy(this.verts[12], this.verts[10]);
        vec3.copy(this.verts[10], this.verts[9]);
        vec3.copy(this.verts[9], this.verts[8]);
        vec3.copy(this.verts[8], this.verts[7]);

        vec3.scale(this.verts[0], this.verts[4], 2);
        vec3.scale(this.verts[1], this.verts[5], 2);
        vec3.scale(this.verts[2], this.verts[6], 2);
        vec3.scale(this.verts[3], this.verts[6], 2);
        vec3.scale(this.verts[7], this.verts[6], 2);
        vec3.scale(this.verts[11], this.verts[10], 2);
        vec3.scale(this.verts[15], this.verts[14], 2);
        vec3.sub(this.verts[0], this.verts[0], this.verts[8]);
        vec3.sub(this.verts[1], this.verts[1], this.verts[9]);
        vec3.sub(this.verts[2], this.verts[2], this.verts[10]);
        vec3.sub(this.verts[3], this.verts[3], this.verts[9]);
        vec3.sub(this.verts[7], this.verts[7], this.verts[5]);
        vec3.sub(this.verts[11], this.verts[11], this.verts[9]);
        vec3.sub(this.verts[15], this.verts[15], this.verts[13]);
    }

    evalCubicBSplineP(u, this.B);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j < 4;j++){
            vec3.scaleAndAdd(this.BU[i], this.BU[i], this.verts[i+j*4], this.B[j]);
        }
    }
    evalCubicBSplineP(v, this.B);

    vec3.set(this.Q,0,0,0);
    for(var i=0;i<4; i++){
        vec3.scaleAndAdd(this.Q, this.Q, this.BU[i], this.B[i]);
    }
    return this.Q;
}

PatchEvaluator.prototype.evalBSpline =
    function(vertsIndices, patchIndex, u, v)
{
    vec3.set(this.BU[0],0,0,0);
    vec3.set(this.BU[1],0,0,0);
    vec3.set(this.BU[2],0,0,0);
    vec3.set(this.BU[3],0,0,0);
    vec3.set(this.DU[0],0,0,0);
    vec3.set(this.DU[1],0,0,0);
    vec3.set(this.DU[2],0,0,0);
    vec3.set(this.DU[3],0,0,0);

    var ncp = 16;
    if (vertsIndices[patchIndex*16+4] == -1) ncp = 4;
    else if (vertsIndices[patchIndex*16+9] == -1) ncp = 9;
    else if (vertsIndices[patchIndex*16+12] == -1) ncp = 12;

    var border = (ncp == 12);
    var corner = (ncp == 9);
    var vofs = (border || corner) ? 4 : 0;
    for (var i = 0; i < ncp; ++i) {
        var x = model.patchVerts[vertsIndices[patchIndex*16+i]*3+0];
        var y = model.patchVerts[vertsIndices[patchIndex*16+i]*3+1];
        var z = model.patchVerts[vertsIndices[patchIndex*16+i]*3+2];
        vec3.set(this.verts[i+vofs], x, y, z);
    }

    // mirroring boundary vertices.
    if (border) {
        vec3.scale(this.verts[0], this.verts[4], 2);
        vec3.scale(this.verts[1], this.verts[5], 2);
        vec3.scale(this.verts[2], this.verts[6], 2);
        vec3.scale(this.verts[3], this.verts[7], 2);
        vec3.sub(this.verts[0], this.verts[0], this.verts[8]);
        vec3.sub(this.verts[1], this.verts[1], this.verts[9]);
        vec3.sub(this.verts[2], this.verts[2], this.verts[10]);
        vec3.sub(this.verts[3], this.verts[3], this.verts[11]);
    } else if (corner) {
        vec3.copy(this.verts[14], this.verts[12]);
        vec3.copy(this.verts[13], this.verts[11]);
        vec3.copy(this.verts[12], this.verts[10]);
        vec3.copy(this.verts[10], this.verts[9]);
        vec3.copy(this.verts[9], this.verts[8]);
        vec3.copy(this.verts[8], this.verts[7]);

        vec3.scale(this.verts[0], this.verts[4], 2);
        vec3.scale(this.verts[1], this.verts[5], 2);
        vec3.scale(this.verts[2], this.verts[6], 2);
        vec3.scale(this.verts[3], this.verts[6], 2);
        vec3.scale(this.verts[7], this.verts[6], 2);
        vec3.scale(this.verts[11], this.verts[10], 2);
        vec3.scale(this.verts[15], this.verts[14], 2);
        vec3.sub(this.verts[0], this.verts[0], this.verts[8]);
        vec3.sub(this.verts[1], this.verts[1], this.verts[9]);
        vec3.sub(this.verts[2], this.verts[2], this.verts[10]);
        vec3.sub(this.verts[3], this.verts[3], this.verts[9]);
        vec3.sub(this.verts[7], this.verts[7], this.verts[5]);
        vec3.sub(this.verts[11], this.verts[11], this.verts[9]);
        vec3.sub(this.verts[15], this.verts[15], this.verts[13]);
    }

    evalCubicBSpline(u, this.B, this.D);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j < 4;j++){
            vec3.scaleAndAdd(this.BU[i], this.BU[i], this.verts[i+j*4], this.B[j]);
            vec3.scaleAndAdd(this.DU[i], this.DU[i], this.verts[i+j*4], this.D[j]);
        }
    }
    evalCubicBSpline(v, this.B, this.D);

    vec3.set(this.Q,0,0,0);
    vec3.set(this.N,0,0,0);
    vec3.set(this.QU,0,0,0);
    vec3.set(this.QV,0,0,0);
    for(var i=0;i<4; i++){
        vec3.scaleAndAdd(this.Q, this.Q, this.BU[i], this.B[i]);
        vec3.scaleAndAdd(this.QU, this.QU, this.DU[i], this.B[i]);
        vec3.scaleAndAdd(this.QV, this.QV, this.BU[i], this.D[i]);
    }
    vec3.cross(this.N, this.QV, this.QU);

    return [this.Q, this.N];
}

