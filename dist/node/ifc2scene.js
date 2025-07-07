/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Project:     ifc2geojson [IFC (BIM) to GeoJSON (GIS) converter]
 * Author:      Abdoulaye Diakite (abdou@citygeometrix.com)
 * Adapted from: https://github.com/ThatOpen/engine_web-ifc/blob/main/examples/viewer/web-ifc-three.ts
*/
import * as THREE from "three";
import { ms } from "web-ifc";
export class IfcThree {
    /**
        Creates an instance of IfcThree, requires a valid instance of IfcAPI
    */
    constructor(ifcAPI) {
        this.materials = {};
        this.ifcAPI = ifcAPI;
    }
    /**
     * Loads all geometry for the model with id "modelID" into the supplied scene
     * @scene Threejs Scene object
     * @modelID Model handle retrieved by OpenModel, model must not be closed
    */
    LoadAllGeometry(scene, modelID) {
        const startUploadingTime = ms();
        let geometries = [];
        let geometriesProps = [];
        this.ifcAPI.StreamAllMeshes(modelID, (mesh) => {
            // Each IFC element can have several geometries with different materials
            const placedGeometries = mesh.geometries;
            // Collect and store the IFC element's properties
            let elem = this.ifcAPI.GetLine(modelID, mesh.expressID);
            let elemProps = this.extractStringProperties(elem);
            for (let i = 0; i < placedGeometries.size(); i++) {
                const placedGeometry = placedGeometries.get(i);
                let placedMesh = this.getPlacedGeometry(modelID, placedGeometry);
                let geom = placedMesh.geometry.applyMatrix4(placedMesh.matrix);
                let geomCol = placedGeometry.color;
                // Provide a color to non-transparent components without one:
                // Blue for furniture and grey for the rest (walls, etc).
                if (geomCol.x == 0 && geomCol.y == 0 && geomCol.z == 0 && geomCol.w == 1) {
                    if (elemProps.IfcEntity.includes("IfcFurni")) {
                        geomCol.x = 0.1;
                        geomCol.y = 0.3;
                        geomCol.z = 0.7;
                    }
                    else {
                        geomCol.x = 0.7;
                        geomCol.y = 0.7;
                        geomCol.z = 0.7;
                    }
                }
                const col = new THREE.Color().setRGB(geomCol.x, geomCol.y, geomCol.z);
                elemProps.color = `#${col.getHexString()}`;
                elemProps.opacity = placedGeometry.color.w * 100; //opacity in percentage
                geometries.push(geom);
                geometriesProps.push(structuredClone(elemProps));
            }
        });
        console.log("Loading " + geometries.length + " geometries");
        geometries.forEach((geom, idx) => {
            let mat = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide });
            mat.vertexColors = true;
            const aMesh = new THREE.Mesh(geom, mat);
            aMesh.userData = geometriesProps[idx];
            scene.add(aMesh);
        });
        console.log(`Uploading took ${ms() - startUploadingTime} ms`);
    }
    extractStringProperties(elem) {
        const result = {
            IfcEntity: this.ifcAPI.GetNameFromTypeCode(elem === null || elem === void 0 ? void 0 : elem.type) || "Unknown",
            color: "",
            opacity: 1
        };
        for (const [key, val] of Object.entries(elem)) {
            if (val && typeof val === "object" && "value" in val && typeof val.value === "string") {
                result[key] = val.value;
            }
        }
        return result;
    }
    getPlacedGeometry(modelID, placedGeometry) {
        const geometry = this.getBufferGeometry(modelID, placedGeometry);
        const material = this.getMeshMaterial(placedGeometry.color);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrix = this.getMeshMatrix(placedGeometry.flatTransformation);
        mesh.matrixAutoUpdate = false;
        return mesh;
    }
    getBufferGeometry(modelID, placedGeometry) {
        // WARNING: geometry must be deleted when requested from WASM
        const geometry = this.ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID);
        const verts = this.ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = this.ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        const bufferGeometry = this.ifcGeometryToBuffer(placedGeometry.color, verts, indices);
        //@ts-ignore
        geometry.delete();
        return bufferGeometry;
    }
    getMeshMaterial(color) {
        let colID = `${color.x}${color.y}${color.z}${color.w}`;
        // console.log(colID);
        if (this.materials[colID]) {
            return this.materials[colID];
        }
        const col = new THREE.Color(color.x, color.y, color.z);
        const material = new THREE.MeshPhongMaterial({ color: col, side: THREE.DoubleSide });
        material.transparent = color.w !== 1;
        if (material.transparent)
            material.opacity = color.w;
        this.materials[colID] = material;
        return material;
    }
    getMeshMatrix(matrix) {
        const mat = new THREE.Matrix4();
        mat.fromArray(matrix);
        return mat;
    }
    ifcGeometryToBuffer(color, vertexData, indexData) {
        const geometry = new THREE.BufferGeometry();
        let posFloats = new Float32Array(vertexData.length / 2);
        let normFloats = new Float32Array(vertexData.length / 2);
        let colorFloats = new Float32Array(vertexData.length / 2);
        for (let i = 0; i < vertexData.length; i += 6) {
            posFloats[i / 2 + 0] = vertexData[i + 0];
            posFloats[i / 2 + 1] = vertexData[i + 1];
            posFloats[i / 2 + 2] = vertexData[i + 2];
            normFloats[i / 2 + 0] = vertexData[i + 3];
            normFloats[i / 2 + 1] = vertexData[i + 4];
            normFloats[i / 2 + 2] = vertexData[i + 5];
            colorFloats[i / 2 + 0] = color.x;
            colorFloats[i / 2 + 1] = color.y;
            colorFloats[i / 2 + 2] = color.z;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(posFloats, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normFloats, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colorFloats, 3));
        geometry.setIndex(new THREE.BufferAttribute(indexData, 1));
        return geometry;
    }
}
