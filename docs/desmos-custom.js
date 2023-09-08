const DesmosCustom = {
    isPowerOf2: (value) => (value & (value - 1)) === 0,

    stringHashCode: (string) => [...string].reduce(
        (hash, char) => (Math.imul(31, hash) + char.charCodeAt(0)) | 0,
        0,
    ),

    *range(start, end = null, step = 1) {
        if (end == null) {
            end = start;
            start = 0;
        }
        for (let item = start; item < end; item += step) {
            yield item;
        }
    },

    *enumerate(iterator) {
        let index = 0;
        for (let item of iterator) {
            yield [index++, item];
        }
    },

    *map(iterator, mapFn) {
        for (let [index, item] of DesmosCustom.enumerate(iterator)) {
            yield mapFn(item, index);
        }
    },

    *filter(iterator, filterFn) {
        for (let [index, item] of DesmosCustom.enumerate(iterator)) {
            if (filterFn(item, index)) {
                yield item;
            }
        }
    },

    *filterMap(iterator, filterFn, mapFn) {
        for (let [index, item] of DesmosCustom.enumerate(iterator)) {
            if (filterFn(item, index)) {
                yield mapFn(item, index);
            }
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
            return this.__pitch = Math.min(Math.max(radians, -0.5 * Math.PI), 0.5 * Math.PI);
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

    GeometryBuffer: class {
        constructor(gl, attributes) {
            this.indices = { buffer: gl.createBuffer(), array: null };
            this.attributes = {};
            for (let {name, id, channels} of attributes) {
                this.attributes[name] = { id, channels, buffer: gl.createBuffer(), array: null };
            }
            this.__vertexCount = 0;
        }

        clear() {
            this.indices.array = null;
            for (let name of Object.keys(this.attributes)) {
                this.attributes[name].array = null;
            }
            this.__vertexCount = 0;
        }

        addGeometry({indices, ...attributes}) {
            if (!this.indices.array) {
                this.indices.array = new Uint32Array(indices);
            } else {
                let origIndices = this.indices.array;
                this.indices.array = new Uint32Array(origIndices.length + indices.length);
                this.indices.array.set(origIndices);
                this.indices.array.set(indices.map(index => index + this.__vertexCount), origIndices.length);
            }

            let vertexCount = 0;
            for (let name of Object.keys(this.attributes)) {
                let calcVertexCount = attributes[name].length / this.attributes[name].channels;
                if (vertexCount === 0) {
                    vertexCount = calcVertexCount;
                } else if (calcVertexCount !== vertexCount) {
                    throw new Error("conflicting vertex counts");
                }

                if (!this.attributes[name].array) {
                    this.attributes[name].array = new Float32Array(attributes[name]);
                } else {
                    let origArray = this.attributes[name].array;
                    this.attributes[name].array = new Float32Array(origArray.length + attributes[name].length);
                    this.attributes[name].array.set(origArray);
                    this.attributes[name].array.set(attributes[name], origArray.length);
                }
            }
            this.__vertexCount += vertexCount;
        }

        upload(gl) {
            if (!this.indices.array) {
                return;
            }

            for (let name of Object.keys(this.attributes)) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.attributes[name].buffer);
                gl.bufferData(gl.ARRAY_BUFFER, this.attributes[name].array, gl.DYNAMIC_DRAW);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices.buffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.array, gl.DYNAMIC_DRAW);
        }

        draw(gl) {
            if (!this.indices.array) {
                return;
            }

            for (let name of Object.keys(this.attributes)) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.attributes[name].buffer);
                gl.vertexAttribPointer(this.attributes[name].id, this.attributes[name].channels, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(this.attributes[name].id);
            }

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices.buffer);
            gl.drawElements(gl.TRIANGLES, this.indices.array.length, gl.UNSIGNED_INT, 0);
        }
    },
    
    init: () => {
        DesmosCustom.init = () => {};

        Object.assign(DesmosCustom, {
            WebGLLayer: class extends dcg.View.Class {
                init() {
                    this.grapher = this.props.grapher();
                    this.controller = this.grapher.controller;
                    this.width = 0;
                    this.height = 0;
                    this.pixelRatio = 0;
                    this.lightDirection = [1, 1, 5];
                    this.ambientLight = 0.4;
                    this.__showBox = !!this.grapher.settings.showBox3D;
                    this.__showAxes = !!this.grapher.settings.showAxis3D;
                    this.__showPlane = !!this.grapher.settings.showPlane3D && this.__showAxes;
                    this.__cachedBackgroundColor = null;
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
        
                hexColorToRGB(hexColor) {
                    if (typeof hexColor === "string") {
                        let match;
                        if (match = hexColor.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/)) {
                            return [
                                parseInt(match[1], 16) / 255,
                                parseInt(match[2], 16) / 255,
                                parseInt(match[3], 16) / 255,
                            ];
                        }
                        else if (match = hexColor.match(/^#([0-9A-Fa-f]{1})([0-9A-Fa-f]{1})([0-9A-Fa-f]{1})$/)) {
                            return [
                                parseInt(match[1] + match[1], 16) / 255,
                                parseInt(match[2] + match[2], 16) / 255,
                                parseInt(match[3] + match[3], 16) / 255,
                            ];
                        }
                    }
                    return [0, 0, 0];
                }
        
                _loadContext() {
                    const WEBGL_CONTEXT_OPTIONS = {
                        alpha: false,
                        depth: true,
                        desynchronized: true,
                        antialias: true,
                    };

                    this.legacyMode = false;
                    this.gl = this.canvasNode.getContext("webgl2", WEBGL_CONTEXT_OPTIONS);
                    if (!this.gl) {
                        this.legacyMode = true;
                        this.gl = this.canvasNode.getContext("webgl", WEBGL_CONTEXT_OPTIONS);
                    }
                    if (!this.gl) {
                        throw new Error("Unable to create a WebGL context. WebGL may not be supported by your browser.");
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
                            uniform float uAmbientLight;
        
                            in vec3 aPosition;
                            in vec3 aColor;
                            in vec3 aNormal;
        
                            out vec4 vColor;
                    
                            void main() {
                                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
        
                                float lightingMultiplier = uAmbientLight + (1.0 - uAmbientLight) * abs(dot(normalize(aNormal), normalize(uLightDirection)));
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
                            // (i don't know whether this is necessary to do here...)
                            position: (this.gl.bindAttribLocation(shaderProgram, 0, "aPosition"), 0),
                            color: this.gl.getAttribLocation(shaderProgram, "aColor"),
                            normal: this.gl.getAttribLocation(shaderProgram, "aNormal"),
                        },
                        uniform: {
                            modelViewMatrix: this.gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
                            projectionMatrix: this.gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
                            lightDirection: this.gl.getUniformLocation(shaderProgram, "uLightDirection"),
                            ambientLight: this.gl.getUniformLocation(shaderProgram, "uAmbientLight"),
                        },
                        createBuffer: () => new DesmosCustom.GeometryBuffer(this.gl, [
                            { name: "position", id: this.program.triangles.attribute.position, channels: 3 },
                            { name: "color", id: this.program.triangles.attribute.color, channels: 3 },
                            { name: "normal", id: this.program.triangles.attribute.normal, channels: 3 },
                        ]),
                        generateSphereGeometry: ([cx, cy, cz], radius, uniformColor, latitudes = 20, longitudes = 20) => {
                            // 1 top, 1 bottom, (latitudes - 1) layers between, (longitudes) points in each layer
                            let pointCount = 2 + (latitudes - 1) * longitudes;
                            let position = new Float32Array(pointCount * 3);
                            position.set([cx, cy, cz + radius, cx, cy, cz - radius]);
                            let color = new Float32Array(pointCount * 3);
                            for (let colorIndex = 0; colorIndex < color.length; colorIndex += 3) {
                                color.set(uniformColor, colorIndex);
                            }
                            let normal = new Float32Array(pointCount * 3);
                            normal.set([0, 0, Math.sign(radius), 0, 0, -Math.sign(radius)]);
                            // for each longitude: 1 top, 1 bottom, 2 for each of the (latitudes - 2) quads
                            let triangleCount = ((latitudes - 2) * 2 + 2) * longitudes;
                            let indices = new Uint32Array(triangleCount * 3);
        
                            let longitudeDirections = Array.from(DesmosCustom.map(DesmosCustom.range(longitudes), (longitude) => {
                                let radians = 2 * Math.PI * longitude / longitudes;
                                return [Math.cos(radians), Math.sin(radians)];
                            }));
        
                            for (let latitude = 1, index = 2; latitude < latitudes; latitude++, index += longitudes) {
                                let z = Math.cos(Math.PI * latitude / latitudes);
                                let layerScale = Math.sin(Math.PI * latitude / latitudes);
                                position.set(longitudeDirections.flatMap(([x, y]) => [x * layerScale * radius + cx, y * layerScale * radius + cy, z * radius + cz]), index * 3);
                                normal.set(longitudeDirections.flatMap(([x, y]) => [x * layerScale, y * layerScale, z]), index * 3);
                            }
        
                            for (let longitude = 0; longitude < longitudes; longitude++) {
                                let nextLongitude = (longitude + 1) % longitudes;
                                // add top triangle
                                indices[longitude * 3 + 0] = 0;
                                indices[longitude * 3 + 1] = 2 + longitude;
                                indices[longitude * 3 + 2] = 2 + nextLongitude;
                                // add bottom triangle
                                indices[(longitudes + longitude) * 3 + 0] = 1;
                                indices[(longitudes + longitude) * 3 + 1] = pointCount - 1 - longitude;
                                indices[(longitudes + longitude) * 3 + 2] = pointCount - 1 - nextLongitude;
                                // add 2 triangles for each quad in the longitude
                                for (let layer = 0, nextLayer = 1, index = 2 * longitudes + 2 * longitude; nextLayer < latitudes - 1; layer++, nextLayer++, index += 2 * longitudes) {
                                    let point0 = 2 + layer * longitudes + longitude;
                                    let point1 = 2 + layer * longitudes + nextLongitude;
                                    let point2 = 2 + nextLayer * longitudes + nextLongitude;
                                    let point3 = 2 + nextLayer * longitudes + longitude;
                                    indices[index * 3 + 0] = point0;
                                    indices[index * 3 + 1] = point1;
                                    indices[index * 3 + 2] = point2;
                                    indices[index * 3 + 3] = point2;
                                    indices[index * 3 + 4] = point3;
                                    indices[index * 3 + 5] = point0;
                                }
                            }
        
                            return { position, color, normal, indices };
                        },
                    };

                    shaderProgram = this.createShaderProgram([
                        [this.gl.VERTEX_SHADER, `
                            uniform mat4 uModelViewMatrix;
                            uniform mat4 uProjectionMatrix;

                            in vec3 aPosition;
                            in vec2 aTexCoord;

                            out highp vec2 vTexCoord;
                    
                            void main() {
                                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                                vTexCoord = aTexCoord;
                            }
                        `],
                        [this.gl.FRAGMENT_SHADER, `
                            uniform sampler2D uTexture;

                            in highp vec2 vTexCoord;
        
                            void main() {
                                color = texture(uTexture, vTexCoord);
                            }
                        `],
                    ]);
                    this.gl.useProgram(shaderProgram);
                    this.program.textured = {
                        id: shaderProgram,
                        attribute: {
                            // guarantee that there is an attribute bound at location 0 so the browser doesn't have to do expensive emulation; see
                            // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#always_enable_vertex_attrib_0_as_an_array
                            // (i don't know whether this is necessary to do here...)
                            position: (this.gl.bindAttribLocation(shaderProgram, 0, "aPosition"), 0),
                            texCoord: this.gl.getAttribLocation(shaderProgram, "aTexCoord"),
                        },
                        uniform: {
                            modelViewMatrix: this.gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
                            projectionMatrix: this.gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
                            texture: this.gl.getUniformLocation(shaderProgram, "uTexture"),
                        },
                        createBuffer: () => new DesmosCustom.GeometryBuffer(this.gl, [
                            { name: "position", id: this.program.textured.attribute.position, channels: 3 },
                            { name: "texCoord", id: this.program.textured.attribute.texCoord, channels: 2 },
                        ]),
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
                            // (i don't know whether this is necessary to do here...)
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
                        createBuffer: () => new DesmosCustom.GeometryBuffer(this.gl, [
                            { name: "position", id: this.program.lines.attribute.position, channels: 3 },
                            { name: "color", id: this.program.lines.attribute.color, channels: 4 },
                            { name: "tangent", id: this.program.lines.attribute.tangent, channels: 3 },
                            { name: "offset", id: this.program.lines.attribute.offset, channels: 1 },
                        ]),
                        generateLineGeometry: (position, color, width, indices) => {
                            let output = {
                                position: new Float32Array(indices.length * 6),
                                color: new Float32Array(indices.length * 8),
                                tangent: new Float32Array(indices.length * 6),
                                offset: new Float32Array(indices.length * 2),
                                indices: new Uint32Array(indices.length * 3),
                            };
                            for (let element = 0; element < indices.length; element += 2) {
                                let index0 = indices[element + 0];
                                let index1 = indices[element + 1];
        
                                let data = position.slice(index0 * 3 + 0, index0 * 3 + 3);
                                output.position.set(data, element * 6 + 0);
                                output.position.set(data, element * 6 + 3);
                                output.tangent.set(data, element * 6 + 6);
                                output.tangent.set(data, element * 6 + 9);
                                data = position.slice(index1 * 3 + 0, index1 * 3 + 3);
                                output.tangent.set(data, element * 6 + 0);
                                output.tangent.set(data, element * 6 + 3);
                                output.position.set(data, element * 6 + 6);
                                output.position.set(data, element * 6 + 9);
                                data = color.slice(index0 * 4 + 0, index0 * 4 + 4);
                                output.color.set(data, element * 8 + 0);
                                output.color.set(data, element * 8 + 4);
                                data = color.slice(index1 * 4 + 0, index1 * 4 + 4);
                                output.color.set(data, element * 8 + 8);
                                output.color.set(data, element * 8 + 12);
                                output.offset[element * 2 + 0] = 0.5 * width[index0];
                                output.offset[element * 2 + 1] = -0.5 * width[index0];
                                output.offset[element * 2 + 2] = 0.5 * width[index1];
                                output.offset[element * 2 + 3] = -0.5 * width[index1];
        
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
        
                setProgram(program, texture = null) {
                    this.gl.useProgram(program.id);
        
                    if (program.uniform.modelViewMatrix) {
                        this.gl.uniformMatrix4fv(program.uniform.modelViewMatrix, false, this.grapher.controls.orientation.getModelView());
                    }
                    if (program.uniform.projectionMatrix) {
                        this.gl.uniformMatrix4fv(program.uniform.projectionMatrix, false, this.grapher.controls.orientation.getProjection());
                    }
                    if (program.uniform.lightDirection) {
                        this.gl.uniform3f(program.uniform.lightDirection, ...this.lightDirection);
                    }
                    if (program.uniform.ambientLight) {
                        this.gl.uniform1f(program.uniform.ambientLight, this.ambientLight);
                    }
                    if (program.uniform.resolution) {
                        this.gl.uniform2f(program.uniform.resolution, this.width, this.height);
                    }
                    if (program.uniform.texture && texture != null) {
                        this.gl.activeTexture(this.gl.TEXTURE0);
                        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                        this.gl.uniform1i(program.uniform.texture, 0);
                    }
                }
        
                setBackgroundColor(color = "#ffffff") {
                    if (color !== this.__cachedBackgroundColor) {
                        this.__cachedBackgroundColor = color;
                        this.gl.clearColor(...this.hexColorToRGB(color), 1);
                        this.grapher.controller.requestRedrawGraph();
                    }
                }

                isShowBox() {
                    return this.__showBox;
                }
        
                showBox(show) {
                    this.__showBox = show;
                    //this.grapher.controller.requestRedrawGraph();
                }

                isShowAxes() {
                    return this.__showAxes;
                }
        
                showAxes(show) {
                    this.__showAxes = show;
                    //this.grapher.controller.requestRedrawGraph();
                }

                isShowPlane() {
                    return this.__showPlane;
                }
        
                showPlane(show) {
                    this.__showPlane = show;
                    //this.grapher.controller.requestRedrawGraph();
                }
        
                updateAxes() {
                }
        
                updatePlaneMap() {
                    let { canvasNode, ctx } = this.grapher.planeGrapher.canvasLayer;
                    this.grapher.gridLayer.updatePlaneMap(this, ctx.getImageData(0, 0, canvasNode.width, canvasNode.height));
                }
            },
        
            Grapher3DGridLayer: class {
                constructor(grapher) {
                    this.grapher = grapher;
                    this.lineBuffer = null;
                    this.planeBuffer = null;
                    this.planeTexture = null;
                    this.__cachedState = null;
                }
        
                redrawToGL(layer, projection) {
                    let state = Object.assign(projection.viewport.toObject(), {
                        axisOpacity: this.grapher.settings.axisOpacity,
                        majorOpacity: this.grapher.settings.majorAxisOpacity,
                        minorOpacity: this.grapher.settings.minorAxisOpacity,
                        showBox: this.grapher.webglLayer.isShowBox(),
                        showAxes: this.grapher.webglLayer.isShowAxes(),
                        showPlane: this.grapher.webglLayer.isShowPlane(),
                    });
                    if (!this.lineBuffer || !dcg.isEqual(state, this.__cachedState)) {
                        this.__cachedState = state;
        
                        if (!this.lineBuffer) {
                            this.lineBuffer = layer.program.lines.createBuffer();
                        } else {
                            this.lineBuffer.clear();
                        }
        
                        // TODO: more grid settings (needs desmos patch)
                        const MAJOR_STEP = 1;
                        const MINOR_SUBDIV_COUNT = 2;
        
                        let position = [];
                        let color = [];
                        let width = [];
                        let indices = [];

                        if (state.showAxes) {
                            position.push(
                                // axis lines
                                state.xmin,0,0, state.xmax,0,0, 0,state.ymin,0, 0,state.ymax,0, 0,0,state.zmin, 0,0,state.zmax,
                                // axis arrow tips
                                state.xmax,0,0, state.xmax+0.25,0,0, 0,state.ymax,0, 0,state.ymax+0.25,0, 0,0,state.zmax, 0,0,state.zmax+0.25,
                            );
                            color.push(
                                // axis lines
                                0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity,
                                // axis arrow tips
                                0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity, 0,0,0,state.axisOpacity,
                            );
                            width.push(
                                // axis lines
                                2, 2, 2, 2, 2, 2,
                                // axis arrow tips (this is where the magic happens)
                                20, 0, 20, 0, 20, 0,
                            );
                            indices.push(
                                // axis lines
                                0,1, 2,3, 4,5,
                                // axis arrow tips
                                6,7, 8,9, 10,11,
                            );
                        }
        
                        this.lineBuffer.addGeometry(layer.program.lines.generateLineGeometry(position, color, width, indices));
                        this.lineBuffer.upload(layer.gl);
                    }
        
                    layer.setProgram(layer.program.lines);
                    this.lineBuffer.draw(layer.gl);

                    if (this.planeTexture && this.planeBuffer) {
                        layer.setProgram(layer.program.textured, this.planeTexture);
                        this.planeBuffer.draw(layer.gl);
                    }
                }

                updatePlaneMap(layer, imageData) {
                    if (!this.planeTexture) {
                        this.planeTexture = layer.gl.createTexture();
                    }
                    layer.gl.bindTexture(layer.gl.TEXTURE_2D, this.planeTexture);
                    layer.gl.texImage2D(layer.gl.TEXTURE_2D, 0, layer.gl.RGBA, layer.gl.RGBA, layer.gl.UNSIGNED_BYTE, imageData);

                    // WebGL1 doesn't support mipmaps for non-power-of-two (NPOT) image sizes
                    if (!layer.legacyMode || (DesmosCustom.isPowerOf2(imageData.width) && DesmosCustom.isPowerOf2(imageData.height))) {
                        layer.gl.generateMipmap(layer.gl.TEXTURE_2D);
                    } else {
                        layer.gl.texParameteri(layer.gl.TEXTURE_2D, layer.gl.TEXTURE_WRAP_S, layer.gl.CLAMP_TO_EDGE);
                        layer.gl.texParameteri(layer.gl.TEXTURE_2D, layer.gl.TEXTURE_WRAP_T, layer.gl.CLAMP_TO_EDGE);
                    }
                    layer.gl.texParameteri(layer.gl.TEXTURE_2D, layer.gl.TEXTURE_MIN_FILTER, layer.gl.LINEAR);
                    layer.gl.texParameteri(layer.gl.TEXTURE_2D, layer.gl.TEXTURE_MAG_FILTER, layer.gl.LINEAR);

                    if (!this.planeBuffer) {
                        this.planeBuffer = layer.program.textured.createBuffer();
                    } else {
                        this.planeBuffer.clear();
                    }

                    let { xmin, xmax, ymin, ymax } = this.grapher.getProjection().viewport;
                    this.planeBuffer.addGeometry({
                        position: [xmin,ymin,0, xmax,ymin,0, xmax,ymax,0, xmin,ymax,0],
                        texCoord: [0,1, 1,1, 1,0, 0,0],
                        indices: [0,1,2, 2,3,0],
                    });
                    this.planeBuffer.upload(layer.gl);
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
        
            Grapher3DGraphsLayer: class {
                constructor(controller, settings) {
                    this.controller = controller;
                    this.settings = settings;
                    this.meshBuffer = null;
                    this.curveBuffer = null;
                }
        
                redrawToGL(layer, projection, sketches, sketchOrder) {
                    if (!this.meshBuffer) {
                        this.meshBuffer = layer.program.triangles.createBuffer();
                    } else {
                        this.meshBuffer.clear();
                    }
                    if (!this.curveBuffer) {
                        this.curveBuffer = layer.program.lines.createBuffer();
                    } else {
                        this.curveBuffer.clear();
                    }
        
                    sketchOrder.forEach((sketchID) => {
                        let sketch = sketches[sketchID];
                        if (sketch) {
                            this.addSketch(sketch, layer, projection);
                        }
                    });
        
                    this.meshBuffer.upload(layer.gl);
                    this.curveBuffer.upload(layer.gl);
        
                    layer.setProgram(layer.program.triangles);
                    this.meshBuffer.draw(layer.gl);
                    layer.setProgram(layer.program.lines);
                    this.curveBuffer.draw(layer.gl);
                }
        
                addSketch(sketch, layer, projection) {
                    if (!sketch.branches || !sketch.branches.length) {
                        return;
                    }
                    sketch.branches.forEach((branch) => {
                        let color = layer.hexColorToRGB(branch.color);
                        switch (branch.graphMode) {
                            case dcg.GraphMode.CURVE_3D_PARAMETRIC:
                            case dcg.GraphMode.CURVE_3D_PARAMETRIC_POLAR_CYLINDRICAL:
                            case dcg.GraphMode.CURVE_3D_PARAMETRIC_POLAR_SPHERICAL:
                            case dcg.GraphMode.CURVE_3D_PLANAR_GRAPH:
                                this.addCurve(layer, color, 1, branch.thickness, branch.points);
                                break;
                            case dcg.GraphMode.SURFACE_PARAMETRIC:
                            case dcg.GraphMode.SURFACE_PARAMETRIC_POLAR_CYLINDRICAL:
                            case dcg.GraphMode.SURFACE_PARAMETRIC_POLAR_SPHERICAL:
                            case dcg.GraphMode.SURFACE_Z_BASED:
                            case dcg.GraphMode.SURFACE_X_BASED:
                            case dcg.GraphMode.SURFACE_Y_BASED:
                            case dcg.GraphMode.SURFACE_Z_BASED_POLAR:
                            case dcg.GraphMode.SURFACE_POLAR_CYLINDRICAL:
                            case dcg.GraphMode.SURFACE_POLAR_SPHERICAL:
                            case dcg.GraphMode.SURFACE_IMPLICIT:
                                this.addMesh(layer, color, branch.meshData);
                                break;
                            case dcg.GraphMode.POINT_3D:
                                this.addPoint(layer, color, branch.position, branch.radius);
                                break;
                            case dcg.GraphMode.TRIANGLE_3D:
                                this.addMesh(layer, color, branch.meshData);
                                break;
                            case dcg.GraphMode.SPHERE:
                                this.addSphere(layer, color, branch.position, branch.radius);
                                break;
                            case dcg.GraphMode.SEGMENT_3D:
                            case dcg.GraphMode.VECTOR_3D:
                                this.addCurve(layer, color, 1, branch.thickness, branch.points);
                                break;
                            default:
                                break;
                        }
                    });
                }
        
                addCurve(layer, uniformColor, opacity, thickness, points) {
                    if (!points) {
                        return;
                    }
        
                    let pointCount = points.length / 3;
                    let color = new Float32Array(pointCount * 4);
                    for (let colorIndex = 0; colorIndex < color.length; colorIndex += 4) {
                        color.set(uniformColor, colorIndex);
                        color[colorIndex + 3] = opacity;
                    }
                    let width = new Float32Array(pointCount);
                    width.fill(thickness * 4);
                    let indices = new Uint32Array((pointCount - 1) * 2);
                    for (let index = 0; index + 1 < pointCount; index++) {
                        indices[index * 2 + 0] = index + 0;
                        indices[index * 2 + 1] = index + 1;
                    }
        
                    this.curveBuffer.addGeometry(layer.program.lines.generateLineGeometry(points, color, width, indices));
                }
        
                addMesh(layer, uniformColor, {positions: position, normals: normal, uvs: uv, faces: indices}) {
                    let color = new Float32Array(position.length);
                    for (let colorIndex = 0; colorIndex < color.length; colorIndex += 3) {
                        color.set(uniformColor, colorIndex);
                    }
        
                    this.meshBuffer.addGeometry({ position, color, normal, indices })
                }
        
                addPoint(layer, uniformColor, center, radius) {
                    this.addSphere(layer, uniformColor, center, radius); // TODO: i don't like points being spheres :(
                }
        
                addSphere(layer, uniformColor, center, radius) {
                    this.meshBuffer.addGeometry(layer.program.triangles.generateSphereGeometry(center, radius, uniformColor));
                }
            },

            Grapher3DControls: class {
                constructor(grapher, controller) {
                    this.grapher = grapher;
                    this.controller = controller;
                    this.elt = grapher.elt;
                    this.id = DesmosCustom.Grapher3DControls._getNextID();
        
                    this.mousePt = { x: 0, y: 0 };
                    this.lastScrollZoom = Date.now();
                    this.preventScrollZoom = false;
        
                    this.orientation = new DesmosCustom.Orientation3D(40.0, 0.1 * Math.PI, 1.9 * Math.PI);
        
                    this.addMouseWheelEventHandler();
                    this.addTouchEventHandler();
                }

                static _getNextID() {
                    if (typeof DesmosCustom.Grapher3DControls.__nextID !== "number") {
                        DesmosCustom.Grapher3DControls.__nextID = 0;
                    }
                    return DesmosCustom.Grapher3DControls.__nextID++;
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
                        let { screen, settings } = this.getProjection();
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
                    let { left, top } = this.elt.getBoundingClientRect();
                    this.mousePt = { x: mouseEvent.clientX - left, y: mouseEvent.clientY - top };
                }
        
                addMouseWheelEventHandler() {
                    const SCROLL_ZOOM_COOLDOWN_MS = 50;
                    let isScrolling = false;
                    let lastWheelX, lastWheelY;
                    dcg.$(window).on("scroll" + this.name, (event) => {
                        isScrolling = true;
                    });
                    dcg.$(window).on("wheel" + this.name, (event) => {
                        lastWheelX = event.clientX;
                        lastWheelY = event.clientY;
                    });
                    dcg.$(window).on("mousemove" + this.name, (event) => {
                        if (isScrolling) {
                            let dx = event.clientX - lastWheelX;
                            let dy = event.clientY - lastWheelY;
                            if (dx * dx + dy * dy >= 100) {
                                isScrolling = false;
                            }
                        }
                    });
                    dcg.$(this.elt).on("wheel", (event) => {
                        let original = event.originalEvent;
                        if (original.deltaX === 0 && original.deltaY === 0) {
                            return;
                        }
                        let now = Date.now();
                        if (this.preventScrollZoom && now - this.lastScrollZoom > SCROLL_ZOOM_COOLDOWN_MS) {
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
                                    let touches = dcg.processTouches(event.touches, dcg.processElement(this.elt));
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
                                    prevTouches = dcg.processTouches(event.touches, dcg.processElement(this.elt));
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
                    let delta = { x: touches[0].x - prevTouches[0].x, y: touches[0].y - prevTouches[0].y };
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
                    let angleMultiplier = (this.orientation.fieldOfView / this.elt.clientHeight) * this.orientation.distance * 0.2;
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
                    target = dcg.assigned(dcg.defaultState, target);
                    let state = dcg.assignEnumerable({}, target);
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
                    if (branches[0].graphMode !== dcg.GraphMode.ERROR_15) {
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
                    let viewport = dcg.assignEnumerable({}, this.getCurrentViewport());
                    let state = { viewport };
                    this.settings.stateProperties.forEach((prop) => {
                        if (prop !== "randomSeed") {
                            state[prop] = this.settings[prop];
                        }
                    });
                    if (opts.stripDefaults) {
                        state = dcg.stripDefaults(dcg.defaultState, state);
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
                    this._lastUserRequestedViewport = dcg.toJSON(viewport);
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
        
            GraphingCalculator3D: class extends dcg.AbstractGraphingCalculator {
                constructor(arg1, arg2, arg3) {
                    super(arg1, dcg.copyProperties(dcg.assignEnumerable({}, arg2), {
                        product: "graphing-3d",
                    }), arg3);
                }
            },
        
            init3DGrapher: () => {
                window.headerController.product = "graphing-3d";
                window.headerController.graphsController.product = "graphing-3d";

                Calc._calc.initializeGrapher3d(DesmosCustom.Grapher3D);

                document.title = Calc.controller.s("account-shell-heading-3dcalc-page-title");

                Object.assign(Calc.controller.getBlankState().graph.viewport, {
                    xmin: -10, xmax: 10,
                    ymin: -10, ymax: 10,
                    zmin: -10, zmax: 10,
                });
                Calc.setBlank();
            },
        });
    },
}
