//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//

#ifdef VERTEX_SHADER

uniform mat4 mvpMatrix;
attribute vec3 position;

void main() {
    gl_Position = mvpMatrix * vec4(position, 1);
}

#endif

#ifdef FRAGMENT_SHADER

void main() {
    gl_FragColor = vec4(178./256., 197./256., 218./256., 1.);
}

#endif
