const dcg = {
    MODULE_SOURCE: null,
    MODULE: null,

    GraphMode: {
        CURVE_X_BASED: 1,
        CURVE_Y_BASED: 2,
        POINT: 3,
        POINT_DRAGGABLE: 4,
        CURVE_PARAMETRIC: 5,
        CURVE_POLAR: 6,
        POLYGON_INTERIOR: 7,
        CURVE_IMPLICIT: 8,
        ERROR_10: 10,
        ERROR_15: 15,
        SEGMENT: 17,
        LINE: 18,
        RAY: 19,
        CIRCLE: 20,
        ARC: 21,
        ANGLE_LABEL: 22,
        ANGLE: 23,
        VECTOR: 24,
        CURVE_3D_PARAMETRIC: 100,
        CURVE_3D_PARAMETRIC_POLAR_CYLINDRICAL: 101,
        CURVE_3D_PARAMETRIC_POLAR_SPHERICAL: 102,
        SURFACE_PARAMETRIC: 103,
        SURFACE_PARAMETRIC_POLAR_CYLINDRICAL: 104,
        SURFACE_PARAMETRIC_POLAR_SPHERICAL: 105,
        SURFACE_Z_BASED: 106,
        SURFACE_X_BASED: 107,
        SURFACE_Y_BASED: 108,
        SURFACE_Z_BASED_POLAR: 109,
        SURFACE_POLAR_CYLINDRICAL: 110,
        SURFACE_POLAR_SPHERICAL: 111,
        SURFACE_IMPLICIT: 112,
        POINT_3D: 113,
        POINT_3D_POLAR_CYLINDRICAL: 114,
        POINT_3D_POLAR_SPHERICAL: 115,
        TRIANGLE_3D: 116,
        SPHERE: 117,
        SEGMENT_3D: 118,
        SURFACE_X_BASED_Y_ONLY: 119,
        SURFACE_Y_BASED_X_ONLY: 120,
        SURFACE_CONSTANT_X: 121,
        SURFACE_CONSTANT_Y: 122,
        SURFACE_POLAR_CYLINDRICAL_AMBIGUOUS: 123,
        SURFACE_POLAR_SPHERICAL_AMBIGUOUS: 124,
        SURFACE_IMPLICIT_AMBIGUOUS: 125,
        CURVE_3D_PLANAR_GRAPH: 126,
        VECTOR_3D: 127,
    },
};

dcg.defaultScreenSize = () => new dcg.ScreenSize(1024, 768);
dcg.defaultViewport = ({ xAxisScale, yAxisScale }) => new dcg.Viewport(
    ...(xAxisScale === "linear" ? [-10, 10] : [10e-3, 10e+3]),
    ...(yAxisScale === "linear" ? [-10, 10] : [10e-3, 10e+3]),
    -10, 10,
);
dcg.processElement = (element) => {
    if (!element) {
        return;
    }
    let rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
    };
};
dcg.processTouches = (touches, element) => touches.map((touch) => ({
    x: touch.pageX - element.left,
    y: touch.pageY - element.top,
}));

