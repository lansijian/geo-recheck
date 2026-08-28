import path from "node:path";

export function resolvePython(
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (process.env.GEORECHECK_PYTHON) return process.env.GEORECHECK_PYTHON;
  const relative =
    platform === "win32" ? path.join(".venv", "Scripts", "python.exe") : path.join(".venv", "bin", "python");
  return path.join(projectRoot, relative);
}
