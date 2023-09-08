dcg.$ = Desmos.$;
dcg.View = Desmos.Private.Fragile.DCGView;
dcg.MathTools = Desmos.Private.Mathtools;
dcg.GraphTools = Desmos.Private.Graphtools;
dcg.GraphingCalculator = Desmos.GraphingCalculator.prototype.constructor;
dcg.AbstractGraphingCalculator = Object.getPrototypeOf(dcg.GraphingCalculator);

dcg.Projection = Calc.controller.grapher2d.getProjection().constructor;
dcg.Viewport = Calc.controller.grapher2d.getProjection().viewport.constructor;
dcg.ScreenSize = Calc.controller.grapher2d.getProjection().screen.constructor;
dcg.defaultState = dcg.assignEnumerable(
    dcg.assignEnumerable(
        {},
        {
            showGrid: true,
            showXAxis: true,
            showYAxis: true,
            xAxisStep: 0,
            yAxisStep: 0,
            xAxisScale: "linear",
            yAxisScale: "linear",
            xAxisMinorSubdivisions: 0,
            yAxisMinorSubdivisions: 0,
            xAxisArrowMode: "NONE",
            yAxisArrowMode: "NONE",
            xAxisLabel: "",
            yAxisLabel: "",
            xAxisNumbers: true,
            yAxisNumbers: true,
            polarMode: false,
            polarNumbers: true,
            degreeMode: false,
            randomSeed: "",
            restrictGridToFirstQuadrant: false,
            userLockedViewport: false,
        },
    ),
    dcg.copyProperties(
        dcg.assignEnumerable(
            dcg.assignEnumerable(
                {},
                {
                    threeDMode: true,
                    worldRotation3D: [],
                    axis3D: [0, 0, 1],
                    speed3D: 0,
                    showPlane3D: true,
                    plane3dOpacity: "",
                    backgroundColor3d: "#FFF",
                    showAxis3D: true,
                    showAxisLabels3D: true,
                    showBox3D: true,
                },
            ),
            { squareAxes: true },
        ),
        { product: "graphing" },
    ),
);

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
