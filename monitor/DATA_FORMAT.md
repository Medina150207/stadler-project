# CSV replay format

Use one of the included `sensor_stream_*.csv` files as a template. Each tick must have exactly one row for every zone A, B, C, D, E and F. Ticks must be consecutive integers beginning with 0. One tick represents 20 simulated seconds. Rows may arrive in any order inside the file; they are grouped by tick before playback.

Required columns:

```text
tick,node_id,Helmet_ID,Temp_C,Humidity_Percent,CH4_ppm,H2S_ppm,CO_ppm,VOC_ppm,Pressure_hPa,Mud_Level_cm,Mud_Viscosity_Index,Mud_Salinity_uS_cm,Accel_Z_g,Light_lux,Impact_N,Fluid_Level_cm,node_online
```

- `node_id`: A–F.
- `Helmet_ID`: non-empty helmet identifier. The original neural category encoding is retained.
- `node_online`: 0 or 1.
- All sensor fields must contain finite numbers. Blank values and non-numeric strings are rejected.
- Extra columns are allowed. Column names may not be duplicated.
- Quoted fields, escaped quotes, UTF-8 BOM and CRLF/LF line endings are supported.
- Maximum file size: 5 MB.

The entire file is validated before the active dataset is replaced. Missing zones, duplicate zone/tick rows, missing columns, invalid numbers and nonconsecutive ticks produce a translated error. Missing readings are never replaced with generated demo values.

The file `smart_helmet_dataset_with_danger_level.csv` is retained as original project material. It is a training table with `Timestamp`, `Target` and `Danger_Level`, not a complete six-zone stream. Direct import is intentionally rejected with an explanation of the missing columns.

The inspector's personnel roster and mesh topology remain the prototype's fixed six zones and eight helmet markers. CSV loading changes sensor readings and zone-link state; it does not create arbitrary miners or a new mine layout.

The supplied unit names and thresholds are retained for demonstration. Their physical interpretation must be established independently before any use with operational mine data.
