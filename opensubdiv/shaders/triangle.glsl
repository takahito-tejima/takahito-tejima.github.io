//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   Simple triangles shader
//
#ifdef VERTEX_SHADER

attribute vec4 inUV;     // 0
attribute vec3 inColor;  // 1
attribute vec3 position; // 2
attribute vec3 inNormal; // 3
attribute vec4 inPtexCoord; // 4
varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec4 ptexCoord;

void main()
{
    vec3 WorldPos = position.xyz;
    vec3 WorldNormal = normalize(inNormal.xyz);
    normal = (modelViewMatrix * vec4(WorldNormal, 0)).xyz;

    ptexCoord = inPtexCoord;
    // apply displacement
#ifdef DISPLACEMENT
#ifndef PTEX_DISPLACE
    ptexCoord.zw = WorldPos.xz*4.0;
#endif
    float d = displacement(ptexCoord.zw);
    WorldPos.xyz += d*WorldNormal;
#endif
    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;

    color = inColor;
    Peye = p;
#ifdef PAINT
    uv = projMatrix * vec4(p, 1);
    //gl_Position = vec4(ptexCoord.x*2.0-1.0, ptexCoord.y*2.0-1.0, 0, 1);
    gl_Position = vec4(ptexCoord.z*2.0-1.0, ptexCoord.w*2.0-1.0, 0, 1);
#else
    uv = inUV;
    gl_Position = projMatrix * vec4(p, 1);
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
#ifdef PAINT
    gl_FragColor = paint(uv.xy/uv.w);
#else
    gl_FragColor = lighting(Peye, normal, uv, color, ptexCoord);
#endif
}

#endif
