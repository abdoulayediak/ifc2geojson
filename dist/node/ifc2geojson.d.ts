export declare function ifc2Geojson(ifcData: Uint8Array, msgCallback?: (msg: string) => void, crs?: string): Promise<object>;
export declare function ifc2GeojsonBlob(ifcData: Uint8Array, msgCallback?: (msg: string) => void, crs?: string): Promise<Blob>;
export declare function getGeoPackagePropertiesFromGeoJSON(geojson: GeoJSON.FeatureCollection): {
    name: string;
    dataType: string;
}[];
