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
    B[0] =                                     1.0/3.0 * s                * A0;
    B[1] = (2.0/3.0 * s +           t) * A0 + (2.0/3.0 * s + 1.0/3.0 * t) * A1;
    B[2] = (1.0/3.0 * s + 2.0/3.0 * t) * A1 + (          s + 2.0/3.0 * t) * A2;
    B[3] =                1.0/3.0 * t  * A2;
    BU[0] =    - A0;
    BU[1] = A0 - A1;
    BU[2] = A1 - A2;
    BU[3] = A2;
}

uniform mat4 modelViewMatrix;
uniform mat4 projMatrix;

attribute vec4 inUV;
attribute vec4 patchData; // patchIndex, tess, depth, boundary
attribute vec4 tessLevel;
attribute vec4 inColor;

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;

uniform sampler2D texCP;
uniform sampler2D texPatch;
uniform float pointRes; // squre
uniform float patchRes; // square, *16

vec2 getVertexIndex(float patchIndex, float cpIndex) {
    float u = fract(patchIndex*16.0/patchRes) + (cpIndex+0.5)/patchRes;
    float v = (floor(patchIndex*16.0/patchRes)+0.5)/patchRes;
    return texture2D(texPatch, vec2(u,v)).xy;
}

void main() {
    float B[4], D[4];
    vec3 cp[16];

    // fetch verts
    for (int i = 0; i < 16; ++i) {
        vec2 vid = getVertexIndex(patchData.x, float(i));
        cp[i] = texture2D(texCP, vid).xyz;
    }

    // boundary
    float boundary = patchData.w;
    if (mod(boundary, 2.0) >= 1.0) {
        cp[0] = 2.0*cp[4] - cp[8];
        cp[1] = 2.0*cp[5] - cp[9];
        cp[2] = 2.0*cp[6] - cp[10];
        cp[3] = 2.0*cp[7] - cp[11];
    }
    if (mod(boundary, 4.0) >= 2.0) {
        cp[3]  = 2.0*cp[2]  - cp[1];
        cp[7]  = 2.0*cp[6]  - cp[5];
        cp[11] = 2.0*cp[10] - cp[9];
        cp[15] = 2.0*cp[14] - cp[13];
    }
    if (mod(boundary, 8.0) >= 4.0) {
        cp[12] = 2.0*cp[8]  - cp[4];
        cp[13] = 2.0*cp[9]  - cp[5];
        cp[14] = 2.0*cp[10] - cp[6];
        cp[15] = 2.0*cp[11] - cp[7];
    }
    if (mod(boundary, 16.0) >= 8.0) {
        cp[0]  = 2.0*cp[1]  - cp[2];
        cp[4]  = 2.0*cp[5]  - cp[6];
        cp[8]  = 2.0*cp[9]  - cp[10];
        cp[12] = 2.0*cp[13] - cp[14];
    }

    // adaptive stitch
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

    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    color  = inColor.xyz;
    Peye   = p;
    uv     = inUV;
    gl_Position = projMatrix * vec4(p, 1);
}
#endif

// --------------------------------------------------------------------------
#ifdef FRAGMENT_SHADER

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;

void main()
{
    vec3 fnormal = normal;
    vec3 l = normalize(vec3(-0.3,0.5,1));
    float d = max(0.0, dot(fnormal, l));
    vec3 h = normalize(l + vec3(0,0,1));    // directional viewer
    float s = pow(max(0.0, dot(fnormal, h)), 64.0);
    vec4 c = vec4(color, 1);

#if DISPLAY_MODE == 0
    // ---------------- shade -------------------
    c.rgb = vec3(0.4, 0.4, 0.8);
    c = vec4(d*c.rgb + s*vec3(0.7),1);

#elif DISPLAY_MODE == 1
    // ---------------- patch color -------------------
    c = vec4(d*c.rgb + s*vec3(0.7),1);
#elif DISPLAY_MODE == 2
    // ---------------- wire -------------------
    c = vec4(d*c.rgb + s*vec3(0.7),1);
    vec2 vRel = fract(uv.zw);
    float edge = 1.0 - max(1.0-vRel.x, max(1.0-vRel.y, max(vRel.x, vRel.y)));

#if defined(HAS_OES_STANDARD_DERIVATIVES)
    vec2 dist = fwidth(uv.zw);
#else
    vec2 dist = vec2(0.05);
#endif

    float sc = min(dist.x, dist.y);
    edge = clamp(edge / sc, 0.0, 1.0);

    c = mix(vec4(0,0,0,1), c, edge);
#elif DISPLAY_MODE == 3
    // ---------------- patch wire -------------------

    c.rgb = vec3(0.9, 0.4, 0.2);
    vec2 uvEdge = vec2(min(uv.x, 1.0-uv.x),
                       min(uv.y, 1.0-uv.y));

#if defined(HAS_OES_STANDARD_DERIVATIVES)
    vec2 dist = fwidth(uv.xy);
#else
    vec2 dist = vec2(0.05);
#endif
    uvEdge = uvEdge / dist;

    float width = 5.0;
    float edge = clamp(min(uvEdge.x, uvEdge.y)/width, 0.0, 1.0);

    // smoothstep to clean up the edge interpolation.
    c = mix(vec4(0,0,0,1), c, smoothstep(0.0, 
                        /*full range is 1.0, but .5 looks nice*/.5, edge));

#elif DISPLAY_MODE == 4
    // ---------------- normal -------------------
    c = vec4(fnormal, 1);
#elif DISPLAY_MODE == 5
    // ---------------- patch coord -------------------
    c.rgb = vec3(d*uv.xy, 0);
#endif

    gl_FragColor = c;
}

#endif
