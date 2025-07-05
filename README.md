# ifc2geojson - IFC to GeoJSON Converter

This project provides tools to convert IFC (Industry Foundation Classes) models into GeoJSON format, suitable for GIS and web mapping applications. It includes a 3D-aware GeoJSON exporter and utilities for generating GeoPackage schema from GeoJSON.

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
const crs = "urn:ogc:def:crs:EPSG::3857"; //OGC-compliant format (more widely supported). "EPSG:3857" would work in most GIS too.
const ifcData: Uint8Array = /* load your IFC file */;
const geojson = await ifc2Geojson(ifcData, crs, (msg) => console.log(msg));
console.log(geojson);
```

## Converting IFC to GeoJSON Blob (for file download)

```typescript
const geojsonBlob = await ifc2GeojsonBlob(ifcData, crs, (msg) => console.log(msg));
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

## Usage in the Browser

To use this library directly in a browser environment, include the browser bundle (ifc2geojson.min.js) in your HTML and make sure to also host the required .wasm files (web-ifc.wasm, etc.) in the same directory or configure their paths properly. When all required files are properly imported in a browser environment, the API will be accessible via the global window.ifc2geojson object.

**Example**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
</head>
<body>
  <input type="file" id="ifcInput" accept=".ifc" />

  <script src="path/to/ifc2geojson.min.js"></script>
  <script>
    document.getElementById("ifcInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
  
      const { ifc2GeojsonBlob } = window.ifc2geojson;
  
      const crs = "EPSG:4327";
      const blob = await ifc2GeojsonBlob(uint8, crs, (msg) => {
        console.log("Progress:", msg);
      });
  
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.ifc$/i, ".geojson");
      a.click();
    });
  </script>

</body>
</html>
```

## API Reference

### `ifc2Geojson(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<object>`

Parses the IFC data and returns a GeoJSON `FeatureCollection` object.

- **ifcData**: Raw IFC file data as `Uint8Array`.
- **crs**: *(Optional)* Coordinate Reference System identifier string. Default is `"urn:ogc:def:crs:EPSG::3857"`.
- **msgCallback**: *(Optional)* Callback function to receive progress messages.

---

### `ifc2GeojsonBlob(ifcData: Uint8Array, crs?: string, msgCallback?: (msg: string) => void): Promise<Blob>`

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

---

## License

This source code is licensed under the Mozilla Public License 2.0 (MPL-2.0).  
See [https://mozilla.org/MPL/2.0/](https://mozilla.org/MPL/2.0/).