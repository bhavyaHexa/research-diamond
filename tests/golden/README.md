# Golden frame

1. Open the app, wait for the frame to converge, Export tab -> "Capture converged frame".
2. Save the returned `{width, height, mean}` as `tests/golden/default.json`.
3. After any change, capture again and compare with `matchesGolden(current, golden)` from
   `src/pipeline/manifest.ts` (tolerance 3 levels). Compare converged frames only.
