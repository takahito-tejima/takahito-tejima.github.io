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
varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;

void main()
{
    vec3 p = (modelViewMatrix * vec4(position.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(normalize(inNormal.xyz), 0)).xyz;
    uv = inUV;
    color = inColor;
    Peye = p;
    gl_Position = projMatrix * vec4(p, 1);
}

#endif

#ifdef FRAGMENT_SHADER
varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;

uniform int displayMode;

void main()
{
    vec3 fnormal = normal;

    gl_FragColor.xyz = fnormal;
}

#endif
