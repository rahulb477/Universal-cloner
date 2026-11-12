import { tick } from "./jobs";
import { ensureGateway } from "./preview";
import "./pipeline";

const g = globalThis as typeof globalThis & { __uwcBooted?: boolean };

export async function bootStudio() {
  if (g.__uwcBooted) return;
  g.__uwcBooted = true;
  try {
    ensureGateway();
    await tick();
  } catch (e) {
    console.error("[studio] start-up failed:", e);
  }
}
