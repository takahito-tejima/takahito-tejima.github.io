//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   Bi-cubic B-Spline evaluation shader

#ifdef VERTEX_SHADER

void evalCubicBSpline(in float u, out float B[4], out float BU[4])
{
    float t = u;
    float s = 1.0 - u;
    float A0 =                     s * (0.5 * s);
    float A1 = t * (s + 0.5 * t) + s * (0.5 * s + t);
    float A2 = t * (    0.5 * t);
    B[0] =                                 1.0/3.0 * s              * A0;
    B[1] = (2.0/3.0 * s +         t) * A0 + (2.0/3.0 * s + 1.0/3.0 * t) * A1;
    B[2] = (1.0/3.0 * s + 2.0/3.0 * t) * A1 + (        s + 2.0/3.0 * t) * A2;
    B[3] =              1.0/3.0 * t  * A2;
    BU[0] =    - A0;
    BU[1] = A0 - A1;
    BU[2] = A1 - A2;
    BU[3] = A2;
}

attribute vec4 inUV;
attribute vec4 patchData; // patchIndex, tess, depth
attribute vec4 tessLevel;
attribute vec4 inColor;
attribute vec4 ptexParam; // ptexFaceID, u, v, rotation

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec4 ptexCoord;

uniform sampler2D texCP;
uniform sampler2D texPatch;
uniform float patchRes; // square, *16
uniform float pointRes; // squre

vec2 getVertexIndex(float patchIndex, float cpIndex) {
    float u = fract(patchIndex*16.0/patchRes) + (cpIndex+0.5)/patchRes;
    float v = (floor(patchIndex*16.0/patchRes)+0.5)/patchRes;
    return texture2D(texPatch, vec2(u,v)).xy;
}

