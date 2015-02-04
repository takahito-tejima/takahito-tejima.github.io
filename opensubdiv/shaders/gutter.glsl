//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//

#ifdef VERTEX_SHADER

attribute vec2 position;
void main() {
    gl_Position = vec4(position, 0, 1);
}

#endif

#ifdef FRAGMENT_SHADER

uniform sampler2D src;
uniform sampler2D mask;
uniform vec2 size;

void main() {
    vec4 m = texture2D(mask, vec2(gl_FragCoord.x/size.x, gl_FragCoord.y/size.y));
    float u = (m.x*255.0 + m.y*255.0*256.0)+0.5;
    float v = (m.z*255.0 + m.w*255.0*256.0)+0.5;
    gl_FragColor = texture2D(src, vec2(u/size.x, v/size.y));
}

#endif
