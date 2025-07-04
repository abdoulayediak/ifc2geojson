/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. 
 * 
 * Project:     ifc2geojson [IFC (BIM) to GeoJSON (GIS) converter]
 * Author:      Abdoulaye Diakite (abdou@citygeometrix.com)
*/

import * as WebIFC from "web-ifc";
import * as THREE from "three";
import { IfcThree } from './ifc2scene';


// Adapted from https://github.com/prolincur/three-geojson-exporter for 3D support
class GeoJsonExporter {
  projection: string;
  precision: number;
  transformCallback: (p: THREE.Vector3) => [number, number, number];

  constructor() {
    this.transformCallback = (p) => [p.x, p.y, p.z];
    this.projection = "EPSG:3857";
    this.precision = 8;
  }

  setProjection(p: string): this {
    this.projection = p;
    return this;
  }

  setPrecision(p: number): this {
    this.precision = p;
    return this;
  }

  setTransformCallback(fn: (p: THREE.Vector3) => [number, number, number]): this {
    if (typeof fn === "function") {
      this.transformCallback = fn;
    }
    return this;
  }

  parse(root: THREE.Object3D): GeoJSON.FeatureCollection | null {
    if (!root) return null;
    const exporter = this;

    function toCoords(v: THREE.Vector3): [number, number, number] {
      const [x, y, z] = exporter.transformCallback(v);
      return [
        parseFloat(x.toFixed(exporter.precision)),
        parseFloat(y.toFixed(exporter.precision)),
        parseFloat(z.toFixed(exporter.precision))
      ];
    }

    function extractMesh(obj: THREE.Mesh): GeoJSON.Feature[] {
      const geometry = obj.geometry as THREE.BufferGeometry;
      const pos = geometry.attributes.position;
      const index = geometry.index;
      if (!pos) return [];

      obj.updateMatrix();
      const matrix = obj.matrixWorld.clone();
      const polygons: [number, number, number][][] = [];

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
      } else {
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

    function recurse(obj: THREE.Object3D): GeoJSON.Feature[] {
      const features: GeoJSON.Feature[] = [];

      if (obj instanceof THREE.Mesh) {
        features.push(...extractMesh(obj));
      } else if (obj instanceof THREE.Group || obj instanceof THREE.Scene || obj instanceof THREE.Object3D) {
        obj.updateMatrix();
        for (const child of obj.children) {
          const childFeatures = recurse(child);
          if (childFeatures) features.push(...childFeatures);
        }
      }

      return features;
    }

    const features = recurse(root);
    if (!features || !features.length) return null;

    return {
      type: "FeatureCollection",
      features
    };
  }
}


export async function ifc2Geojson(
    ifcData: Uint8Array,
    msgCallback: (msg: string) => void = () => { },
    crs: string = "urn:ogc:def:crs:EPSG::3857"
): Promise<object> {

    const ifcApi = new WebIFC.IfcAPI();
    await ifcApi.Init();
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

    const geojsonWithCRS = {
        ...geojson,
        crs: {
            type: "name",
            properties: {
                name: crs
            }
        }
    } as any;

    ifcApi.CloseModel(modelID);
    return geojsonWithCRS;
}


export async function ifc2GeojsonBlob(
    ifcData: Uint8Array,
    msgCallback: (msg: string) => void = () => { },
    crs: string = "urn:ogc:def:crs:EPSG::3857"
): Promise<Blob> {

    const geojsonWithCRS = await ifc2Geojson(ifcData, msgCallback, crs);
    const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
        type: "application/json"
    });
    
    return blob;
}


export function getGeoPackagePropertiesFromGeoJSON(geojson: GeoJSON.FeatureCollection): { name: string; dataType: string }[] {
    const typeMap: Record<string, string> = {
        string: "TEXT",
        number: "REAL",
        boolean: "BOOLEAN",
    };

    const seenProps = new Map<string, string>();

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