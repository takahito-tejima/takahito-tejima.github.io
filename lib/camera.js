//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//

var camera = {
    tx : 0,
    ty : 0,
    tz : 5,
    rx : 0,
    ry : 0,
    fov : 60,
    center : [0,0,0],

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

    getProjection : function() {
        var proj = mat4.create();
        mat4.identity(proj);
        mat4.perspective(proj, this.fov*6.28/360.0, this.aspect, 0.01, 100.0);
        return proj;
    },

    getModelView : function() {
        var modelView = mat4.create();
        mat4.identity(modelView);
        mat4.translate(modelView, modelView,
                       vec3.fromValues(this.tx, this.ty, -this.tz));
        mat4.rotate(modelView, modelView,
                    this.ry*Math.PI*2/360, vec3.fromValues(1, 0, 0));
        mat4.rotate(modelView, modelView,
                    this.rx*Math.PI*2/360, vec3.fromValues(0, 1, 0));
        mat4.translate(modelView, modelView,
                       vec3.fromValues(-this.center[0], -this.center[1], -this.center[2]));
        return modelView;
    }
}


