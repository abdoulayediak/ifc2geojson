# ifc2geojson - IFC to GeoJSON Converter

This project provides tools to convert IFC (Industry Foundation Classes) models into **3D GeoJSON** for GIS and web mapping applications. It includes a precision-aware GeoJSON exporter, IFC filtering, and utilities for generating GeoPackage schema from GeoJSON. See the [`live demo`](https://citygeometrix.com/ifc2gis).

---

## Features

- Parses IFC data using [web-ifc](https://github.com/ifcjs/web-ifc).  
- Converts IFC geometries into 3D GeoJSON using [three.js](https://threejs.org/).  
- Supports coordinate reference system (CRS) specification.  
- Provides GeoPackage property type extraction for database schema generation.  
- Reads and applies **IfcMapConversion (IFC4)** for direct georeferencing of models.  
- Allows **filtering of IFC elements** (include/exclude by class) when exporting to GeoJSON.  
- Improves coordinate precision with **Float64Array geometry storage** and **georef offset strategy**.  
- Offers both **object** and **Blob** outputs for easy integration in Node.js or browser contexts.  

## Installation

Install via npm:

```bash
npm install ifc2geojson
```

---

## Usage

### Importing

```typescript
import {
  ifc2Geojson,
  ifc2GeojsonBlob,
  ifc2GeojsonWithFilter,
  ifc2GeojsonBlobWithFilter,
  getGeoPackagePropertiesFromGeoJSON,
  getElemsWithGeom
} from 'ifc2geojson';
```

---

### Convert IFC → GeoJSON (object)

```typescript
const crs = "urn:ogc:def:crs:EPSG::3857";
const ifcData: Uint8Array = /* load your IFC file */;

const geojson = await ifc2Geojson(ifcData, crs, (msg) => console.log(msg));
console.log(geojson);
```

---

### Convert IFC → GeoJSON with Filtering

Filter IFC classes to **include** or **exclude**:

```typescript
const toFilter = ["IfcWall", "IfcSlab"];

const geojson = await ifc2GeojsonWithFilter(
  ifcData,
  "urn:ogc:def:crs:EPSG::3857",
  toFilter,
  (msg) => console.log(msg)
);
```

Or directly get a Blob:

```typescript
const blob = await ifc2GeojsonBlobWithFilter(ifcData, "urn:ogc:def:crs:EPSG::3857", toFilter);
```

---

### Extract IFC element types that contain geometry

```typescript
const elems = await getElemsWithGeom(ifcData);
console.log(elems);
// e.g., ["IfcWall", "IfcSlab", "IfcColumn"]
```

---

### Extract GeoPackage Properties from GeoJSON

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

---

### Browser Usage

To use this library directly in a browser environment, include the browser bundle (`ifc2geojson.min.js`) in your HTML and make sure to also host the required .wasm files (`web-ifc.wasm`, etc.) in the same directory or configure their paths properly. When all required files are properly imported in a browser environment, the API will be accessible via the global window.ifc2geojson object.

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

---

## API Reference

### `ifc2Geojson(ifcData, crs?, msgCallback?)`
Parses IFC and returns a GeoJSON `FeatureCollection`.

- `ifcData`: `Uint8Array`
- `crs`: CRS string (default `"urn:ogc:def:crs:EPSG::3857"`)
- `msgCallback`: progress callback

---

### `ifc2GeojsonWithFilter(ifcData, crs?, toFilter?, msgCallback?)`
Like `ifc2Geojson` but allows filtering by IFC class names.

---

### `ifc2GeojsonBlob(ifcData, crs?, msgCallback?)`
Like `ifc2Geojson`, but returns a `Blob`.

---

### `ifc2GeojsonBlobWithFilter(ifcData, crs?, toFilter?, msgCallback?)`
Blob version of the filtered exporter.

---

### `getElemsWithGeom(ifcData)`
Returns IFC element type names that have geometry.

---

### `getGeoPackagePropertiesFromGeoJSON(geojson)`
Analyzes a GeoJSON `FeatureCollection` and outputs property names and GeoPackage-compatible data types.

---

## Acknowledgements

- [`web-ifc`](https://github.com/ifcjs/web-ifc) — IFC parsing
- [`three.js`](https://threejs.org/) — 3D geometry processing
- [`three-geojson-exporter`](https://github.com/prolincur/three-geojson-exporter) — inspiration for exporter
- [`geopackage-js`](https://github.com/ngageoint/geopackage-js) — for GeoJSON → GeoPackage schema

---

## License

This source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**.  
See [https://mozilla.org/MPL/2.0/](https://mozilla.org/MPL/2.0/).
