# ifc2geojson - IFC to GeoJSON Converter

This project provides tools to convert IFC (Industry Foundation Classes) models into GeoJSON format, suitable for GIS and web mapping applications. It includes a 3D-aware GeoJSON exporter and utilities for generating GeoPackage schema from GeoJSON.

---

## License

This source code is licensed under the Mozilla Public License 2.0 (MPL-2.0).  
See [https://mozilla.org/MPL/2.0/](https://mozilla.org/MPL/2.0/).

---

## Features

- Parses IFC data using [web-ifc](https://github.com/ifcjs/web-ifc).
- Converts IFC geometries into 3D GeoJSON using [three.js](https://threejs.org/).
- Supports coordinate reference system (CRS) specification.
- Provides GeoPackage property type extraction for database schema generation.

---

## Installation

Install via npm:

```bash
npm install ifc2geojson
```

# Usage

## Importing

```typescript
import { ifc2Geojson, ifc2GeojsonBlob, getGeoPackagePropertiesFromGeoJSON } from 'ifc2geojson';
```

## Converting IFC to GeoJSON (object)

```typescript
const ifcData: Uint8Array = /* load your IFC file */;
const geojson = await ifc2Geojson(ifcData, (msg) => console.log(msg), "urn:ogc:def:crs:EPSG::3857");
console.log(geojson);
```

## Converting IFC to GeoJSON Blob (for file download)

```typescript
const geojsonBlob = await ifc2GeojsonBlob(ifcData, (msg) => console.log(msg));
saveAs(geojsonBlob, "model.geojson");  // using file-saver or similar
```

## Extracting GeoPackage properties from GeoJSON

```typescript
const properties = getGeoPackagePropertiesFromGeoJSON(geojson);
console.log(properties);
/*
[
  { name: "IfcEntity", dataType: "TEXT" },
  { name: "Name", dataType: "TEXT" },
  ...
]
*/
```


## API Reference

### `ifc2Geojson(ifcData: Uint8Array, msgCallback?: (msg: string) => void, crs?: string): Promise<object>`

Parses the IFC data and returns a GeoJSON `FeatureCollection` object.

- **ifcData**: Raw IFC file data as `Uint8Array`.
- **msgCallback**: *(Optional)* Callback function to receive progress messages.
- **crs**: *(Optional)* Coordinate Reference System identifier string. Default is `"urn:ogc:def:crs:EPSG::3857"`.

---

### `ifc2GeojsonBlob(ifcData: Uint8Array, msgCallback?: (msg: string) => void, crs?: string): Promise<Blob>`

Same as `ifc2Geojson` but returns a `Blob` containing the GeoJSON string. This is suitable for file download in browser contexts.

---

### `getGeoPackagePropertiesFromGeoJSON(geojson: GeoJSON.FeatureCollection): { name: string; dataType: string }[]`

Inspects the GeoJSON features and returns a list of property names and their mapped GeoPackage data types:

- `TEXT` for string fields
- `REAL` for numeric fields
- `BOOLEAN` for boolean fields

---

## Acknowledgements

- [`web-ifc`](https://github.com/ifcjs/web-ifc) — for IFC parsing
- [`three.js`](https://threejs.org) — for 3D geometry processing
- [`three-geojson-exporter`](https://github.com/prolincur/three-geojson-exporter) — for GeoJSON export inspiration
