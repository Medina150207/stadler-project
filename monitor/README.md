# NO SHUTDOWN — Mine Safety Dashboard MVP

A separate frontend edition of the supplied Smart Helmet 5.0 prototype. It is a complete static application: the interface, 3D scene, model, fonts and example datasets are stored locally.

## Open the dashboard

**Simplest:** open `index.html` in a current desktop browser. No installation, account, API key or internet connection is needed. Keep the whole folder together; opening a lone copy of the HTML will not load its assets.

**Optional local server:** install Node.js if it is not available, open a terminal in this folder, and run:

```sh
node server.cjs
```

Open **http://127.0.0.1:8765**. Stop the server with Ctrl+C. The server binds only to your own computer.

You can also use `npm start`, the VS Code Live Server extension, or `python3 -m http.server 8765`. There is no build step and no npm dependency installation is required to run the application.

## What is included

- Graphite and black interface with restrained red accents, a navigation rail, four overview metrics and a selected-zone inspector.
- Actual WebGL 3D cutaway with tunnel supports, layered rock, a shaft, relay nodes and eight conceptual helmet markers. It is a conceptual layout, not a surveyed mine model.
- A sensor lens inspired by the network reference: CH4, CO, H2S and temperature markers connect to the selected underground zone. Marker values and colors come from the current engine snapshot.
- Pointer, touch and keyboard camera controls; gentle automatic camera motion; independent sensor, route and helmet visibility controls.
- A selectable 2D view, also used automatically when WebGL cannot initialize.
- English by default, plus Russian and Kazakh. The switch translates headings, controls, tooltips, sensor descriptions, forecasts, existing journal entries and export messages without restarting the simulation. The browser remembers the selected language.
- One bundled font family, Noto Sans, in regular and semibold weights. Both font files contain the Kazakh-specific glyphs Ә Ғ Қ Ң Ө Ұ Ү Һ І and their lowercase forms.
- Start/pause/reset, 1×/2×/4× playback, predictive and emergency scenarios, relay 3 and relay 4 failure/restoration, CSV playback and journal CSV download.
- A translated sensor-details dialog exposes all 14 original sensor features.
- Sensor history for methane, CO and temperature. The selected zone and two comparison zones share a scale. The graph does not clip readings at the old hard-coded 10 ppm maximum.
- Structured journal events, transition logging, category filters, wall-clock timestamps and separate simulation timestamps.
- Responsive layouts, keyboard focus indicators, a skip link, an accessible information dialog and reduced-motion support.

## Try the MVP

1. Open `index.html`. All zones begin with the initial simulated readings.
2. Click **Start simulation**. At 1×, each real second advances one 20-second simulation sample. The elapsed time is simulation time.
3. Choose **4×** to run the demo faster. The predictive scenario increases gas readings in zones C and D according to the original generator.
4. Click a zone label in the scene or A–F in the inspector. Sensor readings, the chart and the floating sensor lens follow that zone.
5. Choose **Emergency in E**. The original emergency generator begins increasing E's readings after tick 22. At 4×, this starts after about six real seconds; the methane danger threshold is crossed later. The scene and panels update together.
6. In **Connectivity**, click **Relay 3** or **Relay 4**. Their directly connected branches can become disconnected while other reachable branches retain routes. Click **Restore** to recover the relay.
7. Switch EN / RU / KZ at any time. Current values and simulation progress are retained.
8. Import `data/sensor_stream_predictive_mesh.csv` or `data/sensor_stream_emergency_mesh.csv`. The source label changes to CSV replay. The replay loops and restarts its trend window at the boundary.
9. Use **Export CSV** in the journal. Exported messages use the current interface language.

## Camera controls

| Action | Control |
| --- | --- |
| Orbit | Drag with the primary pointer; arrow keys when the map is focused |
| Pan | Shift + drag, right-button drag, or two-finger drag |
| Zoom | Scroll, pinch, + / − keys, or the map toolbar |
| Reset camera | Reset icon or Home key |
| Automatic motion | Cube button in the map toolbar |
| Select a zone | A–F buttons, scene labels, or a zone/sensor object in 3D |

