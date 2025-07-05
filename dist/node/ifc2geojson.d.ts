export declare function ifc2Geojson(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<object>;
export declare function ifc2GeojsonBlob(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<Blob>;
export declare function getGeoPackagePropertiesFromGeoJSON(geojson: GeoJSON.FeatureCollection): {
    name: string;
    dataType: string;
}[];
