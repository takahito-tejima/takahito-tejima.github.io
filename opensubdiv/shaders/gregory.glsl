//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   Gregory patch evaluation shader

#ifdef VERTEX_SHADER

attribute vec4 inUV;
attribute vec4 patchData;
attribute vec4 tessLevel;
attribute vec3 inColor;
attribute vec4 ptexParam; // ptexFaceID, u, v, rotation

varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec4 ptexCoord;

uniform sampler2D texCP;
uniform sampler2D texPatch;
uniform vec2 patchRes; // square, *20
uniform float pointRes; // squre

vec2 getGregoryVertexIndex(float patchIndex, float cpIndex) {
    float u = fract(patchIndex*20.0/patchRes[0]) + (cpIndex+0.5)/patchRes[0];
    float v = (floor(patchIndex*20.0/patchRes[0])+0.5)/patchRes[1];
    return texture2D(texPatch, vec2(u,v)).xy;
}
void main(){
    vec3 p[20];
    vec2 vid;
#if 1  // Android crashes.
    for (int i = 0; i < 20; ++i) {
        vid = getGregoryVertexIndex(patchData.x, float(i));
        p[i] = texture2D(texCP, vid).xyz;
    }
#else
    vid = getGregoryVertexIndex(patchData.x, 0.0);
    p[0] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 1.0);
    p[1] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 2.0);
    p[2] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 3.0);
    p[3] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 4.0);
    p[4] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 5.0);
    p[5] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 6.0);
    p[6] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 7.0);
    p[7] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 8.0);
    p[8] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 9.0);
    p[9] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 10.0);
    p[10] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 11.0);
    p[11] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 12.0);
    p[12] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 13.0);
    p[13] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 14.0);
    p[14] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 15.0);
    p[15] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 16.0);
    p[16] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 17.0);
    p[17] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 18.0);
    p[18] = texture2D(texCP, vid).xyz;
    vid = getGregoryVertexIndex(patchData.x, 19.0);
    p[19] = texture2D(texCP, vid).xyz;
#endif
    vec3 q[16];

    float u = inUV.x;
    float v = inUV.y;
    float U = 1.0-u, V=1.0-v;
    float d11 = u+v; if(u+v==0.0) d11 = 1.0;
    float d12 = U+v; if(U+v==0.0) d12 = 1.0;
    float d21 = u+V; if(u+V==0.0) d21 = 1.0;
    float d22 = U+V; if(U+V==0.0) d22 = 1.0;


    q[ 5] = (u*p[3] + v*p[4])/d11;
    q[ 6] = (U*p[9] + v*p[8])/d12;
    q[ 9] = (u*p[19] + V*p[18])/d21;
    q[10] = (U*p[13] + V*p[14])/d22;

    q[ 0] = p[0];
    q[ 1] = p[1];
    q[ 2] = p[7];
    q[ 3] = p[5];
    q[ 4] = p[2];
    q[ 7] = p[6];
    q[ 8] = p[16];
    q[11] = p[12];
    q[12] = p[15];
    q[13] = p[17];
    q[14] = p[11];
    q[15] = p[10];


    float B[4], D[4];
    vec3 BUCP[4], DUCP[4];

    evalCubicBezier(inUV.x, B, D);

    BUCP[0] = q[0]*B[0] + q[4]*B[1] + q[ 8]*B[2] + q[12]*B[3];
    BUCP[1] = q[1]*B[0] + q[5]*B[1] + q[ 9]*B[2] + q[13]*B[3];
    BUCP[2] = q[2]*B[0] + q[6]*B[1] + q[10]*B[2] + q[14]*B[3];
    BUCP[3] = q[3]*B[0] + q[7]*B[1] + q[11]*B[2] + q[15]*B[3];

    DUCP[0] = q[0]*D[0] + q[4]*D[1] + q[ 8]*D[2] + q[12]*D[3];
    DUCP[1] = q[1]*D[0] + q[5]*D[1] + q[ 9]*D[2] + q[13]*D[3];
    DUCP[2] = q[2]*D[0] + q[6]*D[1] + q[10]*D[2] + q[14]*D[3];
    DUCP[3] = q[3]*D[0] + q[7]*D[1] + q[11]*D[2] + q[15]*D[3];


    vec3 WorldPos  = vec3(0);
    vec3 Tangent   = vec3(0);
    vec3 BiTangent = vec3(0);

    evalCubicBezier(inUV.y, B, D);

    for (int k=0; k<4; ++k) {
        WorldPos  += B[k] * BUCP[k];
        Tangent   += B[k] * DUCP[k];
        BiTangent += D[k] * BUCP[k];
    }
    vec3 n = normalize(cross(BiTangent, Tangent));

    ptexCoord.xy = computePtexCoord(texPtexColorL,
                                    dimPtexColorL,
                                    ptexParam, patchData.z, vec2(v,u));
    ptexCoord.zw = computePtexCoord(texPtexDisplaceL,
                                    dimPtexDisplaceL,
                                    ptexParam, patchData.z, vec2(v,u));

    // apply displacement
#ifdef DISPLACEMENT
#ifndef PTEX_DISPLACE
    ptexCoord.zw = WorldPos.xz*4.0;
#endif
    float d = displacement(ptexCoord.zw);
    WorldPos.xyz += d*n;
#endif

    vec3 pos = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    uv = inUV;
    color = inColor;

    Peye = pos;
#if defined(PAINT)
    uv = projMatrix * vec4(pos, 1);
    gl_Position = vec4(ptexCoord.x*2.0-1.0, ptexCoord.y*2.0-1.0, 0, 1);
#elif defined(SCULPT)
    uv = projMatrix * vec4(pos, 1);
    gl_Position = vec4(ptexCoord.z*2.0-1.0, ptexCoord.w*2.0-1.0, 0, 1);
#else
    uv = inUV;
    gl_Position = projMatrix * vec4(pos, 1);
#endif
}

#endif

#ifdef FRAGMENT_SHADER
varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec4 ptexCoord;

void main()
{
#if defined(PAINT)
    gl_FragColor = paint(uv.xy/uv.w);
#elif defined(SCULPT)
    gl_FragColor = sculpt(uv.xy/uv.w);
#else
    //    gl_FragColor = lighting(Peye, normal, uv, color, ptexCoord);
#endif
}

#endif
