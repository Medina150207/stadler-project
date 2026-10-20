# Verification record

Executed locally on 18 October 2026 (Asia/Almaty). Result files store UTC timestamps.

## Results

| Suite | Passed | Evidence |
|---|---:|---|
| Rail scenario engine | 10 / 10 | `engine-results.json` |
| Browser interaction scenarios | 24 / 24 | `browser-results.json` |
| Final navy palette, mobile fit and camera changes | 6 / 6 | `layout-results.json` |
| Preserved monitoring engine | 9 / 9 | `monitor-engine-results.json` |
| **Total** | **49 / 49** | No uncaught JavaScript errors in browser suites |

Commands actually executed:

```sh
node --check app.js
node --check scene.js
node --check engine.js
node --check i18n.js
node qa/engine-checks.cjs
node monitor/qa/engine-checks.cjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_EXECUTABLE=/path/to/chrome node qa/browser-checks.cjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_EXECUTABLE=/path/to/chrome node qa/layout-checks.cjs
```

Browser: installed Google Chrome in an isolated headless profile. The final successful browser suites used Chrome's default graphics configuration. An earlier forced software-WebGL run timed out during page/screenshot capture; it is not counted as a pass. Static shadow-map reuse and rendering only when needed were added before the successful runs. No measured FPS or hardware-independent performance guarantee is claimed.

## Covered

- Actual WebGL rendering, five-body procedural scene, pointer and keyboard orbit, zoom/reset, three camera presets, transparent shell, dimensions, two liveries and selectable 2D drawing.
- Every one of the 16 environment controls at minimum/maximum and beyond the maximum; empty input, finite results, number/slider synchronization, 200 rapid slider events.
- Smooth convergence to −50 °C, instant +50 °C and RH 100%, continuous snow/rain mixture, winter/rain presets. RH 0% and 100% included in all-boundaries checks.
- CSV playback/pause, six-node validation, successful import, rejection of malformed input without replacing the active dataset, return to saved manual state.
- Raw CSV temperature above +50 °C retained, with only the visual effect capped and the limitation shown.
- Alloy balance and Ar/He complement, source dialog, JSON export, economics for one and 20 trains with and without 2% tariff growth.
- English default; EN/RU/KZ switching and persistence; error-message translation; no horizontal overflow at 360, 390, 768 and 1440 px. Camera framing adjusted for narrow screens.
- Primary/secondary CSS text colors exceed 7:1 against the declared panel color. This is a targeted color check, not a full accessibility certification.
- System reduced motion, forced WebGL failure, direct `file://` loading with network offline, no runtime requests outside localhost.
- SHA-256 comparison of both copied CSV inputs; byte comparison of preserved monitoring core files, styling and model bundle against the original project.
- Existing monitoring engine: baseline, relay failure/recovery, emergency, forecast, CSV reads and malformed-input rejection.

## Visual inspection

Opened and inspected actual generated screenshots of the desktop interface, revised cab and bogie, and mobile layout. Final files: `preview.png`, `desktop-ru-final.png`, `cab-detail.png`, `bogie-detail.png`, `mobile-ru-final.png`. Winter/rain and transparent-shell views are saved by the browser suite. The open in-app browser was also refreshed and the cab view selected.

## Limits

This verifies the implemented software behavior, not engineering validity. The geometry remains a brochure-based reconstruction with approximate cab surfaces, individual component spacing and interior. No CAD dimensional audit, manufacturer approval, climate certification, real sensor hardware, calibrated corrosion/HVAC model or physical load analysis was performed. Safari, Firefox, real phones and every GPU configuration were not tested. Paid TurboSquid model files were not acquired or inspected. The monitoring engine's existing demonstration thresholds are not certified railway thresholds.

The ZIP is checked separately for archive integrity during packaging; see `stadler-archive-verification.txt` beside the archive.