dcg.isEqual = (a, b, aValues, bValues) => {
    if (a === b) {
        return a !== 0 || 1 / a === 1 / b;
    }
    if (a == null || b == null) {
        return false;
    }
    if (a !== a) {
        return b !== b;
    }
    return typeof a !== "function" && typeof a !== "object" && typeof b !== "object" ? false : dcg._isEqual(a, b, aValues, bValues);
};
dcg._isEqual = (a, b, aValues, bValues) => {
    if ("_wrapped" in a) {
        a = a._wrapped;
    }
    if ("_wrapped" in b) {
        b = b._wrapped;
    }
    let str = Object.prototype.toString.call(a);
    if (str !== Object.prototype.toString.call(b)) {
        return false;
    }
    switch (str) {
        case "[object RegExp]":
        case "[object String]":
            return "" + a == "" + b;
        case "[object Number]":
            return +a != +a ? +b != +b : +a == 0 ? 1 / +a === 1 / +b : +a == +b;
        case "[object Date]":
        case "[object Boolean]":
            return +a == +b;
        case "[object Symbol]":
            return Symbol.prototype.valueOf.call(a) === Symbol.prototype.valueOf.call(b);
    }
    let isArray = str === "[object Array]";
    if (!isArray) {
        if (typeof a !== "object" || typeof b !== "object") {
            return false;
        }
        if (a.constructor !== b.constructor && !(Object.prototype.toString.call(a.constructor) === "[object Function]" && a.constructor instanceof a.constructor && Object.prototype.toString.call(b.constructor) === "[object Function]" && b.constructor instanceof b.constructor) && "constructor" in a && "constructor" in b) {
            return false;
        }
    }
    aValues ||= [];
    bValues ||= [];
    for (let i = aValues.length; i--;) {
        if (aValues[i] === a) {
            return bValues[i] === b;
        }
    }
    aValues.push(a);
    bValues.push(b);
    if (isArray) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = a.length; i--;) {
            if (!dcg.isEqual(a[i], b[i], aValues, bValues)) {
                return false;
            }
        }
    } else {
        let keys = dcg.keys(a);
        if (keys.length !== dcg.keys(b).length) {
            return false;
        }
        for (let i = keys.length; i--;) {
            let key = keys[i];
            if (!(Object.prototype.hasOwnProperty.call(b, key) && dcg.isEqual(a[key], b[key], aValues, bValues))) {
                return false;
            }
        }
    }
    aValues.pop();
    bValues.pop();
    return true;
};
dcg.keys = (obj) => {
    if (!(typeof obj === "function" || (typeof obj === "object" && obj))) {
        return [];
    }
    return Object.keys(obj);
};
dcg.toJSON = (value) => {
    if (value && typeof value.toJSON == "function") {
        value = value.toJSON();
    }
    if (!value || typeof value != "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(dcg.toJSON);
    }
    let obj = {};
    for (let key in obj) {
        if (value.hasOwnProperty(prop)) {
            obj[key] = dcg.toJSON(value[key]);
        }
    }
    return obj;
};
dcg.assigned = (to, from) => {
    from ||= {};
    let merged = {};
    for (let key in to) {
        if (to.hasOwnProperty(key) && !from.hasOwnProperty(key)) {
            merged[key] = dcg.toJSON(to[key]);
        }
    }
    for (let key in from) {
        if (from.hasOwnProperty(key)) {
            merged[key] = from[key];
        }
    }
    return merged;
};
dcg.stripDefaults = (defaults, obj) => {
    let nonDefaults = {};
    for (let key in obj) {
        if (obj.hasOwnProperty(key) && !dcg.isEqual(defaults[key], obj[key])) {
            nonDefaults[key] = obj[key];
        }
    }
    return nonDefaults;
};
dcg.assignEnumerable = (to, from) => {
    from ||= {};
    for (let key in from) {
        if (Object.prototype.hasOwnProperty.call(from, key)) {
            dcg.setEnumerable(to, key, from[key]);
        }
    }
    if (Object.getOwnPropertySymbols) {
        for (let symbol of Object.getOwnPropertySymbols(from)) {
            if (Object.prototype.propertyIsEnumerable.call(from, symbol)) {
                dcg.setEnumerable(to, symbol, from[symbol]);
            }
        }
    }
    return to;
};
dcg.copyProperties = (to, from) => Object.defineProperties(to, Object.getOwnPropertyDescriptors(from));
dcg.setEnumerable = (obj, key, value) => {
    if (key in obj) {
        Object.defineProperty(obj, key, { enumerable: true, configurable: true, writable: true, value });
    } else {
        obj[key] = value;
    }
    return value;
};

dcg.defaultState3D = dcg.assignEnumerable(
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
                    backgroundColor3d: "#ffffff",
                    showAxis3D: true,
                    showAxisLabels3D: true,
                    showNumbers3D: true,
                    showBox3D: true,
                },
            ),
            { squareAxes: true },
        ),
        { product: "graphing-3d" },
    ),
);

// Temporarily override window.eval in order to:
// - snatch the Desmos shared module when the calculator_desktop script loads
// - patch one of the shared module functions (equivalent to dcg.copyProperties)
//   to convert a second argument of { product: "graphing" } to { product: "graphing-3d" }
//   (this is a crucial step in enabling 3D mode... I couldn't find a better way to do it)
window.__temp_eval = window.eval;
window.eval = (source) => {
    const rawModule = window.__temp_eval(dcg.MODULE_SOURCE = source);
    dcg.MODULE = {};
    for (let [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(rawModule))) {
        let value = descriptor.get();
        if (typeof value === "function" && value.length === 2 && value.toString().length <= 20) {
            Object.defineProperty(dcg.MODULE, name, { configurable: true, get: () => (arg1, arg2) => {
                if (arg2 && typeof arg2 === "object" && arg2.product === "graphing") {
                    arg2.product = "graphing-3d";
                }
                return value(arg1, arg2);
            } });
        } else {
            Object.defineProperty(dcg.MODULE, name, descriptor);
        }
    }

    window.eval = window.__temp_eval;
    delete window.__temp_eval;
    return dcg.MODULE;
};
