
far_tutorial_0.cpp
------------------

`<https://github.com/PixarAnimationStudios/OpenSubdiv/blob/master/tutorials/far/tutorial_0/far_tutorial_0.cpp>`_

----

.. code:: c
    
    //------------------------------------------------------------------------------
    // Tutorial description:
    //
    // This tutorial presents in a very succint way the requisite steps to
    // instantiate and refine a mesh with Far from simple topological data.
    //
    
    #include <opensubdiv/far/topologyDescriptor.h>
    #include <opensubdiv/far/primvarRefiner.h>
    
    #include <cstdio>
    
    //------------------------------------------------------------------------------
    // Vertex container implementation.
    //
    struct Vertex {
    
        // Minimal required interface ----------------------
        Vertex() { }
    
        Vertex(Vertex const & src) {
            _position[0] = src._position[0];
            _position[1] = src._position[1];
            _position[2] = src._position[2];
        }
    
        void Clear( void * =0 ) {
            _position[0]=_position[1]=_position[2]=0.0f;
        }
    
        void AddWithWeight(Vertex const & src, float weight) {
            _position[0]+=weight*src._position[0];
            _position[1]+=weight*src._position[1];
            _position[2]+=weight*src._position[2];
        }
    
        void AddVaryingWithWeight(Vertex const &, float) { }
    
        // Public interface ------------------------------------
        void SetPosition(float x, float y, float z) {
            _position[0]=x;
            _position[1]=y;
            _position[2]=z;
        }
    
        const float * GetPosition() const {
            return _position;
        }
    
    private:
        float _position[3];
    };
    
    //------------------------------------------------------------------------------
    // Cube geometry from catmark_cube.h
    static float g_verts[8][3] = {{ -0.5f, -0.5f,  0.5f },
                                  {  0.5f, -0.5f,  0.5f },
                                  { -0.5f,  0.5f,  0.5f },
                                  {  0.5f,  0.5f,  0.5f },
                                  { -0.5f,  0.5f, -0.5f },
                                  {  0.5f,  0.5f, -0.5f },
                                  { -0.5f, -0.5f, -0.5f },
                                  {  0.5f, -0.5f, -0.5f }};
    
    static int g_nverts = 8,
               g_nfaces = 6;
    
    static int g_vertsperface[6] = { 4, 4, 4, 4, 4, 4 };
    
    static int g_vertIndices[24] = { 0, 1, 3, 2,
                                     2, 3, 5, 4,
                                     4, 5, 7, 6,
                                     6, 7, 1, 0,
                                     1, 7, 5, 3,
                                     6, 0, 2, 4  };
    
    using namespace OpenSubdiv;
    
    //------------------------------------------------------------------------------
    int main(int, char **) {
    
        // Populate a topology descriptor with our raw data
    
        typedef Far::TopologyDescriptor Descriptor;
    
        Sdc::SchemeType type = OpenSubdiv::Sdc::SCHEME_CATMARK;
    
        Sdc::Options options;
        options.SetVtxBoundaryInterpolation(Sdc::Options::VTX_BOUNDARY_EDGE_ONLY);
    
        Descriptor desc;
        desc.numVertices  = g_nverts;
        desc.numFaces     = g_nfaces;
        desc.numVertsPerFace = g_vertsperface;
        desc.vertIndicesPerFace  = g_vertIndices;
    
    
        // Instantiate a FarTopologyRefiner from the descriptor
        Far::TopologyRefiner * refiner = Far::TopologyRefinerFactory<Descriptor>::Create(desc,
                                                Far::TopologyRefinerFactory<Descriptor>::Options(type, options));
    
        int maxlevel = 2;
    
        // Uniformly refine the topolgy up to 'maxlevel'
        refiner->RefineUniform(Far::TopologyRefiner::UniformOptions(maxlevel));
    
    
        // Allocate a buffer for vertex primvar data. The buffer length is set to
        // be the sum of all children vertices up to the highest level of refinement.
        std::vector<Vertex> vbuffer(refiner->GetNumVerticesTotal());
        Vertex * verts = &vbuffer[0];
    
    
        // Initialize coarse mesh positions
        int nCoarseVerts = g_nverts;
        for (int i=0; i<nCoarseVerts; ++i) {
            verts[i].SetPosition(g_verts[i][0], g_verts[i][1], g_verts[i][2]);
        }
    
    
        // Interpolate vertex primvar data
        Far::PrimvarRefiner primvarRefiner(*refiner);
    
        Vertex * src = verts;
        for (int level = 1; level <= maxlevel; ++level) {
            Vertex * dst = src + refiner->GetLevel(level-1).GetNumVertices();
            primvarRefiner.Interpolate(level, src, dst);
            src = dst;
        }
    
    
        { // Output OBJ of the highest level refined -----------
    
            Far::TopologyLevel const & refLastLevel = refiner->GetLevel(maxlevel);
    
            int nverts = refLastLevel.GetNumVertices();
            int nfaces = refLastLevel.GetNumFaces();
    
            // Print vertex positions
            int firstOfLastVerts = refiner->GetNumVerticesTotal() - nverts;
    
            for (int vert = 0; vert < nverts; ++vert) {
                float const * pos = verts[firstOfLastVerts + vert].GetPosition();
                printf("v %f %f %f\n", pos[0], pos[1], pos[2]);
            }
    
            // Print faces
            for (int face = 0; face < nfaces; ++face) {
    
                Far::ConstIndexArray fverts = refLastLevel.GetFaceVertices(face);
    
                // all refined Catmark faces should be quads
                assert(fverts.size()==4);
    
                printf("f ");
                for (int vert=0; vert<fverts.size(); ++vert) {
                    printf("%d ", fverts[vert]+1); // OBJ uses 1-based arrays...
                }
                printf("\n");
            }
        }
    }
    
    //------------------------------------------------------------------------------
    
