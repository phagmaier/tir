import { featureScript } from "../src/core/fixtures/scripts.ts";
import { paginate } from "../src/core/paginate.ts";

const script = featureScript(150);
// Warm up and keep the workload comparable to a feature-length draft.
const pageCount = paginate(script).length;
if (pageCount < 110 || pageCount > 135) {
  console.error(`Expected 110–135 pages in the timing fixture; got ${pageCount}.`);
  process.exit(1);
}

const samples = Array.from({ length: 25 }, () => {
  const start = performance.now();
  paginate(script);
  return performance.now() - start;
});
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)] as number;
const targetMs = 16;
console.log(
  `${pageCount} pages: ${median.toFixed(2)} ms median over ${samples.length} runs (target <${targetMs} ms).`,
);
process.exitCode = median < targetMs ? 0 : 1;
