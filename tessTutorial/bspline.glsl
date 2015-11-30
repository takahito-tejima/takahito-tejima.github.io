//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   Bi-cubic B-Spline evaluation shader

#ifdef VERTEX_SHADER

precision highp float;

attribute vec4 inUV;
varying vec3 normal;
varying vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D texCP;

void evalCubicBezier(in float u, out float B[4], out float D[4]) {
    float t = u;
    float s = 1.0 - u;
    float A0 = s * s;
    float A1 = 2.0 * s * t;
    float A2 = t * t;

    B[0] = s * A0;
    B[1] = t * A0 + s * A1;
    B[2] = t * A1 + s * A2;
    B[3] = t * A2;

    D[0] =    - A0;
    D[1] = A0 - A1;
    D[2] = A1 - A2;
    D[3] = A2;
}

vec2 getVertex(float cpIndex)
{
  float patchRes = 16.0;
  float u = (cpIndex+0.5)/patchRes;
  float v = 0.5;
  return vec2(u,v);
}

void main() {
    float B[4], D[4];
    vec3 cp[16];
    for (int i = 0; i < 16; ++i) {
      vec2 st = getVertex(float(i));
      cp[i] = texture2D(texCP, st).xyz;
    }

    float pu = inUV.x;
    float pv = inUV.y;
    evalCubicBezier(pu, B, D);

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

    evalCubicBezier(pv, B, D);

    WorldPos  = B[0]*BUCP[0] + B[1]*BUCP[1] + B[2]*BUCP[2] + B[3]*BUCP[3];
    Tangent   = B[0]*DUCP[0] + B[1]*DUCP[1] + B[2]*DUCP[2] + B[3]*DUCP[3];
    BiTangent = D[0]*BUCP[0] + D[1]*BUCP[1] + D[2]*BUCP[2] + D[3]*BUCP[3];

    vec3 n = normalize(cross(BiTangent, Tangent));
    vec3 p = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    uv = inUV.zw;
    gl_Position = projectionMatrix * vec4(p, 1);
}
#endif

// --------------------------------------------------------------------------
#ifdef FRAGMENT_SHADER

precision highp float;

varying vec3 normal;
varying vec2 uv;

void main()
{
  vec4 c = vec4(1);
  c.rgb = vec3(dot(normal, vec3(0,0,1)));

  vec2 vRel = fract(uv);
  float edge = 1.0 - max(1.0-vRel.x, max(1.0-vRel.y, max(vRel.x, vRel.y)));
#if defined(HAS_OES_STANDARD_DERIVATIVES)
  vec2 dist = fwidth(uv);
#else
  vec2 dist = vec2(0.05);
#endif
  float sc = min(dist.x, dist.y);
  edge = clamp(edge / sc, 0.0, 1.0);

  c = mix(vec4(0,0,0,1), c, edge);

  gl_FragColor = vec4(c.r, c.g, c.b, 1);
}

#endif
