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
        this.projection = "EPSG:3857";
        this.precision = 8;
        this.georefOffset = new THREE.Vector3(0, 0, 0);
        this.transformCallback = (p) => [p.x, p.y, p.z];
    }
    setProjection(p) {
        this.projection = p;
        return this;
    }
    setPrecision(p) {
        this.precision = p;
        return this;
    }
    setGeorefOffset(offset) {
        this.georefOffset.copy(offset);
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
            // Add georef offset to local vertex
            const geoV = new THREE.Vector3().copy(v).add(exporter.georefOffset);
            const [x, y, z] = exporter.transformCallback(geoV);
            // 
            return [x, y, z];
        }
        function extractMesh(obj) {
            const geometry = obj.geometry;
            const pos = geometry.attributes.position;
            const index = geometry.index;
            if (!pos)
                return [];
            obj.updateMatrixWorld();
            const polygons = [];
            if (index) {
                for (let i = 0; i < index.count; i += 3) {
                    const a = index.getX(i);
                    const b = index.getX(i + 1);
                    const c = index.getX(i + 2);
                    const va = toCoords(new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(obj.matrixWorld));
                    const vb = toCoords(new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(obj.matrixWorld));
                    const vc = toCoords(new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(obj.matrixWorld));
                    polygons.push([va, vb, vc, va]);
                }
            }
            else {
                for (let i = 0; i < pos.count; i += 3) {
                    const va = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld));
                    const vb = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(obj.matrixWorld));
                    const vc = toCoords(new THREE.Vector3().fromBufferAttribute(pos, i + 2).applyMatrix4(obj.matrixWorld));
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
                obj.updateMatrixWorld();
                for (const child of obj.children) {
                    features.push(...recurse(child));
                }
            }
            return features;
        }
        const features = recurse(root);
        if (!features.length)
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
    METRE: 1.0,
    FOOT: 0.3048,
    INCH: 0.0254
};
/**
 * Computes the conversion factor for length units defined in the IFC model.
 * Defaults to 1 (meter) if no unit or unknown unit is found.
 */
