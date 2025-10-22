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
  georefOffset: THREE.Vector3; //to limit precision loss when handling big coordinates
  transformCallback: (p: THREE.Vector3) => [number, number, number];

  constructor() {
    this.projection = "EPSG:3857";
    this.precision = 8;
    this.georefOffset = new THREE.Vector3(0, 0, 0);
    this.transformCallback = (p) => [p.x, p.y, p.z];
  }

  setProjection(p: string): this {
    this.projection = p;
    return this;
  }

  setPrecision(p: number): this {
    this.precision = p;
    return this;
  }

  setGeorefOffset(offset: THREE.Vector3): this {
    this.georefOffset.copy(offset);
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
      // Add georef offset to local vertex
      const geoV = new THREE.Vector3().copy(v).add(exporter.georefOffset);
      const [x, y, z] = exporter.transformCallback(geoV);
      // 
      return [x, y, z];
    }

    function extractMesh(obj: THREE.Mesh): GeoJSON.Feature[] {
      const geometry = obj.geometry as THREE.BufferGeometry;
      const pos = geometry.attributes.position;
      const index = geometry.index;
      if (!pos) return [];

      obj.updateMatrixWorld();
      const polygons: [number, number, number][][] = [];

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
      } else {
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

    function recurse(obj: THREE.Object3D): GeoJSON.Feature[] {
      const features: GeoJSON.Feature[] = [];
      if (obj instanceof THREE.Mesh) {
        features.push(...extractMesh(obj));
      } else if (obj instanceof THREE.Group || obj instanceof THREE.Scene || obj instanceof THREE.Object3D) {
        obj.updateMatrixWorld();
        for (const child of obj.children) {
          features.push(...recurse(child));
        }
      }
      return features;
    }

    const features = recurse(root);
    if (!features.length) return null;

    return {
      type: "FeatureCollection",
      features
    };
  }
}




const SI_PREFIXES: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6,
  KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2,
  MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9
};

const LENGTH_UNITS: Record<string, number> = {
  METRE: 1.0,
  FOOT: 0.3048,
  INCH: 0.0254
};


/**
 * Computes the conversion factor for length units defined in the IFC model.
 * Defaults to 1 (meter) if no unit or unknown unit is found.
 */
function getUnitScale(ifcAPI: WebIFC.IfcAPI, modelID: number): number {
  try {
    const projectID = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT).get(0);
    const project = ifcAPI.GetLine(modelID, projectID);
    const units = ifcAPI.GetLine(modelID, project.UnitsInContext.value)?.Units;
    for (const unitRef of units) {
      const unit = ifcAPI.GetLine(modelID, unitRef.value);
      // console.log("Found unit:", unit);
      if (unit.UnitType?.value === "LENGTHUNIT") {
        const baseName = unit?.Name?.value || "METRE";
        const base = LENGTH_UNITS[baseName];
        const prefixName = unit?.Prefix?.value;
        const factor = prefixName ? (SI_PREFIXES[prefixName] ?? 1) : 1.0;
        // console.log(`Detected LENGTHUNIT: ${prefixName || ""} ${baseName || ""}`);
        // console.log(`base=${base}, prefix=${factor}, total=${base * factor}`);
        return base * factor;
      }
    }
  } catch (err) {
    console.warn("⚠️ Failed to detect unit scale. Defaulting to 1 (meters).", err);
    return 1;
  }
  console.warn("⚠️ No LENGTHUNIT found. Defaulting to 1 (meters).");
  return 1;
}



export async function getElemsWithGeom(
  ifcData: Uint8Array
): Promise<string[]> {

  const elemsWithGeom: string[] = [];
  const ifcAPI = new WebIFC.IfcAPI();
  await ifcAPI.Init();
  const modelID = ifcAPI.OpenModel(ifcData);

  // Get all types available in the model
  const allTypes: WebIFC.IfcType[] = ifcAPI.GetAllTypesOfModel(modelID);

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
}



/**
 * Computes a transformation matrix from the IFC IfcMapConversion entity,
 * incorporating translation, orientation, scaling, and unit conversion.
 */
async function getIfcMapConversionMatrix(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number
): Promise<THREE.Matrix4> {
  const resMatrix = new THREE.Matrix4();
  const mapConvIds = await ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION);

  // Fallback: no IfcMapConversion → scale only from UnitsInContext (to meters)
  if (mapConvIds.size() === 0) {
    const s = getUnitScale(ifcAPI, modelID); // e.g. mm→0.001, dm→0.1, m→1
    return resMatrix.makeScale(s, s, s);
  }

  // IfcMapConversion present → use ONLY its rotation/scale/translation (map units)
  const mapConv = await ifcAPI.GetLine(modelID, mapConvIds.get(0));
  if (!mapConv) {
    const s = getUnitScale(ifcAPI, modelID);
    return resMatrix.makeScale(s, s, s);
  }

  const east  = mapConv.Eastings?.value ?? 0;
  const north = mapConv.Northings?.value ?? 0;
  const height= mapConv.OrthogonalHeight?.value ?? 0;
  const s     = mapConv.Scale?.value ?? 1;
  const ax    = mapConv.XAxisAbscissa?.value ?? 1;
  const ay    = mapConv.XAxisOrdinate?.value ?? 0;

  const xAxis = new THREE.Vector3(ax, ay, 0).normalize();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);

  // Orientation → Scale (local→map) → Translation (in map units)
  resMatrix.makeBasis(xAxis, yAxis, zAxis);
  resMatrix.scale(new THREE.Vector3(s, s, s));
  resMatrix.setPosition(new THREE.Vector3(east, north, height));

  return resMatrix;
}


