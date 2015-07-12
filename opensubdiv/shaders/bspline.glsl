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
attribute vec4 patchData; // patchIndex, tess, depth, boundary
attribute vec4 tessLevel;
attribute vec4 inColor;
attribute vec4 ptexParam; // ptexFaceID, u, v, rotation

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec2 texUV;

uniform sampler2D texCP;
uniform sampler2D texPatch;
uniform sampler2D texUVBuffer;
uniform float patchRes; // square, *16
uniform float pointRes; // squre
uniform float uvBufferRes; // square

vec2 getVertexIndex(float patchIndex, float cpIndex) {
    float u = fract(patchIndex*16.0/patchRes) + (cpIndex+0.5)/patchRes;
    float v = (floor(patchIndex*16.0/patchRes)+0.5)/patchRes;
    return texture2D(texPatch, vec2(u,v)).xy;
}

vec4 getPatchUV(float patchIndex, float index) {
    float u = fract(patchIndex*2.0/uvBufferRes) + (index+0.5)/uvBufferRes;
    float v = (floor(patchIndex*2.0/uvBufferRes)+0.5)/uvBufferRes;
    return texture2D(texUVBuffer, vec2(u,v));
}

void main() {
    float B[4], D[4];
    vec3 cp[16];
    vec2 vids[16];
    for (int i = 0; i < 16; ++i) {
        vids[i] = getVertexIndex(patchData.x, float(i));
    }

    float boundary = patchData.w;

    // fetch verts
    for (int i = 0; i < 16; ++i) {
        cp[i] = texture2D(texCP, vids[i]).xyz;
    }

    if (mod(boundary, 2.0) >= 1.0)
    {
        cp[0] = 2.0*cp[4] - cp[8];
        cp[1] = 2.0*cp[5] - cp[9];
        cp[2] = 2.0*cp[6] - cp[10];
        cp[3] = 2.0*cp[7] - cp[11];
    }
    if (mod(boundary, 4.0) >= 2.0)
    {
        cp[3] = 2.0*cp[2] - cp[1];
        cp[7] = 2.0*cp[6] - cp[5];
        cp[11] = 2.0*cp[10] - cp[9];
        cp[15] = 2.0*cp[14] - cp[13];
    }
    if (mod(boundary, 8.0) >= 4.0)
    {
        cp[12] = 2.0*cp[8] - cp[4];
        cp[13] = 2.0*cp[9] - cp[5];
        cp[14] = 2.0*cp[10] - cp[6];
        cp[15] = 2.0*cp[11] - cp[7];
    }
    if (mod(boundary, 16.0) >= 8.0)
    {
        cp[0] = 2.0*cp[1] - cp[2];
        cp[4] = 2.0*cp[5] - cp[6];
        cp[8] = 2.0*cp[9] - cp[10];
        cp[12] = 2.0*cp[13] - cp[14];
    }

    color = inColor.xyz;

    // adaptive stitch
    float pu = inUV.x;
    float pv = inUV.y;
#if 0
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

    // fetch UVs
    vec2 patchUV0 = getPatchUV(patchData.x, 0.0).xy;
    vec2 patchUV1 = getPatchUV(patchData.x, 0.0).zw;
    vec2 patchUV2 = getPatchUV(patchData.x, 1.0).xy;
    vec2 patchUV3 = getPatchUV(patchData.x, 1.0).zw;
    texUV = mix(mix(patchUV0, patchUV1, pv),
                mix(patchUV3, patchUV2, pv), pu);

    // apply displacement
#ifdef DISPLACEMENT
    float d = displacement(texUV);
    WorldPos.xyz += d*n;
#endif

    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    Peye = p;

#if defined(PAINT)
    uv = projMatrix * vec4(p, 1);
    gl_Position = vec4(texUV.x*2.0-1.0, texUV.y*2.0-1.0, 0, 1);
#elif defined(SCULPT)
    uv = projMatrix * vec4(p, 1);
    gl_Position = vec4(texUV.x*2.0-1.0, texUV.y*2.0-1.0, 0, 1);
#else
    uv = inUV;
    gl_Position = projMatrix * vec4(p, 1);
#endif
}
#endif

// --------------------------------------------------------------------------
#ifdef FRAGMENT_SHADER

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec2 texUV;

void main()
{
#if defined(PAINT)
    gl_FragColor = paint(uv.xy/uv.w);
#elif defined(SCULPT)
    gl_FragColor = sculpt(uv.xy/uv.w);
#else
    gl_FragColor = lighting(Peye, normal, uv, color, texUV);
#endif
}

#endif
