/*
grapher3d references:

.controls.copyWorldRotationToWorld()
.controls.prepareTransitionFrom2Dto3D()
.controls.animateTransitionFrom2Dto3D()
.webglLayer.setBackgroundColor(string)
.webglLayer.showBox(boolean)
.webglLayer.showAxes(boolean)
.webglLayer.showPlane(boolean)
.webglLayer.updateAxes()
.webglLayer.updatePlaneMap()
.baseplaneWidth()
.updateSketch(?, ?)
.removeGraphSketch(?)
.setSketchOrder(?)
.redrawAllLayers()
.update()
.tick(?)
.setGrapherState(state.graph, optional {doNotClear: boolean})

.webglLayer.onRenderSpy() // defined externally, records time of invocation
*/

const DesmosCustom = {
    GeometryBuffer: class {
        constructor() {
            this.channels = {};
        }

        //addChannel
    },

    WebGLLayer: class extends dcg.View.Class {
        init() {
            this.grapher = this.props.grapher();
            this.controller = this.grapher.controller;
            this.width = 0;
            this.height = 0;
            this.pixelRatio = 0;
            this.lightDirection = [1, 5, 1];
        }

        template() {
            return dcg.View.createElement(
                "div",
                {
                    class: dcg.View.const("dcg-graph-outer"),
                    role: dcg.View.const("img"),
                    "aria-roledescription": () => this.controller.s("graphing-calculator-narration-graphpaper-label"),
                    didMount: (node) => {
                        this.rootNode = node;
                    }
                },
                dcg.View.createElement(
                    "canvas",
                    {
                        class: dcg.View.const("dcg-graph-inner"),
                        didMount: (node) => {
                            this.canvasNode = node;
                            this._loadContext();
                            this.resize(0, 0);
                        },
                        style: () => ({
                            position: "relative",
                            display: "block",
                            outline: "none",
                        }),
                    }
                )
            )
        }

        colorFromHex(hex) {
            let match = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
            if (match) {
                return [
                    parseInt(match[1], 16) / 255,
                    parseInt(match[2], 16) / 255,
                    parseInt(match[3], 16) / 255,
                ];
            } else {
                return [0, 0, 0];
            }
        }

        _loadContext() {
            this.legacy = false;
            this.gl = this.canvasNode.getContext("webgl2");
            if (!this.gl) {
                this.legacy = true;
                this.gl = this.canvasNode.getContext("webgl");
            }
            if (!this.gl) {
                console.error("Unable to create a WebGL context. WebGL may not be supported by your browser.");
            }

            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
            this.gl.enable(this.gl.DEPTH_TEST);
            this.gl.depthFunc(this.gl.LEQUAL);
            this.gl.clearDepth(1.0);
            this.setBackgroundColor();

            this.program = {};

            let shaderProgram = this.createShaderProgram([
                [this.gl.VERTEX_SHADER, `
                    uniform mat4 uModelViewMatrix;
                    uniform mat4 uProjectionMatrix;
                    uniform vec3 uLightDirection;

                    in vec3 aPosition;
                    in vec3 aColor;
                    in vec3 aNormal;

                    out vec4 vColor;
            
                    void main() {
                        gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);

                        float lightingMultiplier = 0.7 * abs(dot(normalize(aNormal), normalize(uLightDirection))) + 0.3;
                        vColor = vec4(aColor * lightingMultiplier, 1.0);
                    }
                `],
                [this.gl.FRAGMENT_SHADER, `
                    in vec4 vColor;

                    void main() {
                        color = vColor;
                    }
                `],
            ]);
            this.gl.useProgram(shaderProgram);
            this.program.triangles = {
                id: shaderProgram,
                attribute: {
                    // guarantee that there is an attribute bound at location 0 so the browser doesn't have to do expensive emulation; see
                    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#always_enable_vertex_attrib_0_as_an_array
                    position: (this.gl.bindAttribLocation(shaderProgram, 0, "aPosition"), 0),
                    color: this.gl.getAttribLocation(shaderProgram, "aColor"),
                    normal: this.gl.getAttribLocation(shaderProgram, "aNormal"),
                },
                uniform: {
                    modelViewMatrix: this.gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
                    projectionMatrix: this.gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
                    lightDirection: this.gl.getUniformLocation(shaderProgram, "uLightDirection"),
                },
                createBuffers: () => ({
                    positions: this.gl.createBuffer(),
                    colors: this.gl.createBuffer(),
                    normals: this.gl.createBuffer(),
                    indices: this.gl.createBuffer(),
                }),
                attachBuffers: ({positions, colors, normals, indices}) => {
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positions);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.position, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.position);
        
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colors);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.color, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.color);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normals);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.normal, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.normal);
                }
            };

            shaderProgram = this.createShaderProgram([
                [this.gl.VERTEX_SHADER, `
                    uniform mat4 uModelViewMatrix;
                    uniform mat4 uProjectionMatrix;
                    uniform vec2 uResolution;

                    in vec3 aPosition;
                    in vec4 aColor;
                    in vec3 aTangent;
                    in float aOffset;
            
                    out vec4 vColor;

                    vec2 getScreen(vec4 projected, float aspect) {
                        vec2 screen = projected.xy / projected.w;
                        screen.x *= aspect;
                        return screen;
                    }
            
                    void main() {
                        float aspect = uResolution.x / uResolution.y;
                        mat4 projectionViewModelMatrix = uProjectionMatrix * uModelViewMatrix;

                        vec4 projPosition = projectionViewModelMatrix * vec4(aPosition, 1.0);
                        vec2 screenPosition = getScreen(projPosition, aspect);
                        vec4 projTangent = projectionViewModelMatrix * vec4(aTangent, 1.0);
                        vec2 screenTangent = getScreen(projTangent, aspect);

                        vec2 direction = normalize(screenTangent - screenPosition);
                        vec4 normal = vec4(-direction.y / aspect, direction.x, 0.0, 1.0);
                        normal.xy *= aOffset;
                        normal *= uProjectionMatrix;
                        normal.xy *= projPosition.w;
                        normal.xy /= (vec4(uResolution, 0.0, 1.0) * uProjectionMatrix).xy;

                        gl_Position = projPosition + vec4(normal.xy, 0.0, 0.0);

                        vColor = aColor;
                    }
                `],
                [this.gl.FRAGMENT_SHADER, `
                    in vec4 vColor;
            
                    void main() {
                        color = vColor;
                    }
                `],
            ]);
            this.gl.useProgram(shaderProgram);
            this.program.lines = {
                id: shaderProgram,
                attribute: {
                    // guarantee that there is an attribute bound at location 0 so the browser doesn't have to do expensive emulation; see
                    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#always_enable_vertex_attrib_0_as_an_array
                    position: (this.gl.bindAttribLocation(shaderProgram, 0, "aPosition"), 0),
                    color: this.gl.getAttribLocation(shaderProgram, "aColor"),
                    tangent: this.gl.getAttribLocation(shaderProgram, "aTangent"),
                    offset: this.gl.getAttribLocation(shaderProgram, "aOffset"),
                },
                uniform: {
                    modelViewMatrix: this.gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
                    projectionMatrix: this.gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
                    resolution: this.gl.getUniformLocation(shaderProgram, "uResolution"),
                },
                createBuffers: () => ({
                    positions: this.gl.createBuffer(),
                    colors: this.gl.createBuffer(),
                    tangents: this.gl.createBuffer(),
                    offsets: this.gl.createBuffer(),
                    indices: this.gl.createBuffer(),
                }),
                attachBuffers: ({positions, colors, tangents, offsets, indices}) => {
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positions);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.position, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.position);
        
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colors);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.color, 4, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.color);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, tangents);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.tangent, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.tangent);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, offsets);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.offset, 1, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.offset);
                },
                generateLineGeometry: (positions, colors, widths, indices) => {
                    let output = {
                        positions: new Float32Array(indices.length * 6),
                        colors: new Float32Array(indices.length * 8),
                        tangents: new Float32Array(indices.length * 6),
                        offsets: new Float32Array(indices.length * 2),
                        indices: new Uint32Array(indices.length * 3),
                    };
                    for (let element = 0; element < indices.length; element += 2) {
                        let index0 = indices[element + 0];
                        let index1 = indices[element + 1];

                        let data = positions.slice(index0 * 3 + 0, index0 * 3 + 3);
                        output.positions.set(data, element * 6 + 0);
                        output.positions.set(data, element * 6 + 3);
                        output.tangents.set(data, element * 6 + 6);
                        output.tangents.set(data, element * 6 + 9);
                        data = positions.slice(index1 * 3 + 0, index1 * 3 + 3);
                        output.tangents.set(data, element * 6 + 0);
                        output.tangents.set(data, element * 6 + 3);
                        output.positions.set(data, element * 6 + 6);
                        output.positions.set(data, element * 6 + 9);
                        data = colors.slice(index0 * 4 + 0, index0 * 4 + 4);
                        output.colors.set(data, element * 8 + 0);
                        output.colors.set(data, element * 8 + 4);
                        data = colors.slice(index1 * 4 + 0, index1 * 4 + 4);
                        output.colors.set(data, element * 8 + 8);
                        output.colors.set(data, element * 8 + 12);
                        output.offsets[element * 2 + 0] = 0.5 * widths[index0];
                        output.offsets[element * 2 + 1] = -0.5 * widths[index0];
                        output.offsets[element * 2 + 2] = 0.5 * widths[index1];
                        output.offsets[element * 2 + 3] = -0.5 * widths[index1];

                        output.indices[element * 3 + 0] = element * 2 + 0;
                        output.indices[element * 3 + 1] = element * 2 + 1;
                        output.indices[element * 3 + 2] = element * 2 + 2;
                        output.indices[element * 3 + 3] = element * 2 + 2;
                        output.indices[element * 3 + 4] = element * 2 + 3;
                        output.indices[element * 3 + 5] = element * 2 + 0;
                    }
                    return output;
                },
            };
        }

        createShaderProgram(shaders) {
            const glslVersion = this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION)
                .match(/\d.\d\d/g)[0]
                .replace(".", "");
        
            const header = {};
            header[this.gl.VERTEX_SHADER] = `\
                #version ${glslVersion} es
                #if __VERSION__ < 300
                    #define in attribute
                    #define out varying
                #endif
            `;
            header[this.gl.FRAGMENT_SHADER] = `\
                #version ${glslVersion} es
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                    precision highp float;
                #else
                    precision mediump float;
                #endif
                #if __VERSION__ < 300
                    #define color gl_FragColor
                    #define in varying
                #else
                    out vec4 color;
                #endif
            `;
        
            const shaderProgram = this.gl.createProgram();
            if (!shaders.every(([type, source]) => {
                let shader = this.createShader(type, (header[type] || "") + source);
                this.gl.attachShader(shaderProgram, shader);
                this.gl.deleteShader(shader);
                return shader;
            })) {
                return null;
            }
            this.gl.linkProgram(shaderProgram);
        
            if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
                console.error("Shader program linking error:\n" + this.gl.getProgramInfoLog(shaderProgram));
                return null;
            }
        
            return shaderProgram;
        }

        createShader(type, source) {
            const shader = this.gl.createShader(type);
            this.gl.shaderSource(shader, source);
            this.gl.compileShader(shader);
        
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                console.error("Shader compilation error:\n" + this.gl.getShaderInfoLog(shader));
                this.gl.deleteShader(shader);
                return null;
            }
        
            return shader;
        }

        getDevicePixelRatio() {
            return window.devicePixelRatio || 1;
        }

        resize(width, height, pixelRatio = null) {
            pixelRatio ||= this.getDevicePixelRatio();

            if (width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio) {
                this.width = width;
                this.height = height;
                this.pixelRatio = pixelRatio;

                this.canvasNode.style.width = width + "px";
                this.canvasNode.style.height = height + "px";
                this.canvasNode.setAttribute("width", width * pixelRatio);
                this.canvasNode.setAttribute("height", height * pixelRatio);

                this.gl.viewport(0, 0, width * pixelRatio, height * pixelRatio);

                this.grapher.controls.orientation.updateProjection(width * pixelRatio, height * pixelRatio);
                this.grapher.controller.requestRedrawGraph();
            }
        }

        beginRedraw() {
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        }

        setProgram(program, buffers) {
            this.gl.useProgram(program.id);

            if (program.uniform.modelViewMatrix) {
                this.gl.uniformMatrix4fv(program.uniform.modelViewMatrix, false, this.grapher.controls.orientation.getModelView());
            }
            if (program.uniform.projectionMatrix) {
                this.gl.uniformMatrix4fv(program.uniform.projectionMatrix, false, this.grapher.controls.orientation.getProjection());
            }
            if (program.uniform.lightDirection) {
                this.gl.uniform3f(program.uniform.lightDirection, this.lightDirection[0], this.lightDirection[2], this.lightDirection[1]);
            }
            if (program.uniform.resolution) {
                this.gl.uniform2f(program.uniform.resolution, this.width, this.height);
            }

            program.attachBuffers(buffers);
        }

        setBackgroundColor(color = "#ffffff") {
            this.gl.clearColor(...this.colorFromHex(color), 1);
            this.grapher.controller.requestRedrawGraph();
        }

        showBox(show) {
        }

        showAxes(show) {
        }

        showPlane(show) {
        }

        updateAxes() {
        }

        updatePlaneMap() {
        }
    },

    Grapher3DGridLayer: class {
        constructor(grapher) {
            this.grapher = grapher;
            this.buffer = null;
        }

        redrawToGL(layer, projection) {
            this.buffer ||= layer.program.lines.createBuffers();

            let {positions, colors, tangents, offsets, indices} = layer.program.lines.generateLineGeometry([
                projection.viewport.xmin,0,0, projection.viewport.xmax,0,0, 0,projection.viewport.ymin,0, 0,projection.viewport.ymax,0, 0,0,projection.viewport.zmin, 0,0,projection.viewport.zmax,
                projection.viewport.xmin,projection.viewport.ymin,0, projection.viewport.xmax,projection.viewport.ymin,0, projection.viewport.xmax,projection.viewport.ymax,0, projection.viewport.xmin,projection.viewport.ymax,0,
                projection.viewport.xmax,0,0, projection.viewport.xmax+0.25,0,0, 0,projection.viewport.ymax,0, 0,projection.viewport.ymax+0.25,0, 0,0,projection.viewport.zmax, 0,0,projection.viewport.zmax+0.25,
            ], [
                0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity,
                0,0,0,this.grapher.settings.majorAxisOpacity, 0,0,0,this.grapher.settings.majorAxisOpacity, 0,0,0,this.grapher.settings.majorAxisOpacity, 0,0,0,this.grapher.settings.majorAxisOpacity,
                0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity,
            ], [
                2, 2, 2, 2, 2, 2,
                2, 2, 2, 2,
                20, 0, 20, 0, 20, 0,
            ], [
                0,1, 2,3, 4,5,
                6,7, 7,8, 8,9, 9,6,
                10,11, 12,13, 14,15,
            ]);

            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.positions);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, positions, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.colors);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, colors, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.tangents);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, tangents, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.offsets);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, offsets, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ELEMENT_ARRAY_BUFFER, this.buffer.indices);
            layer.gl.bufferData(layer.gl.ELEMENT_ARRAY_BUFFER, indices, layer.gl.DYNAMIC_DRAW);

            layer.setProgram(layer.program.lines, this.buffer);

            layer.gl.drawElements(layer.gl.TRIANGLES, indices.length, layer.gl.UNSIGNED_INT, 0);
        }
    },

    GraphSketch3D: class {
        constructor(id, branches) {
            this.id = id;
            this.branches = branches || [];
            this.color = "#000000";
            this.style = "normal";
            this.showPOI = false;
            this.showHighlight = false;
            this.selected = false;
            this.tokenHovered = false;
            this.tokenSelected = false;
            this.labels = [];
        }

        updateFrom(previous) {
            if (!previous) {
                return;
            }
            this.showPOI = previous.showPOI;
            this.showHighlight = previous.showHighlight;
            this.selected = previous.selected;
            this.tokenSelected = previous.tokenSelected;
            this.tokenHovered = previous.tokenHovered;
        }
    },

    Grapher3DGraphsLayer: class { // TODO: this is pretty nasty in terms of webgl
        constructor(controller, settings) {
            this.controller = controller;
            this.settings = settings;
            this.buffer = {};
        }

        redrawToGL(layer, projection, sketches, sketchOrder) {
            sketchOrder.forEach((sketchID) => {
                let sketch = sketches[sketchID];
                if (sketch) {
                    this.drawSketchToGL(sketch, layer, projection);
                }
            })
        }

        drawSketchToGL(sketch, layer, projection) {
            if (!sketch.branches || !sketch.branches.length) {
                return;
            }
            this.buffer.triangles ||= layer.program.triangles.createBuffers();
            this.buffer.lines ||= layer.program.lines.createBuffers();
            sketch.branches.forEach((branch) => {
                switch (branch.graphMode) {
                    case dcg.GraphMode.CURVE_3D_PARAMETRIC:
                    case dcg.GraphMode.CURVE_3D_XY_GRAPH:
                        this.drawCurveToGL(layer, layer.colorFromHex(branch.color), 1, branch.thickness, branch.points);
                        break;
                    case dcg.GraphMode.SURFACE_PARAMETRIC:
                    case dcg.GraphMode.SURFACE_Z_BASED:
                    case dcg.GraphMode.SURFACE_X_BASED:
                    case dcg.GraphMode.SURFACE_Y_BASED:
                    case dcg.GraphMode.SURFACE_IMPLICIT:
                        this.drawMeshToGL(layer, layer.colorFromHex(branch.color), branch.meshData);
                        break;
                    default:
                        break;
                }
            });
        }

        drawMeshToGL(layer, color, {positions, normals, uvs, faces: indices}) {
            let colors = new Float32Array(positions.length);
            for (let colorIndex = 0; colorIndex < colors.length; colorIndex += 3) {
                colors.set(color, colorIndex);
            }

            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.triangles.positions);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, positions, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.triangles.colors);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, colors, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.triangles.normals);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, normals, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ELEMENT_ARRAY_BUFFER, this.buffer.triangles.indices);
            layer.gl.bufferData(layer.gl.ELEMENT_ARRAY_BUFFER, indices, layer.gl.DYNAMIC_DRAW);

            layer.setProgram(layer.program.triangles, this.buffer.triangles);

            layer.gl.drawElements(layer.gl.TRIANGLES, indices.length, layer.gl.UNSIGNED_INT, 0);
        }

        drawCurveToGL(layer, color, opacity, thickness, points) {
            if (!points) {
                return;
            }
            let count = points.length / 3;
            let origColors = new Float32Array(count * 4);
            for (let colorIndex = 0; colorIndex < origColors.length; colorIndex += 4) {
                origColors.set(color, colorIndex);
                origColors[colorIndex + 3] = opacity;
            }
            let origWidths = new Float32Array(count / 3);
            origWidths.fill(thickness * 4);
            let origIndices = new Uint32Array((count - 1) * 2);
            for (let index = 0; index + 1 < count; index++) {
                origIndices[index * 2 + 0] = index + 0;
                origIndices[index * 2 + 1] = index + 1;
            }

            let {positions, colors, tangents, offsets, indices} = layer.program.lines.generateLineGeometry(points, origColors, origWidths, origIndices);

            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.lines.positions);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, positions, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.lines.colors);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, colors, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.lines.tangents);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, tangents, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, this.buffer.lines.offsets);
            layer.gl.bufferData(layer.gl.ARRAY_BUFFER, offsets, layer.gl.DYNAMIC_DRAW);
            layer.gl.bindBuffer(layer.gl.ELEMENT_ARRAY_BUFFER, this.buffer.lines.indices);
            layer.gl.bufferData(layer.gl.ELEMENT_ARRAY_BUFFER, indices, layer.gl.DYNAMIC_DRAW);

            layer.setProgram(layer.program.lines, this.buffer.lines);

            layer.gl.drawElements(layer.gl.TRIANGLES, indices.length, layer.gl.UNSIGNED_INT, 0);
        }
    },

    Orientation3D: class {
        constructor(distance, pitch, yaw) {
            this.__distance = distance;
            this.__pitch = pitch;
            this.__yaw = yaw;
            this.__fieldOfView = 45 * Math.PI / 180;
            this.__projection = mat4.create();
        }

        get distance() {
            return this.__distance;
        }

        set distance(distance) {
            return this.__distance = distance;
        }

        get pitch() {
            return this.__pitch;
        }

        set pitch(radians) {
            return this.__pitch = dcg.clamp(radians, -0.5 * Math.PI, 0.5 * Math.PI);
        }

        get yaw() {
            return this.__yaw;
        }

        set yaw(radians) {
            return this.__yaw = radians;
        }

        get fieldOfView() {
            return this.__fieldOfView;
        }
        
        set fieldOfView(radians) {
            return this.__fieldOfView = radians;
        }

        updateProjection(width, height) {
            if (width > 0 && height > 0) {
                const aspectRatio = width / height;
                const zNear = 0.1;
                const zFar = Infinity;
                mat4.perspective(this.__projection, this.__fieldOfView, aspectRatio, zNear, zFar);
            }
        }

        getModelView() {
            let matrix = mat4.fromTranslation(mat4.create(), [0.0, 0.0, -this.distance]);
            mat4.rotate(matrix, matrix, this.pitch, [1, 0, 0]);
            mat4.rotate(matrix, matrix, this.yaw, [0, 1, 0]);
            // make z "up" by mapping x -> z, y -> x, z -> y
            mat4.multiply(matrix, matrix, mat4.fromValues(
                // this is actually column-major, so rows and columns are flipped. go figure.
                0, 0, 1, 0,
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 0, 1,
            ));
            return matrix;
        }

        getProjection() {
            return this.__projection;
        }

        equals(other) {
            return other instanceof DesmosCustom.Orientation3D
                && mat4.equals(this.getProjection(), other.getProjection())
                && mat4.equals(this.getModelView(), other.getModelView());
        }
    },

    Grapher3DControls: class {
        constructor(grapher, controller) {
            this.grapher = grapher;
            this.controller = controller;
            this.elt = grapher.elt;
            this.id = dcg.nextViewportControllerID();

            this.mousePt = dcg.point(0, 0);
            this.lastScrollZoom = Date.now();
            this.preventScrollZoom = false;

            this.orientation = new DesmosCustom.Orientation3D(20.0, 0.1 * Math.PI, 0.25 * Math.PI);

            this.addMouseWheelEventHandler();
            this.addTouchEventHandler();
        }

        get name() {
            return ".controls3d-" + this.id;
        }

        remove() {
            dcg.$(window).off(this.name);
        }

        getViewport() {
            return this.grapher.getProjection().viewport;
        }

        setViewport(viewport) {
            if (viewport.isValid(this.controller.getAxisScaleSettings()) && !viewport.equals(this.getViewport())) {
                let {screen, settings} = this.getProjection();
                this.grapher._setProjection(new dcg.Projection(screen, viewport, settings));
            }
        }

        getProjection() {
            return this.grapher.getProjection();
        }

        isViewportLocked() {
            let settings = this.grapher.getProjection().settings;
            return settings.config.lockViewport || settings.userLockedViewport;
        }

        updateMouse(mouseEvent) {
            let {left, top} = this.elt.getBoundingClientRect();
            this.mousePt = dcg.point(mouseEvent.clientX - left, mouseEvent.clientY - top);
        }

        addMouseWheelEventHandler() {
            let e = false;
            let lastWheelX, lastWheelY;
            let n = 0;
            dcg.$(window).on("scroll" + this.name, (event) => {
                e = true;
            });
            dcg.$(window).on("wheel" + this.name, (event) => {
                lastWheelX = event.clientX;
                lastWheelY = event.clientY;
            });
            dcg.$(window).on("mousemove" + this.name, (event) => {
                if (e) {
                    let dx = event.clientX - lastWheelX;
                    let dy = event.clientY - lastWheelY;
                    if (dx*dx + dy*dy >= 100) {
                        e = false;
                    }
                }
            });
            dcg.$(this.elt).on("wheel", (event) => {
                let original = event.originalEvent;
                if (original.deltaX === 0 && original.deltaY === 0) {
                    return;
                }
                let now = Date.now();
                if (this.preventScrollZoom && now - this.lastScrollZoom > 50) {
                    this.preventScrollZoom = false;
                }
                this.lastScrollZoom = now;
                if (this.preventScrollZoom) {
                    return;
                }
                this.zoomOrientation(original.deltaX, original.deltaY);
                this.grapher.debounceUserRequestedViewportChange();
                this.controller.requestRedrawGraph();
            });
        }

        addTouchEventHandler() {
            let prevTouches = [];
            let isDragging = false;
            const resetState = () => {
                this.preventScrollZoom = true;
            };
            dcg.$(window).on("mousemove" + this.name, (event) => {
                if (!isDragging && !this.isViewportLocked()) {
                    this.updateMouse(event);
                }
            });
            dcg.$(this.elt).on("dcg-tapstart.graphdrag", (event) => {
                if (!isDragging && !this.isViewportLocked() && event.touches.length === event.changedTouches.length) {
                    isDragging = true;
                    this.grapher.isDragging = true,
                    this.updateMouse(event);
                    this.controller.dispatch({ type: "grapher/drag-start" });
                    dcg.$(document).on("dcg-tapmove.graphdrag", (event) => {
                        if (isDragging && !this.isViewportLocked()) {
                            let touches = dcg.r3(event.touches, dcg.Ul(this.elt));
                            if (prevTouches.length === 2 && b.length === 2) {
                                a(touches);
                                this.applyScaleTouchChanges(prevTouches, touches);
                            }
                            if (prevTouches.length === 1) {
                                this.applyPanTouchChanges(prevTouches, touches);
                            }
                            this.controller.dispatch({ type: "grapher/drag-move" });
                            prevTouches = touches;
                        }
                        this.controller.requestRedrawGraph();
                    });
                    dcg.$(document).on("dcg-tapstart.graphdrag dcg-tapend.graphdrag dcg-tapcancel.graphdrag", (event) => {
                        if (isDragging) {
                            prevTouches = dcg.r3(event.touches, dcg.Ul(this.elt));
                            if (event.touches.length === 0) {
                                isDragging = false;
                                this.grapher.isDragging = false;
                                dcg.$(document).off(".graphdrag");
                                this.grapher.debounceUserRequestedViewportChange();
                                this.controller.dispatch({ type: "grapher/drag-end" });
                            }
                            this.controller.requestRedrawGraph();
                        }
                    });
                }
            });
            dcg.$(window).on("keydown" + this.name, (event) => {});
            dcg.$(window).on("keyup" + this.name + " blur" + this.name, resetState);
        }

        applyPanTouchChanges(prevTouches, touches) {
            if (this.isViewportLocked()) {
                return;
            }
            let delta = dcg.point(touches[0].x - prevTouches[0].x, touches[0].y - prevTouches[0].y);
            this.rotateOrientation(delta);
            this.grapher.debounceUserRequestedViewportChange();
        }

        applyScaleTouchChanges(prevTouches, touches) {
            if (this.isViewportLocked()) {
                return;
            }
            // TODO
            this.grapher.debounceUserRequestedViewportChange();
        }

        zoomOrientation(deltaX, deltaY) {
            let delta = deltaY || deltaX;
            let zoomFactor = delta > 0 ? 1.0625 : delta < 0 ? 1 / 1.0625 : 1;
            this.orientation.distance *= zoomFactor;
        }

        rotateOrientation(delta) {
            let angleMultiplier = (this.orientation.fieldOfView / this.elt.clientHeight) * this.orientation.distance;
            this.orientation.pitch += delta.y * angleMultiplier;
            this.orientation.yaw += delta.x * angleMultiplier;
        }

        isDefaultOrientation() {
            return true; // TODO
        }

        copyWorldRotationToWorld() {
        }

        prepareTransitionFrom2Dto3D() {
        }

        animateTransitionFrom2Dto3D() {
        }
    },

    Grapher3D: class {
        constructor(elt, settings, controller, evaluator) {
            this.type = "3d";
            this.lastActiveToken = {
                selected: undefined,
                hovered: undefined,
            };

            this.elt = elt;
            this.evaluator = evaluator;
            this.controller = controller;
            this.settings = settings;
            
            let screen = dcg.defaultScreenSize();
            let viewport = dcg.defaultViewport(settings);
            this.setUserRequestedViewport(viewport);
            this.__projection = new dcg.Projection(screen, viewport, settings);
            
            this.elt.style.overflow = "hidden";
            this.graphSketches = {};
            this.controls = new DesmosCustom.Grapher3DControls(this, controller);
            this.webglLayer = dcg.View.mountToNode(DesmosCustom.WebGLLayer, this.elt, { grapher: () => this });
            this.elt.appendChild(this.webglLayer.rootNode);
            this.gridLayer = new DesmosCustom.Grapher3DGridLayer(this);
            this.graphsLayer = new DesmosCustom.Grapher3DGraphsLayer(controller, settings);
            this.__sketchOrder = [];
            this.__redrawRequested = false;
            this.__isRedrawingSlowly = false;
            this.events = undefined; // TODO: api interaction?
            this.viewportController = this.planeGrapher.viewportController;
        }

        static copyGraphProperties(target, source) {
            target = dcgSharedModule.Cc(dcg.Lh, target);
            let state = dcgSharedModule.a({}, target);
            delete state.viewport;
            let validated = source.validateSettings(state);
            for (let prop in validated) {
                source.setProperty(prop, validated[prop]);
            }
            return target;
        }

        get planeGrapher() {
            return this.controller.grapher2d;
        }

        baseplaneWidth() {
            return 768; // TODO: pixel size needed for 2d grapher to draw
        }

        remove() {
            this.elt.remove();
        }

        clear() {
            this.planeGrapher.clear();
            this.graphSketches = {};
        }

        tick(e) {
            if (this.__redrawRequested) {
                this.redrawAllLayersSynchronously();
            }
        }

        update() {
            let layout = this.controller.computeMajorLayout().grapher;
            this.elt.classList.toggle("dcg-grapher-focused", this.controller.isGraphPaperFocused()
                && !this.controller.getSelectedGeoExpression()
                && !this.controller.inAudioTraceMode());
            if (layout.width > 0 && layout.height > 0) {
                this._setIsVisible(true);
                this._updateScreenSize(layout.width, layout.height);
                Object.assign(this.elt.style, {
                    position: "absolute",
                    left: layout.left + "px",
                    top: layout.top + "px",
                    width: layout.width + "px",
                    height: layout.height + "px",
                });
            } else {
                this._setIsVisible(false);
            }
        }

        _updateScreenSize(width, height) {
            if (width <= 0 || height <= 0)
                return;
            let current = this.getProjection().screen;
            if (current.width === width && current.height === height)
                return;
            this.elt.style.width = width + "px";
            this.webglLayer.resize(width, height);
        }

        _setIsVisible(visible) {
            if (visible !== this.isVisible) {
                this.isVisible = visible;
                if (visible) {
                    this.controller.requestRedrawGraph();
                } else {
                    this.webglLayer.resize(0, 0);
                }
            }
        }

        redrawAllLayers() {
            this.__redrawRequested = true;
        }

        redrawAllLayersSynchronously() {
            this.update();
            if (!this.isVisible || !this.webglLayer.gl) {
                return;
            }
            this.__redrawRequested = false;
            this.webglLayer.beginRedraw();
            this._redrawGraphsLayer();
            this._redrawGridLayer();
        }

        _redrawGridLayer() {
            this.gridLayer.redrawToGL(this.webglLayer, this.getProjection());
        }

        _redrawGraphsLayer() {
            this.graphsLayer.redrawToGL(this.webglLayer, this.getProjection(), this.graphSketches, this.__sketchOrder);
        }

        getGraphSketch(sketchID) {
            return this.graphSketches[sketchID];
        }

        addGraphSketch(sketch) {
            this.graphSketches[sketch.id] = sketch;
        }

        removeGraphSketch(sketchID) {
            delete this.graphSketches[sketchID];
        }

        updateSketch(sketchID, branches) {
            let originalSketch = this.getGraphSketch(sketchID);
            if (!branches.length) {
                this.removeGraphSketch(sketchID);
                return;
            }
            let sketch = new DesmosCustom.GraphSketch3D(sketchID, branches);
            if (branches[0].graphMode !== dcg.GraphMode.ERROR) {
                sketch.color = branches[0].color;
                if (branches[0].style) {
                    sketch.style = branches[0].style;
                }
            }
            if (originalSketch) {
                sketch.updateFrom(originalSketch);
            }
            let selected = !!this.controller.getPropagatedSelectedIds()[sketchID];
            sketch.selected = selected;
            sketch.tokenHovered = sketchID === String(this.lastActiveToken.hovered);
            sketch.tokenSelected = sketchID === String(this.lastActiveToken.selected);
            sketch.showPOI = selected && this.controller.isTraceEnabled();
            sketch.showHighlight = selected;
            this.addGraphSketch(sketch);
        }

        selectSketch(sketchID) {
            let sketch = this.getGraphSketch(sketchID);
            if (sketch) {
                sketch.selected = true;
                sketch.showPOI = this.controller.isTraceEnabled();
                sketch.showHighlight = true;
            }
        }

        deselectSketch(sketchID) {
            let sketch = this.getGraphSketch(sketchID);
            if (sketch) {
                sketch.selected = false;
                sketch.showPOI = false;
                sketch.showHighlight = false;
            }
        }

        getSketchOrder() {
            return this.__sketchOrder;
        }

        setSketchOrder(order) {
            if (!dcg.isEqual(this.__sketchOrder, order)) {
                this.__sketchOrder = order;
                this.controller.requestRedrawGraph();
            }
        }

        getState(opts) {
            let viewport = dcgSharedModule.a({}, this.getCurrentViewport());
            let state = {viewport};
            this.settings.stateProperties.forEach((prop) => {
                if (prop !== "randomSeed") {
                    state[prop] = this.settings[prop];
                }
            });
            if (opts.stripDefaults) {
                state = dcgSharedModule.Ac(dcg.Lh, i);
            }
            return state;
        }

        setGrapherState(state, opts) {
            this.planeGrapher.setGrapherState(state, opts);

            if (!opts || !opts.doNotClear) {
                this.clear();
            }
            state = DesmosCustom.Grapher3D.copyGraphProperties(state, this.settings);
            if ("viewport" in state) {
                let viewport = dcg.Viewport.fromObject(state.viewport);
                this.setUserRequestedViewport(viewport);
                this.viewportController.setViewport(viewport);
            }

            this.controller.requestRedrawGraph();
        }

        getProjection() {
            return this.__projection;
        }

        _setProjection(projection) {
            this.__projection = projection;
            this.controller.requestRedrawGraph();
        }

        getCurrentViewport() {
            return this.controls.getViewport().toObject();
        }

        getUserRequestedViewport() {
            return this._lastUserRequestedViewport;
        }

        setUserRequestedViewport(viewport) {
            // i couldn't figure out how to get the viewport to update otherwise
            if (this._lastUserRequestedViewport) {
                let lastViewport = dcg.Viewport.fromObject(this._lastUserRequestedViewport);
                if (!lastViewport.equals(viewport)) {
                    this.controls.setViewport(dcg.Viewport.fromObject(viewport));
                }
            }
            this._lastUserRequestedViewport = dcgSharedModule.j(viewport);
        }

        debounceUserRequestedViewportChange() {
            /*this.__debouncedViewportCommit ||= dcg.commitFunction((viewport, token) => {
                if (!this.isDragging && this._lastUserRequestedViewportUpdateToken === token) {
                    if (this._lastUserRequestedViewport) {
                        let lastViewport = dcg.Viewport.fromObject(this._lastUserRequestedViewport);
                        if (lastViewport.equals(viewport)) {
                            return;
                        }
                    }
                    this.controller.dispatch({ type: "commit-user-requested-viewport", viewport });
                }
            }, 1000);
            this.__debouncedViewportCommit(this.getCurrentViewport(), this._lastUserRequestedViewportUpdateToken)*/
        }

        getUndoRedoState() {
            let state = {};
            this.settings.stateProperties.forEach(prop => {
                state[prop] = this.settings[prop];
            });
            state.viewport = this.getUserRequestedViewport();
            return state;
        }

        getDefaultViewport() {
            return this.planeGrapher.getDefaultViewport();
        }
    },
}

// Put the calculator in 3D mode
Calc._calc.initializeGrapher3d(DesmosCustom.Grapher3D);