void main() {
    float B[4], D[4];
    vec3 cp[16];
    vec2 vids[16];
#if 0  // seemingly Android chrome crashes with this kind of loop....
    for (int i = 0; i < 16; ++i) {
        vids[i] = getVertexIndex(patchData.x, float(i));
    }
#else
    vids[ 0] = getVertexIndex(patchData.x, 0.0);
    vids[ 1] = getVertexIndex(patchData.x, 1.0);
    vids[ 2] = getVertexIndex(patchData.x, 2.0);
    vids[ 3] = getVertexIndex(patchData.x, 3.0);
    vids[ 4] = getVertexIndex(patchData.x, 4.0);
    vids[ 5] = getVertexIndex(patchData.x, 5.0);
    vids[ 6] = getVertexIndex(patchData.x, 6.0);
    vids[ 7] = getVertexIndex(patchData.x, 7.0);
    vids[ 8] = getVertexIndex(patchData.x, 8.0);
    vids[ 9] = getVertexIndex(patchData.x, 9.0);
    vids[10] = getVertexIndex(patchData.x, 10.0);
    vids[11] = getVertexIndex(patchData.x, 11.0);
    vids[12] = getVertexIndex(patchData.x, 12.0);
    vids[13] = getVertexIndex(patchData.x, 13.0);
    vids[14] = getVertexIndex(patchData.x, 14.0);
    vids[15] = getVertexIndex(patchData.x, 15.0);
#endif

    if (vids[9].x == -1.0) {
        // corner
#ifndef ANDROID
        cp[ 4] = texture2D(texCP, vids[ 0]).xyz;
        cp[ 5] = texture2D(texCP, vids[ 1]).xyz;
        cp[ 6] = texture2D(texCP, vids[ 2]).xyz;
        cp[ 7] = texture2D(texCP, vids[ 3]).xyz;
        cp[ 8] = texture2D(texCP, vids[ 4]).xyz;
        cp[ 9] = texture2D(texCP, vids[ 5]).xyz;
        cp[10] = texture2D(texCP, vids[ 6]).xyz;
        cp[11] = texture2D(texCP, vids[ 7]).xyz;
        cp[12] = texture2D(texCP, vids[ 8]).xyz;

        cp[14] = cp[12];
        cp[13] = cp[11];
        cp[12] = cp[10];
        cp[10] = cp[9];
        cp[9] = cp[8];
        cp[8] = cp[7];
        cp[0] = cp[4]*2.0 - cp[8];
        cp[1] = cp[5]*2.0 - cp[9];
        cp[2] = cp[6]*2.0 - cp[10];
        cp[3] = cp[6]*2.0 - cp[9];
        cp[7] = cp[6]*2.0 - cp[5];
        cp[11] = cp[10]*2.0 - cp[9];
        cp[15] = cp[14]*2.0 - cp[13];
#endif
    } else if (vids[15].x < 0.0) {
#ifndef ANDROID
        // boundary
        cp[ 4] = texture2D(texCP, vids[ 0]).xyz;
        cp[ 5] = texture2D(texCP, vids[ 1]).xyz;
        cp[ 6] = texture2D(texCP, vids[ 2]).xyz;
        cp[ 7] = texture2D(texCP, vids[ 3]).xyz;
        cp[ 8] = texture2D(texCP, vids[ 4]).xyz;
        cp[ 9] = texture2D(texCP, vids[ 5]).xyz;
        cp[10] = texture2D(texCP, vids[ 6]).xyz;
        cp[11] = texture2D(texCP, vids[ 7]).xyz;
        cp[12] = texture2D(texCP, vids[ 8]).xyz;
        cp[13] = texture2D(texCP, vids[ 9]).xyz;
        cp[14] = texture2D(texCP, vids[10]).xyz;
        cp[15] = texture2D(texCP, vids[11]).xyz;
        cp[0] = cp[4]*2.0 - cp[8];
        cp[1] = cp[5]*2.0 - cp[9];
        cp[2] = cp[6]*2.0 - cp[10];
        cp[3] = cp[7]*2.0 - cp[11];
#endif
    } else {
        // regular
        cp[ 0] = texture2D(texCP, vids[ 0]).xyz;
        cp[ 1] = texture2D(texCP, vids[ 1]).xyz;
        cp[ 2] = texture2D(texCP, vids[ 2]).xyz;
        cp[ 3] = texture2D(texCP, vids[ 3]).xyz;
        cp[ 4] = texture2D(texCP, vids[ 4]).xyz;
        cp[ 5] = texture2D(texCP, vids[ 5]).xyz;
        cp[ 6] = texture2D(texCP, vids[ 6]).xyz;
        cp[ 7] = texture2D(texCP, vids[ 7]).xyz;
        cp[ 8] = texture2D(texCP, vids[ 8]).xyz;
        cp[ 9] = texture2D(texCP, vids[ 9]).xyz;
        cp[10] = texture2D(texCP, vids[10]).xyz;
        cp[11] = texture2D(texCP, vids[11]).xyz;
        cp[12] = texture2D(texCP, vids[12]).xyz;
        cp[13] = texture2D(texCP, vids[13]).xyz;
        cp[14] = texture2D(texCP, vids[14]).xyz;
        cp[15] = texture2D(texCP, vids[15]).xyz;
    }

    color = inColor.xyz;

    // adaptive stitch
    float pu = inUV.x;
    float pv = inUV.y;
#if 1
    float pv_u0 = floor(inUV.w / tessLevel.w)/(patchData.y/tessLevel.w);
    float pv_u1 = floor(inUV.w / tessLevel.y)/(patchData.y/tessLevel.y);
    float pu_v0 = floor(inUV.z / tessLevel.x)/(patchData.y/tessLevel.x);
    float pu_v1 = floor(inUV.z / tessLevel.z)/(patchData.y/tessLevel.z);
    pu = mix(pu_v0, pu_v1, pv);
    pv = mix(pv_u0, pv_u1, pu);
#else
    if (pu == 0.0) {
        pv = floor(inUV.w / tessLevel.w)/(patchData.y/tessLevel.w);
    } else if (pu == 1.0) {
        pv = floor(inUV.w / tessLevel.y)/(patchData.y/tessLevel.y);
    } else if (pv == 0.0) {
        pu = floor(inUV.z / tessLevel.x)/(patchData.y/tessLevel.x);
    } else if (pv == 1.0) {
        pu = floor(inUV.z / tessLevel.z)/(patchData.y/tessLevel.z);
    }
#endif

    evalCubicBSpline(pu, B, D);

    vec3 BUCP[4], DUCP[4];
    vec3 WorldPos, Tangent, BiTangent;

    BUCP[0] = cp[0]*B[0] + cp[4]*B[1] + cp[ 8]*B[2] + cp[12]*B[3];
    BUCP[1] = cp[1]*B[0] + cp[5]*B[1] + cp[ 9]*B[2] + cp[13]*B[3];
    BUCP[2] = cp[2]*B[0] + cp[6]*B[1] + cp[10]*B[2] + cp[14]*B[3];
    BUCP[3] = cp[3]*B[0] + cp[7]*B[1] + cp[11]*B[2] + cp[15]*B[3];

    DUCP[0] = cp[0]*D[0] + cp[4]*D[1] + cp[ 8]*D[2] + cp[12]*D[3];
    DUCP[1] = cp[1]*D[0] + cp[5]*D[1] + cp[ 9]*D[2] + cp[13]*D[3];
    DUCP[2] = cp[2]*D[0] + cp[6]*D[1] + cp[10]*D[2] + cp[14]*D[3];
    DUCP[3] = cp[3]*D[0] + cp[7]*D[1] + cp[11]*D[2] + cp[15]*D[3];

    evalCubicBSpline(pv, B, D);

    WorldPos  = B[0]*BUCP[0] + B[1]*BUCP[1] + B[2]*BUCP[2] + B[3]*BUCP[3];
    Tangent   = B[0]*DUCP[0] + B[1]*DUCP[1] + B[2]*DUCP[2] + B[3]*DUCP[3];
    BiTangent = D[0]*BUCP[0] + D[1]*BUCP[1] + D[2]*BUCP[2] + D[3]*BUCP[3];

    vec3 n = normalize(cross(BiTangent, Tangent));

    ptexCoord.xy = computePtexCoord(texPtexColorL,
                                    dimPtexColorL,
                                    ptexParam, patchData.z, vec2(pv,pu));
    ptexCoord.zw = computePtexCoord(texPtexDisplaceL,
                                    dimPtexDisplaceL,
                                    ptexParam, patchData.z, vec2(pv,pu));

    // apply displacement
#ifdef DISPLACEMENT
#ifndef PTEX_DISPLACE
    ptexCoord.zw = WorldPos.xz*4.0;
#endif
    float d = displacement(ptexCoord.zw);
    WorldPos.xyz += d*n;
#endif

    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    uv = inUV;
    Peye = p;
    gl_Position = projMatrix * vec4(p, 1);
    gl_PointSize=10.0;
}
#endif

