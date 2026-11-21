// Locate external engines even when the desktop shell did not inherit a fresh
// PATH. Checks an explicit env var, the shell PATH, then common install spots
// including WinGet's package folders.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

function walk(root, target, depth = 0) {
  if (depth > 6 || !existsSync(root)) return null;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === target.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const found = walk(full, target, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function wingetPackages(prefixes, exeName) {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  let entries = [];
  try {
    entries = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return null;
  }
  for (const prefix of prefixes) {
    const match = entries.find((entry) => entry.name.toLowerCase().startsWith(prefix.toLowerCase()));
    if (!match) continue;
    const found = walk(path.join(base, match.name), exeName);
    if (found) return found;
  }
  return null;
}

export function findExecutable(name, envKey, wingetPrefixes = []) {
  if (envKey && process.env[envKey] && existsSync(process.env[envKey])) return process.env[envKey];
  if (process.platform === 'win32') {
    try {
      const found = execFileSync('where.exe', [name], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && existsSync(line));
      if (found) return found;
    } catch {
      /* fall through */
    }

    const exeName = `${name}.exe`;
    const links = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', exeName);
    if (existsSync(links)) return links;

    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', name, exeName),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', name, 'bin', exeName),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin', exeName),
      path.join('C:\\', 'ffmpeg', 'bin', exeName),
      path.join('C:\\', 'tools', name, exeName),
    ];
    const hit = candidates.find((candidate) => existsSync(candidate));
    if (hit) return hit;

    const packaged = wingetPackages(wingetPrefixes, exeName);
    if (packaged) return packaged;
  }
  return name;
}
