import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export function nowIso() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export async function loadJson(filepath, defaultValue) {
  try {
    if (existsSync(filepath)) {
      const content = await readFile(filepath, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return JSON.parse(JSON.stringify(defaultValue));
}

export async function saveJson(filepath, value) {
  mkdirSync(dirname(filepath), { recursive: true });
  await writeFile(filepath, JSON.stringify(value, null, 2), "utf-8");
}
