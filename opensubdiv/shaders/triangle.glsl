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
attribute vec2 inTexUV;  // 4
varying vec3 normal;
varying vec4 uv;
varying vec3 color;
varying vec3 Peye;
varying vec2 texUV;

void main()
{
    vec3 WorldPos = position.xyz;
    vec3 WorldNormal = normalize(inNormal.xyz);
    normal = (modelViewMatrix * vec4(WorldNormal, 0)).xyz;

    texUV = inTexUV;

    // apply displacement
#ifdef DISPLACEMENT
    float d = displacement(texUV);
    WorldPos.xyz += d*WorldNormal;
#endif
    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;

    color = inColor;
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
