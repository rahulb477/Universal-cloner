/** Server start-up: recover interrupted jobs, start the queue and open the preview gateway. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootStudio } = await import("./lib/studio/boot");
  await bootStudio();
}
