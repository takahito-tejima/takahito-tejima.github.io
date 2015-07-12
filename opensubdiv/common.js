//
//   Copyright 2015 Takahito Tejima (tejimaya@gmail.com)
//

var patchColors = [[1.0,  1.0,  1.0,  1.0],   // regular
                   [0.0,  1.0,  1.0,  1.0],   // regular pattern 0
                   [0.0,  0.5,  1.0,  1.0],   // regular pattern 1
                   [0.0,  0.5,  0.5,  1.0],   // regular pattern 2
                   [0.5,  0.0,  1.0,  1.0],   // regular pattern 3
                   [1.0,  0.5,  1.0,  1.0],  // regular pattern 4

                   [1.0,  0.5,  0.5,  1.0],   // single crease
                   [1.0,  0.70, 0.6,  1.0],   // single crease pattern 0
                   [1.0,  0.65, 0.6,  1.0],   // single crease pattern 1
                   [1.0,  0.60, 0.6,  1.0],   // single crease pattern 2
                   [1.0,  0.55, 0.6,  1.0],   // single crease pattern 3
                   [1.0,  0.50, 0.6,  1.0],   // single crease pattern 4

                   [0.8,  0.0,  0.0,  1.0],   // boundary
                   [0.0,  0.0,  0.75, 1.0],   // boundary pattern 0
                   [0.0,  0.2,  0.75, 1.0],   // boundary pattern 1
                   [0.0,  0.4,  0.75, 1.0],   // boundary pattern 2
                   [0.0,  0.6,  0.75, 1.0],   // boundary pattern 3
                   [0.0,  0.8,  0.75, 1.0],   // boundary pattern 4

                   [0.0,  1.0,  0.0,  1.0],   // corner
                   [0.25, 0.25, 0.25, 1.0],   // corner pattern 0
                   [0.25, 0.25, 0.25, 1.0],   // corner pattern 1
                   [0.25, 0.25, 0.25, 1.0],   // corner pattern 2
                   [0.25, 0.25, 0.25, 1.0],   // corner pattern 3
                   [0.25, 0.25, 0.25, 1.0],   // corner pattern 4

                   [1.0,  1.0,  0.0,  1.0],   // gregory
                   [1.0,  1.0,  0.0,  1.0],   // gregory
                   [1.0,  1.0,  0.0,  1.0],   // gregory
                   [1.0,  1.0,  0.0,  1.0],   // gregory
                   [1.0,  1.0,  0.0,  1.0],   // gregory
                   [1.0,  1.0,  0.0,  1.0],   // gregory

                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary
                   [1.0,  0.5,  0.0,  1.0],   // gregory boundary

                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
                   [1.0,  1.0,  0.0,  1.0],  // gregory basis
];

function bitCount(i)
{
     i = i - ((i >> 1) & 0x55555555);
     i = (i & 0x33333333) + ((i >> 2) & 0x33333333);
     return (((i + (i >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function getPatchColor(transition, boundary)
{
    var patchType = 0;
    var edgeCount = bitCount(boundary);

    if (edgeCount == 1) {
        patchType = 2;
    } else if (edgeCount == 2) {
        patchType = 3;
    }

    var pattern = bitCount(transition);

    return patchColors[6*patchType + pattern];
}

function getShaderSource(url)
{
    var now = new Date();
    url += "?" +now.getTime();

    var req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    return (req.status == 200) ? req.responseText : null;
};
