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

            const shaderProgram = this._loadShaderProgram();
            this.gl.useProgram(shaderProgram);

            this.shader = {
                program: shaderProgram,
                attribute: {
                    vertexPosition: this.gl.getAttribLocation(shaderProgram, "vertexPosition"),
                    vertexColor: this.gl.getAttribLocation(shaderProgram, "vertexColor"),
                },
                uniform: {
                    modelView: this.gl.getUniformLocation(shaderProgram, "modelView"),
                    projection: this.gl.getUniformLocation(shaderProgram, "projection"),
                },
            };

            this.buffer = {
                positions: this.gl.createBuffer(),
                colors: this.gl.createBuffer(),
                indices: this.gl.createBuffer(),
            };

            const positions = [
                // Front face
                -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
              
                // Back face
                -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0,
              
                // Top face
                -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0,
              
                // Bottom face
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
              
                // Right face
                1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0,
              
                // Left face
                -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
            ];

            const faceColors = [
                [1.0, 1.0, 1.0, 1.0], // Front face: white
                [1.0, 0.0, 0.0, 1.0], // Back face: red
                [0.0, 1.0, 0.0, 1.0], // Top face: green
                [0.0, 0.0, 1.0, 1.0], // Bottom face: blue
                [1.0, 1.0, 0.0, 1.0], // Right face: yellow
                [1.0, 0.0, 1.0, 1.0], // Left face: purple
            ];

            // Convert the array of colors into a table for all the vertices.

            var colors = [];

            for (var j = 0; j < faceColors.length; ++j) {
                const c = faceColors[j];
                // Repeat each color four times for the four vertices of the face
                colors = colors.concat(c, c, c, c);
            }

            const indices = [
                0,
                1,
                2,
                0,
                2,
                3, // front
                4,
                5,
                6,
                4,
                6,
                7, // back
                8,
                9,
                10,
                8,
                10,
                11, // top
                12,
                13,
                14,
                12,
                14,
                15, // bottom
                16,
                17,
                18,
                16,
                18,
                19, // right
                20,
                21,
                22,
                20,
                22,
                23, // left
            ];

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer.positions);
            this.gl.vertexAttribPointer(this.shader.attribute.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.shader.attribute.vertexPosition);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer.colors);
            this.gl.vertexAttribPointer(this.shader.attribute.vertexColor, 4, this.gl.FLOAT, false, 0, 0);
            this.gl.enableVertexAttribArray(this.shader.attribute.vertexColor);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer.indices);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);
        }

        _loadShaderProgram() {
            const glslVersionID = this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION)
                .match(/\d.\d\d/g)[0]
                .replace(".", "");
        
            const vertexSource = `\
                #version ${glslVersionID} es
                precision highp float;
                #if __VERSION__ >= 300
                    #define attribute in
                    #define varying out
                #endif
        
                attribute vec3 vertexPosition;
                attribute vec4 vertexColor;
        
                uniform mat4 modelView;
                uniform mat4 projection;
        
                varying vec4 fragmentColor;
        
                void main() {
                    fragmentColor = vertexColor;
                    gl_Position = projection * modelView * vec4(vertexPosition, 1);
                }
            `;
        
            const fragmentSource = `\
                #version ${glslVersionID} es
                precision highp float;
                #if __VERSION__ >= 300
                    #define varying in
                    out vec4 color;
                #else
                    #define color gl_FragColor
                #endif
        
                varying vec4 fragmentColor;
        
                void main() {
                    color = fragmentColor;
                }
            `;
        
            const vertexShader = this._loadShader(this.gl.VERTEX_SHADER, vertexSource);
            const fragmentShader = this._loadShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        
            const shaderProgram = this.gl.createProgram();
            this.gl.attachShader(shaderProgram, vertexShader);
            this.gl.attachShader(shaderProgram, fragmentShader);
            this.gl.linkProgram(shaderProgram);
        
            if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
                console.error("Shader program linking error:\n" + this.gl.getProgramInfoLog(shaderProgram));
                return null;
            }
        
            return shaderProgram;
        }

        _loadShader(type, source) {
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
            if (this.gl) {
                this.t = typeof this.t === "number" ? (this.t + 0.02) % 6 : 0;
                let red = dcg.clamp(this.t < 2 ? 2 - this.t : this.t - 4, 0, 1);
                let green = dcg.clamp(this.t < 1 ? this.t : 4 - this.t, 0, 1);
                let blue = dcg.clamp(this.t < 3 ? this.t - 2 : 6 - this.t, 0, 1);
                this.gl.clearColor(red, green, blue, 1);
                this.gl.clearDepth(1.0);
                this.gl.enable(this.gl.DEPTH_TEST);
                this.gl.depthFunc(this.gl.LEQUAL);

                this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer.indices);
                this.gl.useProgram(this.shader.program);
                this.gl.uniformMatrix4fv(this.shader.uniform.modelView, false, this.grapher.controls.orientation.getModelView());
                this.gl.uniformMatrix4fv(this.shader.uniform.projection, false, this.grapher.controls.orientation.getProjection());

                this.gl.drawElements(this.gl.TRIANGLES, 36, this.gl.UNSIGNED_SHORT, 0);
            }
        }

        setBackgroundColor(color) {
            this.gl.clearColor(1, 0, 1, 1);
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
        //
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

    Grapher3DViewController: class {
        constructor(grapher, controller) {
            this.grapher = grapher;
            this.controller = controller;
            this.elt = grapher.elt;
            this.id = dcg.nextViewportControllerID();
            this.s = dcg.translator(() => this.grapher.settings.config.language);
            this.isScalingEnabled = false;
            this.mousePt = dcg.point(0, 0);
            this.lastScrollZoom = Date.now();
            this.preventScrollZoom = false;
            this.addMouseWheelEventHandler();
            this.addTouchEventHandler();
        }

        remove() {
            dcg.$(window).off(".viewportcontroller-" + this.id);
        }

        getViewport(){
            return this.grapher.getProjection().viewport
        }

        getProjection(){
            return this.grapher.getProjection()
        }

        isViewportLocked(){
            var e=this.getProjection().settings;
            return e.config.lockViewport||e.userLockedViewport
        }

        updateMouse(e){
            var t=this.elt.getBoundingClientRect();
            this.mousePt=dcg.point(e.clientX-t.left,e.clientY-t.top)
        }

        updateScaleAxis(){
            this.isMouseInViewport()&&(
                this.isMouseNearYAxis()?this.grapher.scaleAxis="y":this.isMouseNearXAxis()?this.grapher.scaleAxis="x":this.grapher.scaleAxis="both"
            ),
            this.updateCursor(),
            this.controller.requestRedrawGraph()
        }

        updateCursor(){
            this.elt.classList.toggle("dcg-scale-horizontal",this.grapher.scaleAxis==="x"),
            this.elt.classList.toggle("dcg-scale-vertical",this.grapher.scaleAxis==="y"),
            this.elt.classList.toggle("dcg-scale-both",this.grapher.scaleAxis==="both")
        }

        isMouseNearOrigin(){
            var e=this.getProjection(),
                t=e.mathToPixels.mapPoint(dcg.point(0,0));
            return Math.abs(this.mousePt.x-t.x)<50&&Math.abs(this.mousePt.y-t.y)<50
        }

        isMouseNearXAxis(){
            var e=this.getProjection(),
                t=e.pixelCoordinates,
                i=e.mathToPixels.mapY(0);
            return i=Math.min(Math.max(t.top,i),t.bottom),
                Math.abs(this.mousePt.y-i)<40&&e.settings.showXAxis
        }

        isMouseNearYAxis(){
            var e=this.getProjection(),
                t=e.pixelCoordinates,
                i=e.mathToPixels.mapX(0);
            return i=Math.min(Math.max(t.left,i),t.right),
                Math.abs(this.mousePt.x-i)<40&&e.settings.showYAxis
        }

        isMouseInViewport(){
            var e=this.getProjection(),
                t=e.mathCoordinates,
                i=e.pixelsToMath.mapPoint(this.mousePt);
            return i.x>=t.left&&i.x<=t.right&&i.y>=t.bottom&&i.y<=t.top
        }

        _setViewportWithoutCancellingAnimation(e){
            if(e.isValid(this.controller.getAxisScaleSettings())&&!e.equals(this.getViewport())){
                var i=this.getProjection();
                this.grapher._setProjection(new dcg.Projection(i.screen,e,i.settings))
            }
        }
        setViewport(e){
            this.cancelAnimation(),
            this._setViewportWithoutCancellingAnimation(e)
        }
        setScreen(e){
            var t=this.getProjection();
            let i=t.settings.squareAxes?t.viewport.squareYAxis(e,t.settings):t.viewport;
            var n=new dcg.Projection(e,i,t.settings);
            this.grapher._setProjection(n)
        }
        getTransformedViewport(e){
            let{pixelCoordinates:t,mathCoordinates:i,settings:n}=this.getProjection(),
                {xAxisScale:o,yAxisScale:s}=n,
                a=e.mapRect(t);
            var l=dcgSharedModule.xc.fromRects(i,a,{xAxisScale:o,yAxisScale:s})
                .inverse()
                .mapRect(t);
            return new dcg.Viewport(l.left,l.right,l.bottom,l.top)
        }
        transformViewport(e){
            this.setViewport(this.getTransformedViewport(e)),
            (this.grapher.scaleAxis==="x"||this.grapher.scaleAxis==="y")&&this.controller.markSquareAxesAfterUserEditedViewport()
        }
        animateToViewport(e){
            this.cancelAnimation();
            let t=this.getProjection(),
                i=t.viewport,
                n=t.mathToPixels;
            var o=0,
                s,
                a=l=>{
                    s||(s=l);
                    var c=(l-s)/500;
                    if(o+=c,o<1){
                        this.__animationTimeout=requestAnimationFrame(a);
                        let u=n.interpolateX(i.xmin,e.xmin,o),
                            p=n.interpolateX(i.xmax,e.xmax,o),
                            g=n.interpolateY(i.ymin,e.ymin,o),
                            h=n.interpolateY(i.ymax,e.ymax,o);
                        this._setViewportWithoutCancellingAnimation(new dcg.Viewport(u,p,g,h)),
                        this.grapher.debounceUserRequestedViewportChange()
                    }else
                        this.setViewport(dcg.Viewport.fromObject(e)),
                        this.grapher.debounceUserRequestedViewportChange(),
                        this.controller.markSquareAxesAfterUserEditedViewport()
                };
            this.__animationTimeout=requestAnimationFrame(a)
        }
        cancelAnimation(){
            cancelAnimationFrame(this.__animationTimeout)
        }
        addMouseWheelEventHandler(){
            var e=!1,
                t,
                i;
            dcg.$(window).on("scroll.viewportcontroller-"+this.id,function(s){
                e=!0
            }),
            dcg.$(window).on("wheel.viewportcontroller-"+this.id,function(s){
                t=s.clientX,
                i=s.clientY
            }),
            dcg.$(window).on("mousemove.viewportcontroller-"+this.id,function(s){
                if(e){
                    var a=s.clientX-t,
                        l=s.clientY-i,
                        c=a*a+l*l;
                    c<100||(e=!1)
                }
            });
            var n=0,
                o=s=>{
                    let a=s.originalEvent;
                    if(a.deltaX===0&&a.deltaY===0)
                        return;
                    var l=Date.now();
                    let c=l-this.lastScrollZoom;
                    if(this.preventScrollZoom&&c>50&&(this.preventScrollZoom=!1),
                            this.lastScrollZoom=l,
                            this.preventScrollZoom)
                        return;
                    var u=this.getProjection();
                    if(this.isViewportLocked())
                        return;
                    var p=u.mathToPixels;
                    if(e)
                        return;
                    a.preventDefault(),
                    this.updateMouse(a);
                    var g=p.mapPoint(dcg.point(0,0));
                    let b=(a.deltaY===0?-a.deltaX:-a.deltaY)>0?1:-1;
                    var C=this.isMouseNearOrigin()&&b>0?g:this.mousePt;
                    if(n>0)
                        return;
                    n+=1,
                    requestAnimationFrame(function(){
                        n--
                    });
                    let{xAxisScale:D,yAxisScale:S}=u.settings,
                        V=.0625;
                    (D==="logarithmic"||S==="logarithmic")&&c<25&&(
                        V*=Math.max(10,c)/25
                    );
                    var k=b>0?1+V:1/(1+V),
                        T=this.grapher.scaleAxis,
                        A=T==="x"||T==="both"||!T?k:1,
                        R=T==="y"||T==="both"||!T?k:1;
                    let P=Dl.scaleAtPoint(C,A,R),
                        W=this.getTransformedViewport(P);
                    b==-1&&this.tooBig(W)||b==1&&this.tooSmall(W)||(
                        this.transformViewport(P),
                        this.grapher.debounceUserRequestedViewportChange()
                    )
                };
            dcg.$(this.elt).on("wheel",o)
        }
        applyPanTouchChanges(e,t){
            if(!this.isViewportLocked()&&!this.isScalingEnabled){
                var i=dcg.point(t[0].x-e[0].x,t[0].y-e[0].y);
                this.transformViewport(Dl.translate(i)),
                this.grapher.debounceUserRequestedViewportChange()
            }
        }
        chooseDragScaleCenter(){
            var e=this.getProjection(),
                t=e.pixelCoordinates,
                i=e.mathToPixels.mapX(0),
                n=e.mathToPixels.mapY(0);
            return i=Math.min(Math.max(t.left,i),t.right),
                n=Math.min(Math.max(t.top,n),t.bottom),
                dcg.point(i,n)
        }
        applyScaleTouchChanges(e,t){
            if(this.isViewportLocked())
                return;
            var i=this.grapher.scaleAxis,
                n,
                o;
            if(e.length===2&&t.length===2)
                n=dcg.dA(e[0],e[1]),
                o=dcg.dA(t[0],t[1]);
            else if(t.length===1){
                var s=this.chooseDragScaleCenter();
                n=dcg.t3(s,e[0]),
                o=dcg.t3(s,t[0])
            }else
                return;
            var a=o.radius/n.radius,
                l=i==="y"?1:a,
                c=i==="x"?1:a,
                u=dcg.Matrix2x2.scaleAtPoint(n.center,l,c).translate(n.center,o.center);
            let p=this.getTransformedViewport(u);
            a<1&&this.tooBig(p)||a>1&&this.tooSmall(p)||(
                this.transformViewport(u),
                this.grapher.debounceUserRequestedViewportChange()
            )
        }
        addTouchEventHandler(){
            var e=[],
                t=!1,
                i=!0,
                n=!0,
                o=h=>{
                    t||this.isViewportLocked()||(
                        this.updateMouse(h),
                        this.isScalingEnabled&&this.updateScaleAxis()
                    )
                };
            dcg.$(window).on("mousemove.viewportcontroller-"+this.id,o),
            this.beginPanning=h=>{
                var b=this.getProjection();
                if(!this.isViewportLocked()&&!t&&h.touches.length===h.changedTouches.length){
                    t=!0,
                    this.grapher.isDragging=!0,
                    this.updateMouse(h);
                    var C=b.mathToPixels.mapPoint(dcg.point(0,0)),
                        D=this.grapher.scaleAxis;
                    (D==="x"||D==="both")&&(i=this.mousePt.x>C.x),
                    (D==="y"||D==="both")&&(n=this.mousePt.y>C.y),
                    this.controller.dispatch({type:"grapher/drag-start"}),
                    dcg.$(document).on("dcg-tapmove.graphdrag",p),
                    dcg.$(document).on("dcg-tapstart.graphdrag dcg-tapend.graphdrag dcg-tapcancel.graphdrag",g)
                }
            };
            var s=h=>{
                    if(!(h.length<2)){
                        var b=this.grapher.getProjection(),
                            C=b.pixelCoordinates,
                            D=b.mathToPixels.mapX(0),
                            S=b.mathToPixels.mapY(0),
                            V=40;
                        D=Math.min(Math.max(C.left,D),C.right),
                        S=Math.min(Math.max(C.top,S),C.bottom);
                        var k=h[1].x-h[0].x,
                            T=h[1].y-h[0].y;
                        return Math.abs(h[0].x-D)<V&&Math.abs(h[1].x-D)<V&&Math.abs(T)>3*Math.abs(k)&&b.settings.showYAxis?"y"
                            :Math.abs(h[0].y-S)<V&&Math.abs(h[1].y-S)<V&&Math.abs(k)>3*Math.abs(T)&&b.settings.showXAxis?"x"
                            :"both"
                    }
                },
                a=h=>(
                    this.grapher.scaleAxis||(
                        this.grapher.scaleAxis=s(h)
                    ),
                    this.grapher.scaleAxis
                ),
                l=()=>{
                    this.grapher.scaleAxis&&(
                        this.grapher.scaleAxis=void 0,
                        this.controller.requestRedrawGraph(),
                        this.updateCursor()
                    )
                },
                c=()=>{
                    this.isScalingEnabled=!1,
                    this.preventScrollZoom=!0,
                    l()
                },
                u=h=>h.altKey||h.ctrlKey||h.metaKey,
                p=h=>{
                    if(t&&!this.isViewportLocked()){
                        var b=dcg.r3(h.touches,dcg.Ul(this.elt));
                        if(e.length===2&&b.length===2)
                            a(b),
                            this.applyScaleTouchChanges(e,b);
                        else if(e.length===1&&this.isScalingEnabled){
                            this.updateMouse(h);
                            var C=this.grapher.scaleAxis,
                                D=this.getProjection(),
                                S=D.mathToPixels.mapPoint(dcg.point(0,0)),
                                V,
                                k,
                                T=5,
                                A=i?1:-1,
                                R=n?1:-1;
                            if((C==="x"||C==="both")&&(V=this.mousePt.x>S.x+T*A),
                                    (C==="y"||C==="both")&&(k=this.mousePt.y>S.y+T*R),
                                    C==="x"&&i!==V||C==="y"&&n!==k||C==="both"&&i!==V&&n!==k)
                                return;
                            this.applyScaleTouchChanges(e,b)
                        }else
                            l();
                        e.length===1&&this.applyPanTouchChanges(e,b),
                        this.controller.dispatch({type:"grapher/drag-move"}),
                        e=b
                    }
                },
                g=h=>{
                    t&&(
                        this.cancelAnimation(),
                        e=dcg.r3(h.touches,dcg.Ul(this.elt)),
                        h.touches.length===0&&(
                            t=!1,
                            this.grapher.isDragging=!1,
                            dcg.$(document).off(".graphdrag"),
                            this.grapher.debounceUserRequestedViewportChange(),
                            this.controller.dispatch({type:"grapher/drag-end"})
                        ),
                        (h.touches.length===0||h.touches.length===1&&!this.isScalingEnabled)&&l()
                    )
                };
            dcg.$(window).on("keydown.viewportcontroller-"+this.id,h=>{
                this.controller.isGeoToolActive()||this.isViewportLocked()||(dcg.Re(h)===pb&&!u(h)&&this.shouldAllowShiftScaling()?(
                    this.isScalingEnabled=!0,
                    this.grapher.scaleAxis||this.updateScaleAxis()
                ):c())
            }),
            dcg.$(window).on("keyup.viewportcontroller-"+this.id+" blur.viewportcontroller-"+this.id,c)
        }
        shouldAllowShiftScaling(){
            return!this.controller.isGeometry()
        }
        zoom(e){
            var t=this.getProjection().pixelCoordinates;
            if(e==="in"){
                let n=this.getTransformedViewport(dcg.Matrix2x2.scaleAtPoint(dcg.projectionCenter(t),2));
                this.tooSmall(n)||this.animateToViewport(n),
                xe(this.s("graphing-calculator-narration-viewport-zoom-in"))
            }else if(e==="out"){
                let n=this.getTransformedViewport(dcg.Matrix2x2.scaleAtPoint(dcg.projectionCenter(t),.5));
                this.tooBig(n)||this.animateToViewport(n),
                xe(this.s("graphing-calculator-narration-viewport-zoom-out"))
            }else if(e==="square"){
                var i=this.getSquareViewport();
                this.getProjection().settings.setProperty("squareAxes",!0),
                this.animateToViewport(i),
                xe(this.s("graphing-calculator-narration-viewport-zoom-square"))
            }else
                e==="default"&&this.setDefaultViewport()
        }
        tooBig(e){
            let t=this.getProjection(),
                {xAxisScale:i,yAxisScale:n}=t.settings,
                {xmin:o,xmax:s,ymin:a,ymax:l}=e;
            return i==="logarithmic"&&dcg.pE(s)-dcg.pE(o)>60||n==="logarithmic"&&dcg.pE(l)-dcg.pE(a)>60||this.controller.isGeometry()&&s-o>1e5
        }
        tooSmall(e){
            let{xmin:t,xmax:i}=e;
            return this.controller.isGeometry()&&i-t<1e-4
        }
        zoomSquareImmediately(){
            this.setViewport(this.getSquareViewport())
        }
        zoomCustom(e){
            this.animateToViewport(e),
            dcg.xe(this.s("graphing-calculator-narration-viewport-updated"))
        }
        setDefaultViewport(){
            let e=this.controller.getDefaultViewport();
            this.animateToViewport(e),
            dcg.xe(this.s("graphing-calculator-narration-viewport-default"))
        }
        isDefaultViewportRestored(){
            let e=this.getProjection(),
                {xAxisScale:t,yAxisScale:i}=e.settings,
                n=t==="linear",
                o=i==="linear",
                s=e.viewport,
                a=this.controller.getDefaultViewport(),
                l=n?s.xmax-s.xmin:Math.log(s.xmax/s.xmin),
                c=o?s.ymax-s.ymin:Math.log(s.ymax/s.ymin),
                u=n?s.xmin-a.xmin:Math.log(s.xmin/a.xmin),
                p=n?s.xmax-a.xmax:Math.log(s.xmax/a.xmax),
                g=o?s.ymin-a.ymin:Math.log(s.ymin/a.ymin),
                h=o?s.ymax-a.ymax:Math.log(s.ymax/a.ymax),
                b=.025;
            return Math.abs(u/l)<b&&Math.abs(p/l)<b&&Math.abs(g/c)<b&&Math.abs(h/c)<b
        }
        getSquareViewport(){
            let e=this.getProjection();
            return e.settings.lastChangedAxis==="y"?e.viewport.squareXAxis(e.screen,e.settings):e.viewport.squareYAxis(e.screen,e.settings)
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
            this._redrawGridLayer();
        }

        _redrawGridLayer() {
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
            if (branches[0].graphMode !== dcg.GraphMode.UNKNOWN_15) {
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
