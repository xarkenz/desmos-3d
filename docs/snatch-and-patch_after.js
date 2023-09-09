dcg.$ = Desmos.$;
dcg.View = Desmos.Private.Fragile.DCGView;
dcg.MathTools = Desmos.Private.Mathtools;
dcg.GraphTools = Desmos.Private.Graphtools;
dcg.GraphingCalculator = Desmos.GraphingCalculator.prototype.constructor;
dcg.AbstractGraphingCalculator = Object.getPrototypeOf(dcg.GraphingCalculator);
dcg.Grapher2D = Calc.controller.grapher2d.constructor;
dcg.Projection = Calc.controller.grapher2d.getProjection().constructor;
dcg.Viewport = Calc.controller.grapher2d.getProjection().viewport.constructor;
dcg.ScreenSize = Calc.controller.grapher2d.getProjection().screen.constructor;

// Override the _clear method on grapher2d to tweak some logic
dcg.Grapher2D.prototype._clear = function() {
    let { width, height } = this.getProjection().screen;
    this.canvasLayer.resize(width, height);

    if (!this.canvasLayer.ctx) {
        return;
    }
    this.canvasLayer.ctx.clearRect(0, 0, width, height);

    let { plane3dOpacity, showPlane3D } = this.controller.getGraphSettings();
    if (this.controller.isThreeDMode() && showPlane3D && !this.controller.getInvertedColors()) {
        let opacity = Number(plane3dOpacity);
        if (plane3dOpacity === "" || isNaN(opacity)) {
            opacity = 0.5;
        } else {
            opacity = Math.min(1, opacity);
        }
        if (opacity > 0) {
            // not sure whether to keep the change to the plane color... originally white
            this.canvasLayer.ctx.fillStyle = `rgba(230,230,230,${opacity})`;
            this.canvasLayer.ctx.fillRect(0, 0, width, height);
        }
    }
};

// Override window.fetch in order to prevent any network requests with absolute path
// (these would fail due to CORS anyway)
window.__temp_fetch = window.fetch;
window.fetch = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("/")) {
        let message = `Blocked attempt to access absolute path '${args[0]}'`;
        console.warn(message);
        return Promise.reject(new Error(message));
    }

    return window.__temp_fetch(...args);
};
