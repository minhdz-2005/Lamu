import { hash, verify } from "argon2";
import { cpus, totalmem, platform, arch } from "node:os";
import { performance } from "node:perf_hooks";
import { hashOptions } from "../src/modules/auth/auth.service";
async function measure(concurrency: number, count: number) {
  const samples: number[] = [];
  let errors = 0;
  const start = performance.now();
  for (let i = 0; i < count; i += concurrency) {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, count - i) }, async () => {
        const at = performance.now();
        try {
          const encoded = await hash(
            "Synthetic benchmark input, never a user credential",
            hashOptions,
          );
          if (
            !(await verify(
              encoded,
              "Synthetic benchmark input, never a user credential",
            ))
          )
            throw Error("verify failed");
        } catch {
          errors++;
        } finally {
          samples.push(performance.now() - at);
        }
      }),
    );
  }
  samples.sort((a, b) => a - b);
  return {
    concurrency,
    count,
    p50_ms: samples[Math.ceil(samples.length * 0.5) - 1],
    p95_ms: samples[Math.ceil(samples.length * 0.95) - 1],
    elapsed_ms: performance.now() - start,
    errors,
    error_rate: errors / count,
  };
}
(async () => {
  const warm = await hash("Synthetic warmup", hashOptions);
  await verify(warm, "Synthetic warmup");
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        argon2: "0.45.2",
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0].model,
        visible_cpus: cpus().length,
        visible_memory_bytes: totalmem(),
        parameters: hashOptions,
        measured_at: new Date().toISOString(),
        results: [await measure(1, 20), await measure(4, 20)],
        scope:
          "hash + verify, 1 warmup, synthetic input, baseline only; no SLA",
      },
      null,
      2,
    ),
  );
})().catch(() => {
  process.stderr.write("Benchmark failed\n");
  process.exitCode = 1;
});
