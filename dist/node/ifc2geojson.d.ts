export declare function getElemsWithGeom(ifcData: Uint8Array): Promise<string[]>;
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
export declare function ifc2Geojson(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<object>;
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
export declare function ifc2GeojsonWithFilter(ifcData: Uint8Array, crs?: string, toFilter?: string[], msgCallback?: (msg: string) => void): Promise<object>;
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
export declare function ifc2GeojsonBlob(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<Blob>;
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
export declare function ifc2GeojsonBlobWithFilter(ifcData: Uint8Array, crs?: string, toFilter?: string[], msgCallback?: (msg: string) => void): Promise<Blob>;
/**
 * Analyzes a GeoJSON FeatureCollection and produces an array of
 * property names with their corresponding GeoPackage-compatible data types.
 *
 * @param geojson - A valid GeoJSON FeatureCollection object.
 *
 * @returns An array of objects with `name` and `dataType` (e.g., TEXT, REAL).
 */
export declare function getGeoPackagePropertiesFromGeoJSON(geojson: GeoJSON.FeatureCollection): {
    name: string;
    dataType: string;
}[];