function getUnitScale(ifcAPI, modelID) {
    var _a, _b, _c, _d, _e;
    try {
        const projectID = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT).get(0);
        const project = ifcAPI.GetLine(modelID, projectID);
        const units = (_a = ifcAPI.GetLine(modelID, project.UnitsInContext.value)) === null || _a === void 0 ? void 0 : _a.Units;
        for (const unitRef of units) {
            const unit = ifcAPI.GetLine(modelID, unitRef.value);
            // console.log("Found unit:", unit);
            if (((_b = unit.UnitType) === null || _b === void 0 ? void 0 : _b.value) === "LENGTHUNIT") {
                const baseName = ((_c = unit === null || unit === void 0 ? void 0 : unit.Name) === null || _c === void 0 ? void 0 : _c.value) || "METRE";
                const base = LENGTH_UNITS[baseName];
                const prefixName = (_d = unit === null || unit === void 0 ? void 0 : unit.Prefix) === null || _d === void 0 ? void 0 : _d.value;
                const factor = prefixName ? ((_e = SI_PREFIXES[prefixName]) !== null && _e !== void 0 ? _e : 1) : 1.0;
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
export function getElemsWithGeom(ifcData) {
    return __awaiter(this, void 0, void 0, function* () {
        const elemsWithGeom = [];
        const ifcAPI = new WebIFC.IfcAPI();
        yield ifcAPI.Init();
        const modelID = ifcAPI.OpenModel(ifcData);
        // Get all types available in the model
        const allTypes = ifcAPI.GetAllTypesOfModel(modelID);
        for (let i = 0; i < allTypes.length; i++) {
            const type = allTypes[i];
            // Only consider IFC elements that can have geometry
            if (ifcAPI.IsIfcElement(type.typeID)) {
                // Get all items of this type
                const items = ifcAPI.GetLineIDsWithType(modelID, type.typeID);
                for (let j = 0; j < items.size(); j++) {
                    const lineID = items.get(j);
                    const line = ifcAPI.GetLine(modelID, lineID);
                    if (line.Representation) {
                        elemsWithGeom.push(type.typeName);
                        break;
                    }
                }
            }
        }
        ifcAPI.CloseModel(modelID);
        return elemsWithGeom;
    });
}
/**
 * Computes a transformation matrix from the IFC IfcMapConversion entity,
 * incorporating translation, orientation, scaling, and unit conversion.
 */
function getIfcMapConversionMatrix(ifcAPI, modelID) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const resMatrix = new THREE.Matrix4();
        const mapConvIds = yield ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION);
        // Fallback: no IfcMapConversion → scale only from UnitsInContext (to meters)
        if (mapConvIds.size() === 0) {
            const s = getUnitScale(ifcAPI, modelID); // e.g. mm→0.001, dm→0.1, m→1
            return resMatrix.makeScale(s, s, s);
        }
        // IfcMapConversion present → use ONLY its rotation/scale/translation (map units)
        const mapConv = yield ifcAPI.GetLine(modelID, mapConvIds.get(0));
        if (!mapConv) {
            const s = getUnitScale(ifcAPI, modelID);
            return resMatrix.makeScale(s, s, s);
        }
        const east = (_b = (_a = mapConv.Eastings) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0;
        const north = (_d = (_c = mapConv.Northings) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : 0;
        const height = (_f = (_e = mapConv.OrthogonalHeight) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : 0;
        const s = (_h = (_g = mapConv.Scale) === null || _g === void 0 ? void 0 : _g.value) !== null && _h !== void 0 ? _h : 1;
        const ax = (_k = (_j = mapConv.XAxisAbscissa) === null || _j === void 0 ? void 0 : _j.value) !== null && _k !== void 0 ? _k : 1;
        const ay = (_m = (_l = mapConv.XAxisOrdinate) === null || _l === void 0 ? void 0 : _l.value) !== null && _m !== void 0 ? _m : 0;
        const xAxis = new THREE.Vector3(ax, ay, 0).normalize();
        const zAxis = new THREE.Vector3(0, 0, 1);
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
        // Orientation → Scale (local→map) → Translation (in map units)
        resMatrix.makeBasis(xAxis, yAxis, zAxis);
        resMatrix.scale(new THREE.Vector3(s, s, s));
        resMatrix.setPosition(new THREE.Vector3(east, north, height));
        return resMatrix;
    });
}
// Flips the Y and Z coordinates (because Y-up is default for THREE)
// And apply any transformation from IfcMapConversion (from IFC4)
// While trying to preserve the coordinate precision as much as possible
// by using Float64Array and applying transformation at export with georefOffset
function transformScene(ifcAPI, modelID, scene) {
    return __awaiter(this, void 0, void 0, function* () {
        // Step 1: build map conversion matrix (from IFC georef info)
        const mapMatrix = yield getIfcMapConversionMatrix(ifcAPI, modelID);
        // Step 2: Y-Z flip (your intention)
        const flipMatrix = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
        // Step 3: combine (flip after map conversion)
        const finalMatrix = new THREE.Matrix4()
            .multiplyMatrices(mapMatrix, flipMatrix);
        // Step 4: extract large translation part (eastings, northings, orthoHeight)
        const translation = new THREE.Vector3();
        finalMatrix.decompose(translation, new THREE.Quaternion(), new THREE.Vector3());
        // Store this separately as "georef offset"
        const georefOffset = translation.clone();
        // Step 5: modify finalMatrix to remove large translation
        const localMatrix = finalMatrix.clone();
        localMatrix.setPosition(new THREE.Vector3(0, 0, 0));
        // Step 6: convert all BufferGeometry positions to Float64Array
        scene.traverse((child) => {
            var _a;
            if (child.isMesh && ((_a = child.geometry) === null || _a === void 0 ? void 0 : _a.attributes.position)) {
                const oldPos = child.geometry.attributes.position;
                const newPos = new Float64Array(oldPos.count * 3);
                for (let i = 0; i < oldPos.count; i++) {
                    newPos[i * 3] = oldPos.getX(i);
                    newPos[i * 3 + 1] = oldPos.getY(i);
                    newPos[i * 3 + 2] = oldPos.getZ(i);
                }
                child.geometry.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
            }
        });
        // Step 7: apply local transform to objects (rotation, scale)
        scene.traverse((child) => {
            if (child.isMesh) {
                child.applyMatrix4(localMatrix);
            }
        });
        // Return both the transformed scene + georef offset
        return { scene, georefOffset };
    });
}
/**
 * Converts an IFC model (Uint8Array) into a GeoJSON FeatureCollection object.
 *
 * @param ifcData - The raw IFC file content as a Uint8Array.
 * @param crs - Optional coordinate reference system string in URN format.
 *              Default: "urn:ogc:def:crs:EPSG::3857".
 * @param msgCallback - Optional function to receive progress messages (e.g., for UI feedback).
 *
 * @returns A Promise resolving to a GeoJSON FeatureCollection object with geometries and metadata.
 */
export function ifc2Geojson(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", msgCallback = () => { }) {
        const ifcAPI = new WebIFC.IfcAPI();
        yield ifcAPI.Init();
        const modelID = ifcAPI.OpenModel(ifcData);
        msgCallback("Loading geometries...");
        const localScene = new THREE.Scene();
        const model = new IfcThree(ifcAPI);
        model.LoadAllGeometry(localScene, modelID);
        // Return both the transformed scene + georef offset
        const { scene, georefOffset } = yield transformScene(ifcAPI, modelID, localScene);
        msgCallback("Converting to GeoJSON...");
        const exporter = new GeoJsonExporter().setGeorefOffset(georefOffset);
        const geojson = exporter.parse(scene);
        const geojsonWithCRS = Object.assign(Object.assign({}, geojson), { crs: {
                type: "name",
                properties: {
                    name: crs
                }
            } });
        ifcAPI.CloseModel(modelID);
        return geojsonWithCRS;
    });
}
/**
 * Converts an IFC model (Uint8Array) into a filtered GeoJSON FeatureCollection.
 * Only includes or excludes geometry based on specified IFC class names.
 *
 * @param ifcData - The raw IFC file content as a Uint8Array.
 * @param crs - Optional CRS string in URN format. Default: "urn:ogc:def:crs:EPSG::3857".
 * @param toFilter - An object with:
 *                   - mode: "include" or "exclude"
 *                   - classList: array of IFC class names (e.g., ["IfcWall", "IfcSlab"])
 * @param msgCallback - Optional progress callback function.
 *
 * @returns A Promise resolving to a filtered GeoJSON FeatureCollection.
 */
