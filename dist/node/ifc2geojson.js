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
export function ifc2Geojson(ifcData_1) {
    return __awaiter(this, arguments, void 0, function* (ifcData, crs = "urn:ogc:def:crs:EPSG::3857", msgCallback = () => { }) {
        const ifcApi = new WebIFC.IfcAPI();
        yield ifcApi.Init();
        const modelID = ifcApi.OpenModel(ifcData);
        msgCallback("Loading geometries...");
        const scene = new THREE.Scene();
        const model = new IfcThree(ifcApi);
        model.LoadAllGeometry(scene, modelID);
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
                const posAttr = child.geometry.attributes.position;
                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const z = posAttr.getZ(i);
                    posAttr.setXYZ(i, x, -z, y); // flip Y <-> Z
                }
                posAttr.needsUpdate = true;
                child.geometry.computeVertexNormals();
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
