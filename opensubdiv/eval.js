
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

    var Q = vec3.fromValues(0,0,0);
    var QU = vec3.fromValues(0,0,0);
    var QV = vec3.fromValues(0,0,0);
    for(var i=0;i<4; i++){
        Q  = vec3.scaleAndAdd(Q, Q, BU[i], B[i]);
        QU = vec3.scaleAndAdd(QU, QU, DU[i], B[i]);
        QV = vec3.scaleAndAdd(QV, QV, BU[i], D[i]);
    }
    var N = vec3.cross(vec3.create(), QV, QU);

    return [Q, N];
}

function PatchEvaluator() {
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

}

PatchEvaluator.prototype.evalBSpline = function(indices, u, v)
{
    vec3.set(this.B,0,0,0,0);
    vec3.set(this.D,0,0,0,0);
    vec3.set(this.BU[0],0,0,0);
    vec3.set(this.BU[1],0,0,0);
    vec3.set(this.BU[2],0,0,0);
    vec3.set(this.BU[3],0,0,0);
    vec3.set(this.DU[0],0,0,0);
    vec3.set(this.DU[1],0,0,0);
    vec3.set(this.DU[2],0,0,0);
    vec3.set(this.DU[3],0,0,0);

    var border = (indices.length == 12);
    var corner = (indices.length == 9);
    var vofs = (border || corner) ? 4 : 0;
    for (var i = 0; i < indices.length; ++i) {
        var p = model.patchVerts[indices[i]];
        vec3.set(this.verts[i+vofs], p[0], p[1], p[2]);
    }
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
        vec3.sub(this.verts[0], this.verts[1], this.verts[9]);
        vec3.sub(this.verts[0], this.verts[2], this.verts[10]);
        vec3.sub(this.verts[0], this.verts[3], this.verts[9]);
        vec3.sub(this.verts[0], this.verts[7], this.verts[5]);
        vec3.sub(this.verts[0], this.verts[11], this.verts[9]);
        vec3.sub(this.verts[0], this.verts[15], this.verts[13]);
    }

    evalCubicBSpline(u, this.B, this.D);
    for (var i = 0; i < 4; i++) {
        for(var j=0;j < 4;j++){
            var vid = indices[i+j*4];
            this.BU[i] = vec3.scaleAndAdd(this.BU[i], this.BU[i], this.verts[i+j*4], this.B[j]);
            this.DU[i] = vec3.scaleAndAdd(this.DU[i], this.DU[i], this.verts[i+j*4], this.D[j]);
        }
    }
    evalCubicBSpline(v, this.B, this.D);

    vec3.set(this.Q,0,0,0);
    vec3.set(this.N,0,0,0);
    vec3.set(this.QU,0,0,0);
    vec3.set(this.QV,0,0,0);
    for(var i=0;i<4; i++){
        this.Q  = vec3.scaleAndAdd(this.Q, this.Q, this.BU[i], this.B[i]);
        this.QU = vec3.scaleAndAdd(this.QU, this.QU, this.DU[i], this.B[i]);
        this.QV = vec3.scaleAndAdd(this.QV, this.QV, this.BU[i], this.D[i]);
    }
    vec3.cross(this.N, this.QV, this.QU);

    return [this.Q, this.N];
}