export function ifc2GeojsonWithFilter(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", toFilter = [], msgCallback = () => { }) {
        const ifcAPI = new WebIFC.IfcAPI();
        yield ifcAPI.Init();
        const modelID = ifcAPI.OpenModel(ifcData);
        msgCallback("Loading geometries...");
        const localScene = new THREE.Scene();
        const model = new IfcThree(ifcAPI);
        model.LoadAllGeometry(localScene, modelID, toFilter);
        // Return both the transformed scene + georef offset
        const { scene, georefOffset } = yield transformScene(ifcAPI, modelID, localScene);
        msgCallback("Converting to GeoJSON...");
        const exporter = new GeoJsonExporter().setGeorefOffset(georefOffset);
        const geojson = exporter.parse(scene);
        const geojsonWithCRS = Object.assign(Object.assign({}, geojson), { crs: {
                type: "name",
                properties: {
                    name: crs
                }
            } });
        ifcAPI.CloseModel(modelID);
        return geojsonWithCRS;
    });
}
/**
 * Like `ifc2Geojson`, but returns the result as a Blob for downloading
 * or streaming in browser environments.
 *
 * @param ifcData - IFC model data as Uint8Array.
 * @param crs - Optional CRS string in URN format.
 * @param msgCallback - Optional callback for progress updates.
 *
 * @returns A Promise resolving to a Blob containing the GeoJSON string.
 */
export function ifc2GeojsonBlob(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", msgCallback = () => { }) {
        const geojsonWithCRS = yield ifc2Geojson(ifcData, crs, msgCallback);
        const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
            type: "application/json"
        });
        return blob;
    });
}
/**
 * Like `ifc2GeojsonWithFilter`, but returns the result as a Blob.
 * Useful when you want to filter certain IFC classes and export
 * the result for download or upload.
 *
 * @param ifcData - IFC model data as Uint8Array.
 * @param crs - Optional CRS string in URN format.
 * @param toFilter - Filtering config: { mode: "include" | "exclude", classList: string[] }
 * @param msgCallback - Optional callback for progress updates.
 *
 * @returns A Promise resolving to a Blob of the filtered GeoJSON output.
 */
export function ifc2GeojsonBlobWithFilter(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", toFilter = [], msgCallback = () => { }) {
        const geojsonWithCRS = yield ifc2GeojsonWithFilter(ifcData, crs, toFilter, msgCallback);
        const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
            type: "application/json"
        });
        return blob;
    });
}
/**
 * Analyzes a GeoJSON FeatureCollection and produces an array of
 * property names with their corresponding GeoPackage-compatible data types.
 *
 * @param geojson - A valid GeoJSON FeatureCollection object.
 *
 * @returns An array of objects with `name` and `dataType` (e.g., TEXT, REAL).
 */
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
export * as THREE from "three";
export * as WebIFC from "web-ifc";
export { IfcThree } from './ifc2scene';
