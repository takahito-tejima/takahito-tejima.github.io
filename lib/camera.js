//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//
var button = false;
var prev_position = [0, 0];
var prev_pinch = 0;

var camera = {
    tx : 0,
    ty : 0,
    tz : 5,
    rx : 0,
    ry : 20,
    fov : 60,
    diag : 1,
    center : [0,0,0],
    proj : mat4.create(),
    modelView : mat4.create(),
    mvpMatrix : mat4.create(),

    setAspect : function(aspect) {
        this.aspect = aspect;
    },

    setCenter : function(x, y, z) {
        center = [x, y, z];
    },

    rotate : function(x, y) {
        this.rx += x;
        this.ry += y;
        if(this.ry > 90) this.ry = 90;
        if(this.ry < -90) this.ry = -90;
    },

    dolly : function(x) {
        this.tz -= x;
        if (this.tz < 0.1) this.tz = 0.001;
    },

    translate: function(x, y) {
        this.tx += x;
        this.ty -= y;
    },

    computeMatrixUniforms : function() {
        mat4.identity(this.proj);
        mat4.perspective(this.proj, this.fov*6.28/360.0, this.aspect, 0.01, 100.0);

        mat4.identity(this.modelView);
        mat4.translate(this.modelView, this.modelView,
                       vec3.fromValues(this.tx, this.ty, -this.tz));
        mat4.rotate(this.modelView, this.modelView,
                    this.ry*Math.PI*2/360, vec3.fromValues(1, 0, 0));
        mat4.rotate(this.modelView, this.modelView,
                    this.rx*Math.PI*2/360, vec3.fromValues(0, 1, 0));
        mat4.translate(this.modelView, this.modelView,
                       vec3.fromValues(-this.center[0], -this.center[1], -this.center[2]));

        mat4.multiply(this.mvpMatrix, this.proj, this.modelView);
    },

    setMatrixUniforms : function(program) {
        if (program.modelViewMatrix)
            gl.uniformMatrix4fv(program.modelViewMatrix, false, this.modelView);
        if (program.projMatrix)
            gl.uniformMatrix4fv(program.projMatrix, false, this.proj);
        if (program.mvpMatrix)
            gl.uniformMatrix4fv(program.mvpMatrix, false, this.mvpMatrix);
    },

    bindControl : function(id, callback) {
        $("#main").bind({"touchmove mousemove": function(event) {
            var p = [event.pageX, event.pageY];
            var d = [p[0]-prev_position[0], p[1]-prev_position[1]];

            if (event.type == "touchmove") {
                p = [event.originalEvent.touches[0].pageX, event.originalEvent.touches[0].pageY];
                d = [p[0]-prev_position[0], p[1]-prev_position[1]];

                //console.log(event.originalEvent);
                if (event.originalEvent.touches.length > 1) {
                    var t = event.originalEvent.touches;
                    var v = [t[1].pageX-t[0].pageX, t[1].pageY-t[0].pageY];
                    v = Math.sqrt(v[0]*v[0]+v[1]*v[1]);
                    if (button == 1) {
                        button = 3;
                        d[0] = 0;
                        prev_pinch = v;
                    } else if (button == 3) {
                        d[0] = v - prev_pinch;
                        prev_pinch = v;
                    }
                } else {
                    if (button == 3) {
                        button = 0;  // better than set to 1
                    }
                }
            }
            if (button > 0) {
                prev_position = p;
                if (event.shiftKey && button == 1) button = 2;

                if (!event.altKey && camera.override) {
                    camera.override(p[0], p[1]);
                } else if (button == 1) {
                    camera.rotate(d[0], d[1]);
                } else if(button == 3) {
                    camera.dolly(0.005*d[0]*camera.diag);
                } else if(button == 2){
                    camera.translate(d[0]*0.001*camera.diag,
                                     d[1]*0.001*camera.diag);
                }
                callback();
            }
        }});

        $("#main").bind("touchstart", function(event) {
            prev_position = [event.originalEvent.changedTouches[0].pageX,
                             event.originalEvent.changedTouches[0].pageY];
            if (event.originalEvent.changedTouches.length > 1) {
                button = 3;
                var t = event.originalEvent.changedTouches;
                var v = [t[1].pageX-t[0].pageX, t[1].pageY-t[0].pageY];
                prev_pinch = Math.sqrt(v[0]*v[0]+v[1]*v[1]);
            } else {
                button = 1;
            }
            event.preventDefault();
        });
        $("#main").bind("mousedown", function(event) {
            button = event.button+1;
            prev_position = [event.pageX, event.pageY];
            event.preventDefault();
        });
        $("#main").bind("touchend", function() {
            if (event.changedTouches.length == 0) {
                button = false;
            }
        });
        $("#main").bind("mouseup", function() {
            button = false;
        });
    }
}


