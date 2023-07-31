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
                            this.gl = this.canvasNode.getContext("webgl");
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
        getDevicePixelRatio() {
            return window.devicePixelRatio || 1;
        }
        resize(width, height, pixelRatio) {
            pixelRatio ||= this.getDevicePixelRatio();
            if (width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio) {
                this.width = width;
                this.height = height;
                this.canvasNode.style.width = width + "px";
                this.canvasNode.style.height = height + "px";
                this.canvasNode.setAttribute("width", width * pixelRatio);
                this.canvasNode.setAttribute("height", height * pixelRatio);
                this.pixelRatio = pixelRatio;
                this.gl = this.canvasNode.getContext("webgl");
                this.update();
            }
        }
        setBackgroundColor(color) {
            this.gl.clearColor(1, 0, 1, 1);
            this.update();
        }
        showBox(show) {
        }
        showAxes(show) {
        }
        showPlane(show) {
        }
        update() {
            if (this.gl) {
                this.t = typeof this.t === "number" ? (this.t + 0.02) % 6 : 0;
                let red = dcg.clamp(this.t < 2 ? 2 - this.t : this.t - 4, 0, 1);
                let green = dcg.clamp(this.t < 1 ? this.t : 4 - this.t, 0, 1);
                let blue = dcg.clamp(this.t < 3 ? this.t - 2 : 6 - this.t, 0, 1);
                this.gl.clearColor(red, green, blue, 1);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
            }
        }
        updateAxes() {
        }
        updatePlaneMap() {
        }
    },

    Grapher3DControls: class {
        constructor() {
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
            this.controls = new DesmosCustom.Grapher3DControls;
            this.webglLayer = dcg.View.mountToNode(DesmosCustom.WebGLLayer, this.elt, { grapher: () => this });
            this.elt.appendChild(this.webglLayer.rootNode);
            this.__sketchOrder = [];
            this.__redrawRequested = false;
            this.__isRedrawingSlowly = false;
            this.events = undefined; // new Wr
            this.viewportController = this.planeGrapher.viewportController;
        }
        get planeGrapher() {
            return this.controller.grapher2d;
        }
        get gl() {
            return this.webglLayer.gl;
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
        _clear() {
            let {width, height} = this.getProjection().screen;
            this.webglLayer.resize(width, height);
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
