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
            let matrix = mat4.create();
            mat4.translate(matrix, matrix, [0.0, 0.0, -this.distance]);
            mat4.rotate(matrix, matrix, this.pitch, [1, 0, 0]);
            mat4.rotate(matrix, matrix, this.yaw, [0, 1, 0]);
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

        updateFrom(originalSketch) {
            // TODO
        }
    },

    WebGLLayer: class extends dcg.View.Class {
        init() {
            this.grapher = this.props.grapher();
            this.controller = this.grapher.controller;
            this.width = 0;
            this.height = 0;
            this.pixelRatio = 0;
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
                    uniform mat4 modelView;
                    uniform mat4 projection;

                    in vec3 vertexPosition;
                    in vec3 vertexColor;
                    in vec3 vertexNormal;
            
                    out vec4 fragmentColor;
            
                    void main() {
                        gl_Position = projection * modelView * vec4(vertexPosition.x, vertexPosition.z, vertexPosition.y, 1);
                        float lightingMultiplier = max(0.0, 0.7 * abs(vertexNormal.z) + 0.3);
                        fragmentColor = vec4(vertexColor * lightingMultiplier, 1);
                    }
                `],
                [this.gl.FRAGMENT_SHADER, `
                    in vec4 fragmentColor;
            
                    void main() {
                        color = fragmentColor;
                    }
                `],
            ]);
            this.gl.useProgram(shaderProgram);
            this.program.triangles = {
                id: shaderProgram,
                attribute: {
                    vertexPosition: (this.gl.bindAttribLocation(shaderProgram, 0, "vertexPosition"), 0),
                    vertexColor: this.gl.getAttribLocation(shaderProgram, "vertexColor"),
                    vertexNormal: this.gl.getAttribLocation(shaderProgram, "vertexNormal"),
                },
                uniform: {
                    modelView: this.gl.getUniformLocation(shaderProgram, "modelView"),
                    projection: this.gl.getUniformLocation(shaderProgram, "projection"),
                },
                createBuffers: () => ({
                    positions: this.gl.createBuffer(),
                    colors: this.gl.createBuffer(),
                    normals: this.gl.createBuffer(),
                    indices: this.gl.createBuffer(),
                }),
                attachBuffers: ({positions, colors, normals, indices}) => {
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positions);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.vertexPosition);
        
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colors);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.vertexColor, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.vertexColor);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normals);
                    this.gl.vertexAttribPointer(this.program.triangles.attribute.vertexNormal, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.triangles.attribute.vertexNormal);
                }
            };

            shaderProgram = this.createShaderProgram([
                [this.gl.VERTEX_SHADER, `
                    uniform mat4 modelView;
                    uniform mat4 projection;
                    uniform vec2 resolution;

                    in vec3 vertexPosition;
                    in vec4 vertexColor;
                    in vec3 vertexTangent;
                    in float vertexOffset;
            
                    out vec4 fragmentColor;

                    vec2 getScreen(vec4 projected, float aspect) {
                        vec2 screen = projected.xy / projected.w;
                        screen.x *= aspect;
                        return screen;
                    }
            
                    void main() {
                        float aspect = resolution.x / resolution.y;
                        mat4 projViewModel = projection * modelView;
                        vec4 projVertex = projViewModel * vec4(vertexPosition.x, vertexPosition.z, vertexPosition.y, 1);
                        vec2 vertexScreen = getScreen(projVertex, aspect);
                        vec4 projTangent = projViewModel * vec4(vertexTangent.x, vertexTangent.z, vertexTangent.y, 1);
                        vec2 tangentScreen = getScreen(projTangent, aspect);
                        vec2 direction = normalize(tangentScreen - vertexScreen);
                        vec4 normal = vec4(-direction.y / aspect, direction.x, 0, 1);
                        normal.xy *= vertexOffset;
                        normal *= projection;
                        normal.xy *= projVertex.w;
                        normal.xy /= (vec4(resolution, 0, 1) * projection).xy;
                        gl_Position = projVertex + vec4(normal.xy, 0, 0);
                        fragmentColor = vertexColor;
                    }
                `],
                [this.gl.FRAGMENT_SHADER, `
                    in vec4 fragmentColor;
            
                    void main() {
                        color = fragmentColor;
                    }
                `],
            ]);
            this.gl.useProgram(shaderProgram);
            this.program.lines = {
                id: shaderProgram,
                attribute: {
                    vertexPosition: (this.gl.bindAttribLocation(shaderProgram, 0, "vertexPosition"), 0),
                    vertexColor: this.gl.getAttribLocation(shaderProgram, "vertexColor"),
                    vertexTangent: this.gl.getAttribLocation(shaderProgram, "vertexTangent"),
                    vertexOffset: this.gl.getAttribLocation(shaderProgram, "vertexOffset"),
                },
                uniform: {
                    modelView: this.gl.getUniformLocation(shaderProgram, "modelView"),
                    projection: this.gl.getUniformLocation(shaderProgram, "projection"),
                    resolution: this.gl.getUniformLocation(shaderProgram, "resolution"),
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
                    this.gl.vertexAttribPointer(this.program.lines.attribute.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.vertexPosition);
        
                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colors);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.vertexColor, 4, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.vertexColor);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, tangents);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.vertexTangent, 3, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.vertexTangent);

                    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, offsets);
                    this.gl.vertexAttribPointer(this.program.lines.attribute.vertexOffset, 1, this.gl.FLOAT, false, 0, 0);
                    this.gl.enableVertexAttribArray(this.program.lines.attribute.vertexOffset);
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

            this.gl.uniformMatrix4fv(program.uniform.modelView, false, this.grapher.controls.orientation.getModelView());
            this.gl.uniformMatrix4fv(program.uniform.projection, false, this.grapher.controls.orientation.getProjection());
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
            ], [
                0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity, 0,0,0,this.grapher.settings.axisOpacity,
            ], [
                this.grapher.settings.axisLineWidth, this.grapher.settings.axisLineWidth, this.grapher.settings.axisLineWidth, this.grapher.settings.axisLineWidth, this.grapher.settings.axisLineWidth, this.grapher.settings.axisLineWidth,
            ], [
                0,1, 2,3, 4,5,
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
                    case dcg.GraphMode.SURFACE_Z_BASED:
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

            this.orientation = new DesmosCustom.Orientation3D(6.0, 0.25 * Math.PI, 0.1 * Math.PI);

            this.addMouseWheelEventHandler();
            this.addTouchEventHandler();
        }

        get name() {
            return ".controls3d-" + this.id;
        }

        remove() {
            dcg.$(window).off(this.name);
        }

        isViewportLocked() {
            let settings = this.grapher.getProjection().settings;
            return settings.config.lockViewport || settings.userLockedViewport;
        }

        updateMouse(mouseEvent) {
            let {left, top} = this.elt.getBoundingClientRect();
            this.mousePt = dcg.point(mouseEvent.clientX - left, mouseEvent.clientY - top);
        }

        addMouseWheelEventHandler(){
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

        applyPanTouchChanges(prevTouches, touches){
            if (this.isViewportLocked()) {
                return;
            }
            let delta = dcg.point(touches[0].x - prevTouches[0].x, touches[0].y - prevTouches[0].y);
            this.rotateOrientation(delta);
        }

        applyScaleTouchChanges(prevTouches, touches){
            if (this.isViewportLocked()) {
                return;
            }
            // TODO
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
            let viewport = dcg.defaultViewport(settings).squareYAxis(screen, settings);
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

        getState(e) {
            return this.planeGrapher.getState(e);
        }

        setGrapherState(state, opts) {
            this.planeGrapher.setGrapherState(state, opts);
        }

        getProjection() {
            return this.__projection;
        }

        _setProjection(projection) {
            this.__projection = projection;
            this.controller.requestRedrawGraph();
        }

        getCurrentViewport() {
            return this.planeGrapher.getCurrentViewport();
        }

        getUserRequestedViewport() {
            return this.planeGrapher.getUserRequestedViewport();
        }

        setUserRequestedViewport(viewport) {
            this.planeGrapher.setUserRequestedViewport(viewport);
        }

        debounceUserRequestedViewportChange() {
            this.planeGrapher.debounceUserRequestedViewportChange();
        }

        /*debounceUserRequestedViewportChange() {
            this.__debouncedViewportCommit ||= dcg.commitFunction((viewport, token) => {
                if (!this.isDragging && this._lastUserRequestedViewportUpdateToken === token) {
                    if (this._lastUserRequestedViewport) {
                        let lastViewport = this.computeConcreteViewport(dcg.Viewport.fromObject(this._lastUserRequestedViewport));
                        if (lastViewport.equals(viewport)) {
                            return;
                        }
                    }
                    this.controller.dispatch({ type: "commit-user-requested-viewport", viewport });
                }
            }, 1000);
            this.__debouncedViewportCommit(this.getCurrentViewport(), this._lastUserRequestedViewportUpdateToken)
        }*/

        getUndoRedoState() {
            return this.planeGrapher.getUndoRedoState();
        }

        getDefaultViewport() {
            return this.planeGrapher.getDefaultViewport();
        }
    },
}

// Put the calculator in 3D mode
Calc._calc.initializeGrapher3d(DesmosCustom.Grapher3D);
