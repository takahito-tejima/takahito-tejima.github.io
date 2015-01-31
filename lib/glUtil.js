//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//

var glUtil = {
    linkProgram : function(vertexShader, fragmentShader, attribBindings) {
        var program = gl.createProgram();

        var vshader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vshader, vertexShader);
        gl.compileShader(vshader);
        if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(vshader));
            console.log(gl.getShaderInfoLog(vshader));
        }

        var fshader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fshader, fragmentShader);
        gl.compileShader(fshader);
        if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(fshader));
            console.log(gl.getShaderInfoLog(fshader));
        }
        gl.attachShader(program, vshader);
        gl.attachShader(program, fshader);

        for (var name in attribBindings) {
            gl.bindAttribLocation(program, attribBindings[name], name);
        }

        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            alert(gl.getProgramInfoLog(program));
            console.log(gl.getProgramInfoLog(program));
        }
        return program;
    },

    drawGrid : function(mvpMatrix) {
        if (!this.grid) this.grid = this.createGrid();

        this.grid.draw(mvpMatrix);
    },

    createGrid : function() {
        var grid = {};

        var vertexShader =
            "attribute vec3 position;\n"+
            "uniform mat4 mvpMatrix;\n"+
            "void main() {\n"+
            "  gl_Position = mvpMatrix * vec4(position, 1);\n"+
            "}\n";
        var fragmentShader =
            "void main() {\n"+
            "  gl_FragColor = vec4(0.5, 0.5, 0.5, 1);\n"+
            "}\n";

        grid.program = this.linkProgram(vertexShader, fragmentShader, {position:0});
        grid.program.mvpMatrix = gl.getUniformLocation(grid.program, "mvpMatrix");

        grid.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, grid.vbo);
        var div = 10;
        var data = [];
        for (var x = -1; x <= 1; x += 2.0/div) {
            data.push(x, 0, -1);
            data.push(x, 0, 1);
        }
        for (var z = -1; z <= 1; z += 2.0/div) {
            data.push(-1, 0, z);
            data.push(1, 0, z);
        }
        grid.numIndices = data.length/3;

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        grid.draw = function(mvpMatrix) {
            gl.useProgram(this.program);
            gl.uniformMatrix4fv(this.program.mvpMatrix, false, mvpMatrix);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, this.numIndices);

            gl.useProgram(null);
        }

        return grid;
    },

}