The automatic camera sway is disabled initially when the operating system requests reduced motion. You can opt in with the cube control. Simulation pauses when the browser tab is hidden, preventing unseen time advancement.

## Relationship to the original prototype

The supplied neural weight bundle, scalers, categorical class contract, example CSV files, numeric danger thresholds, neural inference calculations, trend estimator, synthetic scenario formulas and route graph were retained. The code has been organized into a computation layer and a presentation layer to support the new UI.

Two deliberate input-handling corrections prevent misleading displays:

1. A CSV must contain all six zones for every tick, required numeric features and consecutive tick values beginning at zero. Invalid imports are rejected before replacing the active feed. The application does not silently synthesize missing CSV zones or infer locations by hashing helmet IDs.
2. Tick zero remains zero. Reaching the end of a CSV restarts the history window, so the end-to-start jump does not become a fabricated forecast trend.

Relay controls recalculate the current sample without advancing simulation time. Changing the scenario clears the previous scenario's relay failures. A reset returns to the initial predictive sample and pauses playback.

## Interpretation and limits

This MVP demonstrates a monitoring interface. It is not connected to real mine hardware, MQTT, a radio gateway, a database, or emergency equipment. The default readings and miner motion are generated in the browser. CSV import is replay, not a live connection.

The original thresholds and units are preserved as **demo values**, including the 7 ppm CH4 limit. They have not been validated for operational mine safety. This redesign does not resolve the source material's unit/threshold discrepancy or validate its model accuracy. The original model bundle itself notes that its numeric scaler was approximated for the browser demo.

The forecast is a linear time-to-threshold estimate. The interface intentionally does not display the old heuristic score as a probability. It does not claim validated accident prediction or calibrated confidence.

The network panel illustrates the original graph's routes. Reserve edges are eligible even in normal operation; a reserve link in use does not itself prove a failure occurred. There is one dispatch endpoint and fixed branch gateways. Losing a branch gateway can disconnect that zone. The scene does not invent successful radio recovery, measured packet-delivery statistics, or surveyed worker positions.

Only the language preference is persisted. Readings, playback progress and events remain in browser memory and reset on reload. Imported CSV content is not sent anywhere. File size is limited to 5 MB.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Semantic dashboard structure and icon definitions |
| `styles.css` | Responsive design, typography, states and motion preferences |
| `app.js` | UI controls, rendering, charts, translation updates and journal |
| `engine.js` | Retained numerical and routing logic plus validated CSV replay |
| `scene.js` | 3D cutaway, sensor lens, camera controls and 2D fallback |
| `i18n.js` | English, Russian and Kazakh dictionaries |
| `assets/model_bundle.js` | Unchanged model weights and preprocessing bundle |
| `assets/fonts/` | Noto Sans fonts and license |
| `vendor/` | Locally bundled Three.js 0.160.0 and MIT license |
| `data/` | Supplied streaming examples and original training table |
| `server.cjs` | Optional dependency-free local static server |
| `qa/` | Repeatable checks, results and captured browser views |

## Checks

Run the dependency-free checks with `npm run check`. Numerical equivalence can also be checked against the original project:

```sh
node qa/engine-checks.cjs --original="/path/to/original/project"
```

The optional browser checks require Playwright and a Chromium browser. Set `PLAYWRIGHT_MODULE` to a local Playwright module if it is not installed in this folder; set `CHROME_EXECUTABLE` to use an installed Chrome binary. Run `node qa/browser-checks.cjs` while the local server is available. Runtime use of the dashboard does not require Playwright.

Observed verification results are in `qa/engine-results.json`, `qa/browser-results.json` and `qa/layout-results.json`. These checks cover the desktop and narrow layouts, all languages, playback, relay failures, chart selection, CSV validation/export, WebGL fallback and direct offline file opening. Browser coverage is limited to the installed desktop Chrome; real mobile Safari and physical mine equipment were not tested.

## Third-party assets

- [Three.js 0.160.0](https://github.com/mrdoob/three.js/tree/r160), MIT license, included at `vendor/THREE-LICENSE.txt`.
- [Noto Sans](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans), SIL Open Font License, included at `assets/fonts/OFL.txt`.

The supplied design images were used as visual references. No reference screenshot is embedded as a dashboard component.