// --------------------------------------------------------------------------
#ifdef FRAGMENT_SHADER

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec4 ptexCoord;

uniform int displayMode;

void main()
{
    vec3 fnormal = normal;
#ifdef DISPLACEMENT
    if (displaceScale > 0.0) {
#ifdef FLAT_NORMAL
        vec3 X = 100.0*dFdx(Peye);
        vec3 Y = 100.0*dFdy(Peye);
        fnormal = normalize( cross(X, Y) );
#else
        fnormal = perturbNormalFromDisplacement(Peye,
                                                fnormal, ptexCoord.zw);
#endif
    }
#endif
    vec3 l = normalize(vec3(-0.3,0.5,1));
    float d = max(0.0, dot(fnormal, l));
    vec3 h = normalize(l + vec3(0,0,1));    // directional viewer
    float s = pow(max(0.0, dot(fnormal, h)), 64.0);
    vec4 c = vec4(color, 1);

#if DISPLAY_MODE == 0
#ifdef PTEX_COLOR
    c = getPtexColor(ptexCoord);
#else
    c.rgb = vec3(0.4, 0.4, 0.8);
#endif

    c = vec4(d*c.rgb + s*vec3(0.7),1);

#elif DISPLAY_MODE == 1
    c = vec4(d*c.rgb,1);
#elif DISPLAY_MODE == 2
    c = vec4(d*c.rgb,1);
    vec2 vRel = fract(uv.zw);
    float edge = max(1.0-vRel.x, max(1.0-vRel.y, max(vRel.x, vRel.y)));

    vec2 dist = fwidth(vRel);
    vec2 a2 = smoothstep(vec2(0), dist*1.0, vRel);
    edge = 1.0 -(a2.x + a2.y)*0.5;
    c = mix(c, vec4(0,0,0,1), edge);
#elif DISPLAY_MODE == 3
    c = vec4(fnormal, 1);
#elif DISPLAY_MODE == 4
    c = vec4(uv.x, uv.y, 1, 1);
    c.rgb = vec3(ptexCoord.xy, 0);
#endif

    gl_FragColor = c;
}

#endif
