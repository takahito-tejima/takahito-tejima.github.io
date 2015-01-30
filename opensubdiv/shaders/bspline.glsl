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
    vec3 cp[16];
    vec2 vids[16];
    for (int i = 0; i < 16; ++i) {
        vids[i] = getVertexIndex(patchData.x, float(i));
    }
    if (vids[9].x == -1.0) {
        // corner
        for (int i = 0; i < 9; ++i) {
            cp[i+4] = texture2D(texCP, vids[i]).xyz;
        }
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
    } else if (vids[15].x == -1.0) {
        // boundary
        for (int i = 0; i < 12; ++i) {
            cp[i+4] = texture2D(texCP, vids[i]).xyz;
        }
        cp[0] = cp[4]*2.0 - cp[8];
        cp[1] = cp[5]*2.0 - cp[9];
        cp[2] = cp[6]*2.0 - cp[10];
        cp[3] = cp[7]*2.0 - cp[11];
    } else {
        // regular
        for (int i = 0; i < 16; ++i) {
            cp[i] = texture2D(texCP, vids[i]).xyz;
        }
    }

    float B[4], D[4];
    vec3 BUCP[4], DUCP[4];
    BUCP[0] = BUCP[1] = BUCP[2] = BUCP[3] = vec3(0);
    DUCP[0] = DUCP[1] = DUCP[2] = DUCP[3] = vec3(0);

    color = inColor.xyz;

    // adaptive stitch
#if 0
    float pv_u0 = floor(inUV.w / tessLevel.w)/(patchData.y/tessLevel.w);
    float pv_u1 = floor(inUV.w / tessLevel.y)/(patchData.y/tessLevel.y);
    float pu_v0 = floor(inUV.z / tessLevel.x)/(patchData.y/tessLevel.x);
    float pu_v1 = floor(inUV.z / tessLevel.z)/(patchData.y/tessLevel.z);
    float pu = mix(pu_v0, pu_v1, inUV.y);
    float pv = mix(pv_u0, pv_u1, inUV.x);
#else
    float pu = inUV.x;
    float pv = inUV.y;
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

    for (int i=0; i<4; ++i) {
        for (int j=0; j<4; ++j) {
            vec3 A = cp[4*j + i].xyz;
            BUCP[i] += A * B[j];
            DUCP[i] += A * D[j];
        }
    }

    vec3 WorldPos  = vec3(0);
    vec3 Tangent   = vec3(0);
    vec3 BiTangent = vec3(0);

    evalCubicBSpline(pv, B, D);

    for (int k=0; k<4; ++k) {
        WorldPos  += B[k] * BUCP[k];
        Tangent   += B[k] * DUCP[k];
        BiTangent += D[k] * BUCP[k];
    }
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
