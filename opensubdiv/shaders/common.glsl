//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
//   GLSL common functions
//

#ifdef VERTEX_SHADER

uniform mat4 mvpMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projMatrix;


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

#endif

uniform sampler2D texPtexColor;
uniform sampler2D texPtexColorL;
uniform sampler2D texPtexDisplace;
uniform sampler2D texPtexDisplaceL;
uniform vec2 dimPtexColorL;
uniform vec2 dimPtexDisplaceL;

vec4 getPtexColor(vec4 ptexCoord) {
    return vec4(texture2D(texPtexColor, ptexCoord.xy).xyz, 1);
}
vec2 getPtexColorCoord(float ptexIndex, vec2 uv)
{
    //vec4 ptexPacking = texture2D(texPtexColorL, vec2(ptexIndex/numPtexColorFace, 0.5));;
    return vec2(ptexIndex/638.0);
    vec4 ptexPacking = texture2D(texPtexColorL, vec2(ptexIndex/638.0, 0.5));;
    return ptexPacking.xy + ptexPacking.zw*uv;
}

vec2 computePtexCoord(sampler2D ptexLayout, vec2 ptexLayoutDim, vec4 ptexParam, float depth, vec2 uv)
{
    float lv = pow(2.0, depth);
    vec2 p = ptexParam.yz;
    float rot = ptexParam.w;

    uv.xy = float(rot==0.0)*uv.xy
       + float(rot==1.0)*vec2(1.0-uv.y, uv.x)
        + float(rot==2.0)*vec2(1.0-uv.x, 1.0-uv.y)
        + float(rot==3.0)*vec2(uv.y, 1.0-uv.x);

    vec2 puv = vec2(uv*vec2(1)/lv) + p/lv;
#if DISPLAY_MODE == 4
    return puv;
#endif
    vec2 face = vec2(fract((ptexParam.x+0.5)/ptexLayoutDim.x),
                     (floor(ptexParam.x/ptexLayoutDim.x)+0.5)/ptexLayoutDim.y);
    vec4 ptexPacking = texture2D(ptexLayout, face);
    return ptexPacking.xy + ptexPacking.zw*puv;
}


uniform float displaceScale;

float displacement(vec2 uv) {
#ifdef PTEX_DISPLACE
    return displaceScale*texture2D(texPtexDisplace, uv).x;
#else
    float freq = 100.0;
    return displaceScale*(sin(freq*uv.x)*cos(freq*uv.y));
#endif
}

// ------------------------------------------------------------------------
#ifdef FRAGMENT_SHADER

vec3
perturbNormalFromDisplacement(vec3 position, vec3 normal, vec2 uv)
{
#if defined(HAS_OES_STANDARD_DERIVATIVES)
    vec3 vSigmaS = dFdx(position);
    vec3 vSigmaT = dFdy(position);
    vec3 vN = normal;
    vec3 vR1 = cross(vSigmaT, vN);
    vec3 vR2 = cross(vN, vSigmaS);
    float fDet = dot(vSigmaS, vR1);

    vec2 texDx = dFdx(uv);
    vec2 texDy = dFdy(uv);

    // limit forward differencing to the width of ptex gutter
    const float resolution = 128.0;
    float d = 1.0;//min(1.0, (0.5/resolution)/max(length(texDx), length(texDy)));

    vec2 STll = uv;
    vec2 STlr = uv + d * vec2(texDx.x, texDx.y);
    vec2 STul = uv + d * vec2(texDy.x, texDy.y);

    float Hll = displacement(STll);
    float Hlr = displacement(STlr);
    float Hul = displacement(STul);

    float dBs = (Hlr - Hll)/d;
    float dBt = (Hul - Hll)/d;
    vec3 vSurfGrad = sign(fDet) * (dBs * vR1 + dBt * vR2);
    return normalize(abs(fDet) * vN - vSurfGrad);
#else
    return normal;
#endif
}

vec4 lighting(vec3 Peye, vec3 normal, vec4 uv, vec3 color, vec4 ptexCoord)
{
    vec3 fnormal = normal;
#ifdef DISPLACEMENT
    if (displaceScale > 0.0) {
#if defined(FLAT_NORMAL) && defined(HAS_OES_STANDARD_DERIVATIVES)
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
    //XXX: should fix ptex.
    c.rgb = vec3(pow(c.r, 0.4545),
                 pow(c.g, 0.4545),
                 pow(c.b, 0.4545));
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

#if defined(HAS_OES_STANDARD_DERIVATIVES)
    vec2 dist = fwidth(vRel);
#else
    vec2 dist = vec2(0);
#endif
    vec2 a2 = smoothstep(vec2(0), dist*1.0, vRel);
    edge = 1.0 -(a2.x + a2.y)*0.5;
    c = mix(c, vec4(0,0,0,1), edge);
#elif DISPLAY_MODE == 3
    c = vec4(fnormal, 1);
#elif DISPLAY_MODE == 4
    c = vec4(uv.x, uv.y, 1, 1);
    c.rgb = vec3(ptexCoord.xy, 0);
#endif
    return c;
}

uniform vec2 paintPos;

vec4 paint(vec2 p)
{
    float pd = smoothstep(0.0, 1.0, 10.0*max(0.0, 0.05-distance(p, paintPos)));
    return vec4(5,5,5,pd);
}
vec4 sculpt(vec2 p)
{
    float pd = smoothstep(0.0, 1.0, 10.0*max(0.0, 0.05-distance(p, paintPos)));
    return vec4(5,5,5,pd);
}

#endif