// Flips the Y and Z coordinates (because Y-up is default for THREE)
// And apply any transformation from IfcMapConversion (from IFC4)
// While trying to preserve the coordinate precision as much as possible
// by using Float64Array and applying transformation at export with georefOffset
async function transformScene(
  ifcAPI: any,
  modelID: number,
  scene: THREE.Scene
) {
  // Step 1: build map conversion matrix (from IFC georef info)
  const mapMatrix = await getIfcMapConversionMatrix(ifcAPI, modelID);

  // Step 2: Y-Z flip (your intention)
  const flipMatrix = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
  );

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
  scene.traverse((child: any) => {
    if (child.isMesh && child.geometry?.attributes.position) {
      const oldPos = child.geometry.attributes.position;
      const newPos = new Float64Array(oldPos.count * 3);

      for (let i = 0; i < oldPos.count; i++) {
        newPos[i * 3]     = oldPos.getX(i);
        newPos[i * 3 + 1] = oldPos.getY(i);
        newPos[i * 3 + 2] = oldPos.getZ(i);
      }

      child.geometry.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    }
  });

  // Step 7: apply local transform to objects (rotation, scale)
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.applyMatrix4(localMatrix);
    }
  });

  // Return both the transformed scene + georef offset
  return { scene, georefOffset };
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
export async function ifc2Geojson(
  ifcData: Uint8Array,
  crs: string = "urn:ogc:def:crs:EPSG::3857",
  msgCallback: (msg: string) => void = () => { }
): Promise<object> {

  const ifcAPI = new WebIFC.IfcAPI();
  await ifcAPI.Init();
  const modelID = ifcAPI.OpenModel(ifcData);

  msgCallback("Loading geometries...");
  const localScene  = new THREE.Scene();
  const model = new IfcThree(ifcAPI);
  model.LoadAllGeometry(localScene , modelID);

  // Return both the transformed scene + georef offset
  const { scene, georefOffset } = await transformScene(ifcAPI, modelID, localScene );

  msgCallback("Converting to GeoJSON...");
  const exporter = new GeoJsonExporter().setGeorefOffset(georefOffset);
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

  ifcAPI.CloseModel(modelID);
  return geojsonWithCRS;
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
export async function ifc2GeojsonWithFilter(
  ifcData: Uint8Array,
  crs: string = "urn:ogc:def:crs:EPSG::3857",
  toFilter: string[] = [],
  msgCallback: (msg: string) => void = () => { }
): Promise<object> {

  const ifcAPI = new WebIFC.IfcAPI();
  await ifcAPI.Init();
  const modelID = ifcAPI.OpenModel(ifcData);

  msgCallback("Loading geometries...");
  const localScene  = new THREE.Scene();
  const model = new IfcThree(ifcAPI);
  model.LoadAllGeometry(localScene , modelID, toFilter);

  // Return both the transformed scene + georef offset
  const { scene, georefOffset } = await transformScene(ifcAPI, modelID, localScene );

  msgCallback("Converting to GeoJSON...");
  const exporter = new GeoJsonExporter().setGeorefOffset(georefOffset);
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

  ifcAPI.CloseModel(modelID);
  return geojsonWithCRS;
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
export async function ifc2GeojsonBlob(
  ifcData: Uint8Array,
  crs: string = "urn:ogc:def:crs:EPSG::3857",
  msgCallback: (msg: string) => void = () => { }
): Promise<Blob> {

  const geojsonWithCRS = await ifc2Geojson(ifcData, crs, msgCallback);
  const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
    type: "application/json"
  });

  return blob;
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
export async function ifc2GeojsonBlobWithFilter(
  ifcData: Uint8Array,
  crs: string = "urn:ogc:def:crs:EPSG::3857",
  toFilter: string[] = [],
  msgCallback: (msg: string) => void = () => { }
): Promise<Blob> {

  const geojsonWithCRS = await ifc2GeojsonWithFilter(ifcData, crs, toFilter, msgCallback);
  const blob = new Blob([JSON.stringify(geojsonWithCRS)], {
    type: "application/json"
  });

  return blob;
}


/**
 * Analyzes a GeoJSON FeatureCollection and produces an array of
 * property names with their corresponding GeoPackage-compatible data types.
 *
 * @param geojson - A valid GeoJSON FeatureCollection object.
 *
 * @returns An array of objects with `name` and `dataType` (e.g., TEXT, REAL).
 */
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


export * as THREE from "three";
export * as WebIFC from "web-ifc";
export { IfcThree } from './ifc2scene';