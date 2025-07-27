/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Project:     ifc2geojson [IFC (BIM) to GeoJSON (GIS) converter]
 * Author:      Abdoulaye Diakite (abdou@citygeometrix.com)
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as WebIFC from "web-ifc";
import * as THREE from "three";
import { IfcThree } from './ifc2scene';
// Adapted from https://github.com/prolincur/three-geojson-exporter for 3D support
class GeoJsonExporter {
    constructor() {
        this.transformCallback = (p) => [p.x, p.y, p.z];
        this.projection = "EPSG:3857";
        this.precision = 8;
    }
    setProjection(p) {
        this.projection = p;
        return this;
    }
    setPrecision(p) {
        this.precision = p;
        return this;
    }
    setTransformCallback(fn) {
        if (typeof fn === "function") {
            this.transformCallback = fn;
        }
        return this;
    }
    parse(root) {
        if (!root)
            return null;
        const exporter = this;
        function toCoords(v) {
            const [x, y, z] = exporter.transformCallback(v);
            return [
                parseFloat(x.toFixed(exporter.precision)),
                parseFloat(y.toFixed(exporter.precision)),
                parseFloat(z.toFixed(exporter.precision))
            ];
        }
        function extractMesh(obj) {
            const geometry = obj.geometry;
            const pos = geometry.attributes.position;
            const index = geometry.index;
            if (!pos)
                return [];
            obj.updateMatrix();
            const matrix = obj.matrixWorld.clone();
            const polygons = [];
            if (index) {
                for (let i = 0; i < index.count; i += 3) {
                    const a = index.getX(i);
                    const b = index.getX(i + 1);
                    const c = index.getX(i + 2);
                    const va = toCoords(new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(matrix));
                    const vb = toCoords(new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(matrix));
                    const vc = toCoords(new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(matrix));
                    polygons.push([va, vb, vc, va]);
                }
            }
            else {
                for (let i = 0; i < pos.count; i += 3) {
                    const va = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix));
                    const vb = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(matrix));
                    const vc = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i + 2).applyMatrix4(matrix));
                    polygons.push([va, vb, vc, va]);
                }
            }
            return [{
                    type: "Feature",
                    properties: obj.userData,
                    geometry: polygons.length > 1 ? {
                        type: "MultiPolygon",
                        coordinates: polygons.map(polygon => [polygon])
                    } : {
                        type: "Polygon",
                        coordinates: [polygons[0]]
                    }
                }];
        }
        function recurse(obj) {
            const features = [];
            if (obj instanceof THREE.Mesh) {
                features.push(...extractMesh(obj));
            }
            else if (obj instanceof THREE.Group || obj instanceof THREE.Scene || obj instanceof THREE.Object3D) {
                obj.updateMatrix();
                for (const child of obj.children) {
                    const childFeatures = recurse(child);
                    if (childFeatures)
                        features.push(...childFeatures);
                }
            }
            return features;
        }
        const features = recurse(root);
        if (!features || !features.length)
            return null;
        return {
            type: "FeatureCollection",
            features
        };
    }
}
const SI_PREFIXES = {
    EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6,
    KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2,
    MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9
};
const LENGTH_UNITS = {
    METRE: 1,
    FOOT: 0.3048,
    INCH: 0.0254
};
function getUnitScale(ifcApi, modelID) {
    var _a, _b, _c, _d, _e;
    try {
        const projectID = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT).get(0);
        const project = ifcApi.GetLine(modelID, projectID);
        const units = (_a = ifcApi.GetLine(modelID, project.UnitsInContext.value)) === null || _a === void 0 ? void 0 : _a.Units;
        for (const unitRef of units) {
            const unit = ifcApi.GetLine(modelID, unitRef.value);
            // console.log("Found unit:", unit);
            if (((_b = unit.UnitType) === null || _b === void 0 ? void 0 : _b.value) === "LENGTHUNIT") {
                const baseName = ((_c = unit === null || unit === void 0 ? void 0 : unit.Name) === null || _c === void 0 ? void 0 : _c.value) || "METRE";
                const base = LENGTH_UNITS[baseName];
                const prefixName = (_d = unit === null || unit === void 0 ? void 0 : unit.Prefix) === null || _d === void 0 ? void 0 : _d.value;
                const factor = prefixName ? ((_e = SI_PREFIXES[prefixName]) !== null && _e !== void 0 ? _e : 1) : 1;
                // console.log(`Detected LENGTHUNIT: ${prefixName || ""} ${baseName || ""}`);
                // console.log(`base=${base}, prefix=${factor}, total=${base * factor}`);
                return base * factor;
            }
        }
    }
    catch (err) {
        console.warn("⚠️ Failed to detect unit scale. Defaulting to 1 (meters).", err);
        return 1;
    }
    console.warn("⚠️ No LENGTHUNIT found. Defaulting to 1 (meters).");
    return 1;
}
function getIfcMapConversionMatrix(ifcApi, modelID) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const mapConvIds = yield ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION);
        // console.log("mapConvIds size:", mapConvIds.size());
        if (mapConvIds.size() === 0)
            return new THREE.Matrix4();
        const mapConv = yield ifcApi.GetLine(modelID, mapConvIds.get(0));
        // console.log("mapConv:", mapConv);
        if (!mapConv)
            return new THREE.Matrix4();
        const eastings = ((_a = mapConv.Eastings) === null || _a === void 0 ? void 0 : _a.value) || 0;
        const northings = ((_b = mapConv.Northings) === null || _b === void 0 ? void 0 : _b.value) || 0;
        const orthoHeight = ((_c = mapConv.OrthogonalHeight) === null || _c === void 0 ? void 0 : _c.value) || 0;
        // console.log("eastings:", eastings, "; northings:", northings);
        const xAxisX = ((_d = mapConv.XAxisAbscissa) === null || _d === void 0 ? void 0 : _d.value) || 1;
        const xAxisY = ((_e = mapConv.XAxisOrdinate) === null || _e === void 0 ? void 0 : _e.value) || 0;
        const scale = ((_f = mapConv.Scale) === null || _f === void 0 ? void 0 : _f.value) || 1;
        const xAxis = new THREE.Vector3(xAxisX, xAxisY, 0).normalize();
        const zAxis = new THREE.Vector3(0, 0, 1);
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
        // Get unit scale
        let unitScale = getUnitScale(ifcApi, modelID);
        // console.log("unitScale:", unitScale);
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(xAxis, yAxis, zAxis);
        matrix.setPosition(new THREE.Vector3(eastings * unitScale, northings * unitScale, orthoHeight * unitScale));
        matrix.scale(new THREE.Vector3(scale, scale, scale));
        return matrix;
    });
}
export function ifc2Geojson(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", msgCallback = () => { }) {
        const ifcApi = new WebIFC.IfcAPI();
        yield ifcApi.Init();
        const modelID = ifcApi.OpenModel(ifcData);
        msgCallback("Loading geometries...");
        const scene = new THREE.Scene();
        const model = new IfcThree(ifcApi);
        model.LoadAllGeometry(scene, modelID);
        // IfcMapConversion related transformation
        const mapMatrix = yield getIfcMapConversionMatrix(ifcApi, modelID);
        // flip Y <-> Z (in GIS, Z is up)
        const flipMatrix = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
        const finalMatrix = new THREE.Matrix4().multiplyMatrices(mapMatrix, flipMatrix);
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
                child.updateMatrix();
                child.geometry.applyMatrix4(finalMatrix);
                // child.geometry.computeVertexNormals();
            }
        });
        msgCallback("Converting to GeoJSON...");
        const exporter = new GeoJsonExporter();
        const geojson = exporter.parse(scene);
        const geojsonWithCRS = Object.assign(Object.assign({}, geojson), { crs: {
                type: "name",
                properties: {
                    name: crs
                }
            } });
        ifcApi.CloseModel(modelID);
        return geojsonWithCRS;
    });
}
export function ifc2GeojsonBlob(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", msgCallback = () => { }) {
        const geojsonWithCRS = yield ifc2Geojson(ifcData, crs, msgCallback);
        const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
            type: "application/json"
        });
        return blob;
    });
}
export function getGeoPackagePropertiesFromGeoJSON(geojson) {
    const typeMap = {
        string: "TEXT",
        number: "REAL",
        boolean: "BOOLEAN",
    };
    const seenProps = new Map();
    for (const feature of geojson.features) {
        const props = feature.properties || {};
        for (const key of Object.keys(props)) {
            const value = props[key];
            const jsType = typeof value;
            if (!seenProps.has(key)) {
                const dataType = typeMap[jsType] || "TEXT"; // default fallback
                seenProps.set(key, dataType);
            }
        }
    }
    const tabProperties = Array.from(seenProps.entries()).map(([name, dataType]) => ({
        name,
        dataType,
    }));
    return tabProperties;
}
