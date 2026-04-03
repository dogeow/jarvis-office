import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { dirname } from "path";

function pad(value) {
  return String(value).padStart(2, "0");
}

// 返回本地时间的 ISO 风格字符串，兼容前端和 Python 脚本解析
export function nowIso() {
  const date = new Date();
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 从文件加载 JSON，文件不存在时返回 defaultValue 的深拷贝
export async function loadJson(filepath, defaultValue) {
  try {
    if (existsSync(filepath)) {
      const content = await readFile(filepath, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return JSON.parse(JSON.stringify(defaultValue));
}

// 持久化 JSON 到文件（自动创建目录，格式化缩进 2 空格）
export async function saveJson(filepath, value) {
  mkdirSync(dirname(filepath), { recursive: true });
  await writeFile(filepath, JSON.stringify(value, null, 2), "utf-8");
}
