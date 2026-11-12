import fs from "node:fs";
import type { Browser } from "playwright-core";

export type BrowserInfo = { source: string; version: string };

/**
 * Launch headless Chromium. Resolution order:
 *   1. CHROMIUM_EXECUTABLE_PATH (any Chrome/Chromium build you manage)
 *   2. a browser installed with `npx playwright install chromium`
 *   3. the Chromium build bundled in @sparticuz/chromium (no system packages needed)
 */
export async function launchBrowser(): Promise<{ browser: Browser; info: BrowserInfo }> {
  const { chromium } = await import("playwright-core");
  const errors: string[] = [];
  const baseArgs = ["--disable-dev-shm-usage", "--no-first-run", "--mute-audio"];
  const custom = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (custom) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ custom)) throw new Error(`CHROMIUM_EXECUTABLE_PATH does not exist: ${custom}`);
    const browser = await chromium.launch({ executablePath: custom, headless: true, args: [...baseArgs, "--no-sandbox"] });
    return { browser, info: { source: "CHROMIUM_EXECUTABLE_PATH", version: browser.version() } };
  }
  try {
    const browser = await chromium.launch({ headless: true, args: baseArgs });
    return { browser, info: { source: "playwright", version: browser.version() } };
  } catch (e) {
    errors.push(`playwright: ${(e as Error).message.split("\n")[0]}`);
  }
  // The bundled build ships its shared libraries for AWS Lambda; this flag makes it unpack them anywhere.
  process.env.AWS_EXECUTION_ENV ||= "AWS_Lambda_nodejs22.x";
  // A launch right after another browser exits can fail transiently, so it is attempted up to three times.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sparticuz = (await import("@sparticuz/chromium")).default;
      const executablePath = await sparticuz.executablePath();
      const drop = /^--(disable-web-security|allow-running-insecure-content|single-process|no-zygote)/;
      const args = sparticuz.args.filter((a: string) => !drop.test(a));
      const browser = await chromium.launch({ executablePath, headless: true, args: [...args, ...baseArgs] });
      return { browser, info: { source: "bundled (@sparticuz/chromium)", version: browser.version() } };
    } catch (e) {
      if (attempt === 3) errors.push(`bundled: ${(e as Error).message.split("\n")[0]}`);
      else await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error(
    `No Chromium browser could be launched. Run "npx playwright install chromium --with-deps" or set CHROMIUM_EXECUTABLE_PATH. Details: ${errors.join(" | ")}`,
  );
}
