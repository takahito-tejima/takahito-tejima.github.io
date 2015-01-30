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
    vec2 vids[20];
    for (int i = 0; i < 20; ++i) {
        vids[i] = getGregoryVertexIndex(patchData.x, float(i));
    }
    for (int i = 0; i < 20; ++i) {
        p[i] = texture2D(texCP, vids[i]).xyz;
    }

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
    BUCP[0] = BUCP[1] = BUCP[2] = BUCP[3] = vec3(0);
    DUCP[0] = DUCP[1] = DUCP[2] = DUCP[3] = vec3(0);

    evalCubicBezier(inUV.x, B, D);

    for (int i=0; i<4; ++i) {
        for (int j=0; j<4; ++j) {
            vec3 A = q[4*j + i].xyz;
            BUCP[i] += A * B[j];
            DUCP[i] += A * D[j];
        }
    }

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

    ptexCoord.xy = computePtexCoord(ptexParam, patchData.z, vec2(v,u));
    ptexCoord.zw = vec2(0);

    // apply displacement
#ifdef DISPLACEMENT
    ptexCoord.zw = WorldPos.xz*4.0;
    float d = displacement(ptexCoord.zw);
    WorldPos.xyz += d*n;
#endif

    vec3 pos = (modelViewMatrix * vec4(WorldPos.xyz, 1)).xyz;
    normal = (modelViewMatrix * vec4(n, 0)).xyz;
    uv = inUV;
    color = inColor;
    Peye = pos;
    gl_Position = projMatrix * vec4(pos, 1);
    gl_PointSize=10.0;
}

#endif

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
