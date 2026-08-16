import { shell, app, BrowserWindow, dialog, Menu, ipcMain } from "electron";
import { join, basename, dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readdir, lstat, stat as stat$1, access, mkdir as mkdir$1, rename as rename$1, rm, realpath, readlink, symlink, open, chmod, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import electronUpdater from "electron-updater";
import { spawn as spawn$1 } from "node-pty";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const NOISE_FILENAMES = /* @__PURE__ */ new Set([".DS_Store", "Icon\r"]);
async function listDir(path, opts) {
  let names;
  try {
    names = await readdir(path);
  } catch (err) {
    return { ok: false, error: mapError(err, path) };
  }
  const entries = [];
  for (const name of names) {
    if (NOISE_FILENAMES.has(name)) continue;
    const isDotHidden = name.startsWith(".");
    if (isDotHidden && !opts.showHidden) continue;
    const full = join(path, name);
    let stat2;
    try {
      stat2 = await lstat(full);
    } catch {
      continue;
    }
    const isSymlink = stat2.isSymbolicLink();
    let isRealDir = stat2.isDirectory();
    if (isSymlink) {
      try {
        isRealDir = (await stat$1(full)).isDirectory();
      } catch {
        isRealDir = false;
      }
    }
    const dotIdx = name.lastIndexOf(".");
    const hasExt = dotIdx > 0;
    const rawName = hasExt ? name.slice(0, dotIdx) : name;
    const ext = hasExt ? name.slice(dotIdx + 1) : "";
    const isAppBundle = isRealDir && ext === "app";
    entries.push({
      name: rawName,
      ext,
      isDir: isRealDir && !isAppBundle,
      isSymlink,
      isAppBundle,
      isHidden: isDotHidden,
      size: stat2.size,
      mtime: stat2.mtimeMs,
      mode: stat2.mode
    });
  }
  return { ok: true, value: entries };
}
function mapError(err, path) {
  const e = err;
  switch (e.code) {
    case "ENOENT":
      return { kind: "not-found", path };
    case "EACCES":
    case "EPERM":
      return { kind: "permission", path };
    case "ENOSPC":
      return { kind: "disk-full" };
    default:
      return { kind: "unknown", message: e.message ?? String(err) };
  }
}
async function stat(path) {
  try {
    const s = await lstat(path);
    const name = basename(path);
    const dotIdx = name.lastIndexOf(".");
    const hasExt = dotIdx > 0;
    const rawName = hasExt ? name.slice(0, dotIdx) : name;
    const ext = hasExt ? name.slice(dotIdx + 1) : "";
    const isSymlink = s.isSymbolicLink();
    let isRealDir = s.isDirectory();
    if (isSymlink) {
      try {
        isRealDir = (await stat$1(path)).isDirectory();
      } catch {
        isRealDir = false;
      }
    }
    const isAppBundle = isRealDir && ext === "app";
    return {
      ok: true,
      value: {
        name: rawName,
        ext,
        isDir: isRealDir && !isAppBundle,
        isSymlink,
        isAppBundle,
        isHidden: name.startsWith("."),
        size: s.size,
        mtime: s.mtimeMs,
        mode: s.mode
      }
    };
  } catch (err) {
    const e = err;
    const mapped = e.code === "ENOENT" ? { kind: "not-found", path } : e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path } : { kind: "unknown", message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function cloudVolumeNames(dirNames) {
  const visible = dirNames.filter((n) => !n.startsWith("."));
  const providerOf = (n) => n.split("-")[0];
  const counts = /* @__PURE__ */ new Map();
  for (const n of visible) {
    const p = providerOf(n);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return visible.map((dir) => {
    const p = providerOf(dir);
    return { dir, name: counts.get(p) === 1 ? p : dir };
  });
}
async function listVolumes() {
  const home = homedir();
  const vols = [
    { name: "Home", path: home, kind: "home" }
  ];
  const userFavorites = [
    { name: "Desktop", path: join(home, "Desktop") },
    { name: "Documents", path: join(home, "Documents") },
    { name: "Downloads", path: join(home, "Downloads") },
    { name: "Movies", path: join(home, "Movies") },
    { name: "Music", path: join(home, "Music") },
    { name: "Pictures", path: join(home, "Pictures") },
    { name: "iCloud Drive", path: join(home, "Library/Mobile Documents/com~apple~CloudDocs") }
  ];
  for (const f of userFavorites) vols.push({ ...f, kind: "home" });
  const cloudRoot = join(home, "Library/CloudStorage");
  try {
    for (const c of cloudVolumeNames(await readdir(cloudRoot))) {
      vols.push({ name: c.name, path: join(cloudRoot, c.dir), kind: "external" });
    }
  } catch {
  }
  if (await exists("/Applications")) {
    vols.push({ name: "Applications", path: "/Applications", kind: "home" });
  }
  vols.push({ name: "/", path: "/", kind: "root" });
  try {
    const names = await readdir("/Volumes");
    for (const name of names) {
      if (name.startsWith(".")) continue;
      vols.push({ name, path: `/Volumes/${name}`, kind: "external" });
    }
  } catch {
  }
  return vols;
}
async function mkdir(parent, name) {
  if (!name) return { ok: false, error: { kind: "name-invalid", reason: "empty name" } };
  if (name.includes("/") || name.includes("\0")) {
    return { ok: false, error: { kind: "name-invalid", reason: "contains invalid character" } };
  }
  const full = join(parent, name);
  try {
    await access(full);
    return { ok: false, error: { kind: "exists", path: full } };
  } catch {
  }
  try {
    await mkdir$1(full);
    return { ok: true, value: void 0 };
  } catch (err) {
    const e = err;
    const mapped = e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path: full } : e.code === "ENOSPC" ? { kind: "disk-full" } : e.code === "EEXIST" ? { kind: "exists", path: full } : { kind: "unknown", message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
async function rename(from, to) {
  const bn = basename(to);
  if (!bn) return { ok: false, error: { kind: "name-invalid", reason: "empty target name" } };
  if (bn.includes("\0")) {
    return { ok: false, error: { kind: "name-invalid", reason: "contains NUL" } };
  }
  try {
    await access(from);
  } catch {
    return { ok: false, error: { kind: "not-found", path: from } };
  }
  try {
    await access(to);
    return { ok: false, error: { kind: "exists", path: to } };
  } catch {
  }
  try {
    await rename$1(from, to);
    return { ok: true, value: void 0 };
  } catch (err) {
    const e = err;
    const mapped = e.code === "EXDEV" ? { kind: "cross-device", src: from, dst: to } : e.code === "ENOENT" ? { kind: "not-found", path: from } : e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path: from } : e.code === "ENOSPC" ? { kind: "disk-full" } : { kind: "unknown", message: e.message ?? String(err) };
    return { ok: false, error: mapped };
  }
}
async function trashPaths(paths) {
  for (const p of paths) {
    try {
      await shell.trashItem(p);
    } catch (err) {
      const e = err;
      const mapped = e.code === "ENOENT" ? { kind: "not-found", path: p } : e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path: p } : { kind: "unknown", message: e.message ?? String(err) };
      return { ok: false, error: mapped };
    }
  }
  return { ok: true, value: void 0 };
}
async function deletePaths(paths) {
  for (const p of paths) {
    try {
      await rm(p, { recursive: true, force: true });
    } catch (err) {
      const e = err;
      const mapped = e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path: p } : { kind: "unknown", message: e.message ?? String(err) };
      return { ok: false, error: mapped };
    }
  }
  return { ok: true, value: void 0 };
}
const CHUNK = 1024 * 1024;
function abortError() {
  return Object.assign(new Error("aborted"), { code: "ABORT" });
}
function mapFsError(err, path) {
  const e = err;
  return e.code === "ENOENT" ? { kind: "not-found", path } : e.code === "EACCES" || e.code === "EPERM" ? { kind: "permission", path } : e.code === "ENOSPC" ? { kind: "disk-full" } : { kind: "unknown", message: e.message ?? String(err) };
}
async function pathLstat(path) {
  try {
    return await lstat(path);
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT") return null;
    throw err;
  }
}
async function pathsAreSame(src, dst) {
  const [srcStat, dstStat] = await Promise.all([pathLstat(src), pathLstat(dst)]);
  return !!srcStat && !!dstStat && srcStat.dev === dstStat.dev && srcStat.ino === dstStat.ino;
}
async function pathsResolveToSameTarget(src, dst) {
  try {
    const [resolvedSrc, resolvedDst] = await Promise.all([realpath(src), realpath(dst)]);
    return resolvedSrc === resolvedDst;
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT" || e.code === "EINVAL" || e.code === "ELOOP") return false;
    throw err;
  }
}
async function cleanupPath(path) {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
  }
}
function makeSiblingTempPath(path, label) {
  return join(dirname(path), `.${basename(path)}.${label}.${randomUUID()}`);
}
async function canonicalizePath(path) {
  const absolutePath = resolve(path);
  const missingSegments = [];
  let current2 = absolutePath;
  while (true) {
    try {
      const resolvedPath = await realpath(current2);
      return missingSegments.reduceRight((acc, segment) => join(acc, segment), resolvedPath);
    } catch (err) {
      const e = err;
      if (e.code !== "ENOENT") throw err;
      const parent = dirname(current2);
      if (parent === current2) throw err;
      missingSegments.push(basename(current2));
      current2 = parent;
    }
  }
}
function isSameOrDescendantPath(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}
async function validateDirectoryDestination(src, dst) {
  const srcStat = await pathLstat(src);
  if (!srcStat?.isDirectory()) return { ok: true, value: void 0 };
  const [canonicalSource, canonicalDstParent] = await Promise.all([
    canonicalizePath(src),
    canonicalizePath(dirname(dst))
  ]);
  if (isSameOrDescendantPath(canonicalSource, canonicalDstParent)) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "Cannot copy a directory into itself or one of its descendants"
      }
    };
  }
  return { ok: true, value: void 0 };
}
async function preserveMetadata(path, srcStat) {
  if (!srcStat.isSymbolicLink()) {
    await chmod(path, srcStat.mode & 511);
    await utimes(path, srcStat.atime, srcStat.mtime);
    return;
  }
  const lutimesFn = (await import("node:fs/promises")).lutimes;
  if (typeof lutimesFn === "function") {
    try {
      await lutimesFn(path, srcStat.atime, srcStat.mtime);
    } catch {
    }
  }
}
async function writeAll(fileHandle, buffer, length) {
  let offset = 0;
  while (offset < length) {
    const { bytesWritten } = await fileHandle.write(buffer, offset, length - offset);
    if (bytesWritten <= 0) throw new Error("write returned no bytes");
    offset += bytesWritten;
  }
}
async function copyRegularFile(src, dst, srcStat, state, opts) {
  let srcFh;
  let dstFh;
  try {
    srcFh = await open(src, "r");
    dstFh = await open(dst, "wx", srcStat.mode & 511);
    const buf = Buffer.alloc(CHUNK);
    while (true) {
      if (opts.signal?.aborted) throw abortError();
      const { bytesRead } = await srcFh.read(buf, 0, CHUNK, null);
      if (bytesRead === 0) break;
      await writeAll(dstFh, buf, bytesRead);
      state.bytesDone += bytesRead;
      opts.onProgress(state.bytesDone);
    }
    await dstFh.sync();
  } finally {
    try {
      await srcFh?.close();
    } catch {
    }
    try {
      await dstFh?.close();
    } catch {
    }
  }
  await preserveMetadata(dst, srcStat);
}
async function copySymlink(src, dst, srcStat) {
  const target = await readlink(src);
  await symlink(target, dst);
  await preserveMetadata(dst, srcStat);
}
async function copyDirectory(src, dst, srcStat, state, opts) {
  await mkdir$1(dst, { recursive: false, mode: srcStat.mode & 511 });
  const entries = await readdir(src);
  for (const name of entries) {
    if (opts.signal?.aborted) throw abortError();
    await copyEntry(join(src, name), join(dst, name), state, opts);
  }
  await preserveMetadata(dst, srcStat);
}
async function copyEntry(src, dst, state, opts) {
  if (opts.signal?.aborted) throw abortError();
  const srcStat = await lstat(src);
  if (srcStat.isDirectory()) {
    await copyDirectory(src, dst, srcStat, state, opts);
    return;
  }
  if (srcStat.isSymbolicLink()) {
    await copySymlink(src, dst, srcStat);
    return;
  }
  if (!srcStat.isFile()) {
    throw new Error(`Unsupported file type at ${src}`);
  }
  await copyRegularFile(src, dst, srcStat, state, opts);
}
async function copyFile(src, dst, opts) {
  let tempDst = null;
  let backupDst = null;
  let replacedDst = false;
  let committed = false;
  try {
    if (await pathsAreSame(src, dst)) {
      return { ok: false, error: { kind: "exists", path: dst } };
    }
    if (await pathsResolveToSameTarget(src, dst)) {
      return { ok: false, error: { kind: "exists", path: dst } };
    }
    const destinationCheck = await validateDirectoryDestination(src, dst);
    if (!destinationCheck.ok) return destinationCheck;
    const initialDstStat = await pathLstat(dst);
    if (initialDstStat && !opts.overwrite) {
      return { ok: false, error: { kind: "exists", path: dst } };
    }
    await mkdir$1(dirname(dst), { recursive: true });
    tempDst = makeSiblingTempPath(dst, "gc-copy");
    const state = { bytesDone: 0 };
    await copyEntry(src, tempDst, state, opts);
    if (opts.signal?.aborted) throw abortError();
    const finalDstStat = await pathLstat(dst);
    if (finalDstStat) {
      if (await pathsAreSame(src, dst) || await pathsResolveToSameTarget(src, dst)) {
        return { ok: false, error: { kind: "exists", path: dst } };
      }
      if (!opts.overwrite) {
        return { ok: false, error: { kind: "exists", path: dst } };
      }
      backupDst = makeSiblingTempPath(dst, "gc-backup");
      await rename$1(dst, backupDst);
      replacedDst = true;
    }
    await rename$1(tempDst, dst);
    tempDst = null;
    committed = true;
    if (backupDst) {
      await cleanupPath(backupDst);
      backupDst = null;
    }
    return { ok: true, value: void 0 };
  } catch (err) {
    if (replacedDst && backupDst && !committed) {
      try {
        if (await pathLstat(backupDst)) {
          await rename$1(backupDst, dst);
          backupDst = null;
        }
      } catch (restoreErr) {
        return {
          ok: false,
          error: {
            kind: "unknown",
            message: `Failed to restore destination after copy failure: ${String(restoreErr)}`
          }
        };
      }
    }
    return { ok: false, error: mapFsError(err, src) };
  } finally {
    if (tempDst) await cleanupPath(tempDst);
    if (backupDst && committed) await cleanupPath(backupDst);
  }
}
async function findFreeName(parent, origName) {
  const dot = origName.lastIndexOf(".");
  const stem = dot > 0 ? origName.slice(0, dot) : origName;
  const ext = dot > 0 ? origName.slice(dot) : "";
  for (let n = 1; n < 999; n++) {
    const suffix = n === 1 ? " copy" : ` copy ${n}`;
    const candidate = `${stem}${suffix}${ext}`;
    try {
      await access(join(parent, candidate));
    } catch {
      return candidate;
    }
  }
  return `${stem} copy.${Date.now()}${ext}`;
}
async function duplicate(srcPath) {
  try {
    await access(srcPath);
  } catch {
    return { ok: false, error: { kind: "not-found", path: srcPath } };
  }
  const parent = dirname(srcPath);
  const name = basename(srcPath);
  const newName = await findFreeName(parent, name);
  const dst = join(parent, newName);
  const r = await copyFile(srcPath, dst, { onProgress: () => {
  }, signal: void 0, overwrite: false });
  if (!r.ok) {
    const e = r.error;
    return { ok: false, error: e };
  }
  return { ok: true, value: dst };
}
let current$1 = null;
function quickLook(path) {
  if (current$1) {
    const sameFile = current$1.path === path;
    try {
      current$1.proc.kill("SIGTERM");
    } catch {
    }
    current$1 = null;
    if (sameFile) return;
  }
  const proc = spawn("qlmanage", ["-p", path], { stdio: "ignore", detached: false });
  const token = { proc, path };
  current$1 = token;
  proc.on("exit", () => {
    if (current$1 === token) current$1 = null;
  });
}
async function openTerminal(path) {
  await new Promise((resolve2) => {
    const tryIterm = spawn("open", ["-a", "iTerm", path], { stdio: "ignore" });
    tryIterm.on("exit", (code) => {
      if (code === 0) return resolve2();
      const fallback = spawn("open", ["-a", "Terminal", path], { stdio: "ignore" });
      fallback.on("exit", () => resolve2());
    });
    tryIterm.on("error", () => {
      const fallback = spawn("open", ["-a", "Terminal", path], { stdio: "ignore" });
      fallback.on("exit", () => resolve2());
    });
  });
}
const MAX_OUTPUT = 2e5;
async function runCommand(cmd, cwd) {
  return new Promise((resolve2) => {
    const p = spawn("/bin/sh", ["-c", cmd], { cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(d).slice(0, MAX_OUTPUT - stdout.length);
    });
    p.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(d).slice(0, MAX_OUTPUT - stderr.length);
    });
    p.on("close", (code) => {
      resolve2({ stdout, stderr, exitCode: code ?? -1 });
    });
    p.on("error", (err) => {
      resolve2({ stdout, stderr: String(err), exitCode: -1 });
    });
  });
}
const DEFAULT_REPO = "grnd/grander-commander";
function latestFeedUrl(repo = DEFAULT_REPO) {
  return `https://github.com/${repo}/releases/latest/download`;
}
function tagFeedUrl(tag, repo = DEFAULT_REPO) {
  return `https://github.com/${repo}/releases/download/${tag}`;
}
function tagFromLatestRedirect(location) {
  if (!location) return null;
  const m = /\/releases\/tag\/([^/?#]+)/.exec(location);
  return m ? decodeURIComponent(m[1]) : null;
}
function releaseNotesUrl(version, repo = DEFAULT_REPO) {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${repo}/releases/tag/${tag}`;
}
const { autoUpdater } = electronUpdater;
let initialized = false;
let current = { kind: "idle" };
function broadcast(status) {
  current = status;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.webContents.isDestroyed()) w.webContents.send("update:status", status);
  }
}
function getUpdateStatus() {
  return current;
}
async function resolveLatestTag(repo) {
  try {
    const res = await fetch(`https://github.com/${repo}/releases/latest`, {
      method: "HEAD",
      redirect: "manual"
    });
    const direct = tagFromLatestRedirect(res.headers.get("location"));
    if (direct) return direct;
    return tagFromLatestRedirect(res.url);
  } catch {
    return null;
  }
}
function wireHandlers() {
  autoUpdater.on("update-available", (info) => {
    broadcast({ kind: "available", version: info.version, releaseUrl: releaseNotesUrl(info.version) });
  });
  autoUpdater.on("update-not-available", () => {
    broadcast({ kind: "up-to-date", checkedAt: Date.now() });
  });
  autoUpdater.on("download-progress", (p) => {
    broadcast({ kind: "downloading", percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    broadcast({ kind: "ready", version: info.version, releaseUrl: releaseNotesUrl(info.version) });
  });
  autoUpdater.on("error", (err) => {
    broadcast({ kind: "error", message: err?.message ?? String(err) });
  });
}
function initUpdater() {
  if (initialized) return;
  initialized = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => console.info("[updater]", m),
    warn: (m) => console.warn("[updater]", m),
    error: (m) => console.error("[updater]", m),
    debug: () => {
    }
  };
  wireHandlers();
}
async function checkForUpdates(repo = DEFAULT_REPO) {
  if (!app.isPackaged) {
    broadcast({ kind: "unsupported", reason: "Updates are disabled in development builds." });
    return current;
  }
  initUpdater();
  broadcast({ kind: "checking" });
  const tag = await resolveLatestTag(repo);
  autoUpdater.setFeedURL({
    provider: "generic",
    url: tag ? tagFeedUrl(tag, repo) : latestFeedUrl(repo)
  });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    broadcast({ kind: "error", message: err?.message ?? String(err) });
  }
  return current;
}
async function downloadUpdate() {
  if (!app.isPackaged) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    broadcast({ kind: "error", message: err?.message ?? String(err) });
  }
}
function quitAndInstall() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}
function openReleaseNotes() {
  const url = current.kind === "available" || current.kind === "ready" ? current.releaseUrl : null;
  if (url) void shell.openExternal(url);
}
const sessions = /* @__PURE__ */ new Map();
function resolveShell() {
  const envShell = process.env.SHELL;
  if (envShell) return { file: envShell, args: ["-l"] };
  if (process.platform === "win32") return { file: "powershell.exe", args: [] };
  return { file: "/bin/bash", args: ["-l"] };
}
function spawnTerminal(wc, cwd, cols, rows) {
  const { file, args } = resolveShell();
  const pty = spawn$1(file, args, {
    name: "xterm-256color",
    cols: Math.max(1, cols | 0),
    rows: Math.max(1, rows | 0),
    cwd,
    env: { ...process.env, TERM: "xterm-256color" }
  });
  const id = randomUUID();
  const dataChan = `term:data:${id}`;
  const exitChan = `term:exit:${id}`;
  const dataSub = pty.onData((data) => {
    if (!wc.isDestroyed()) wc.send(dataChan, data);
  });
  const exitSub = pty.onExit(({ exitCode, signal }) => {
    if (!wc.isDestroyed()) wc.send(exitChan, { exitCode, signal });
    sessions.delete(id);
  });
  sessions.set(id, { pty, wc, dataSub, exitSub });
  return id;
}
function writeTerminal(id, data) {
  const s = sessions.get(id);
  if (s) s.pty.write(data);
}
function resizeTerminal(id, cols, rows) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.pty.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
  } catch {
  }
}
function killTerminal(id) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    s.dataSub.dispose();
  } catch {
  }
  try {
    s.exitSub.dispose();
  } catch {
  }
  try {
    s.pty.kill();
  } catch {
  }
  sessions.delete(id);
}
function killAllForContents(wc) {
  for (const [id, s] of sessions) {
    if (s.wc === wc) killTerminal(id);
  }
}
function openDefault(path) {
  void shell.openPath(path);
}
async function openWithChooser(win, filePath) {
  const r = await dialog.showOpenDialog(win, {
    title: "Choose Application",
    defaultPath: "/Applications",
    buttonLabel: "Open",
    properties: ["openFile"],
    filters: [{ name: "Applications", extensions: ["app"] }]
  });
  if (r.canceled || r.filePaths.length === 0) return;
  const app2 = r.filePaths[0];
  spawn("open", ["-a", app2, filePath], { stdio: "ignore", detached: true }).unref();
}
function popupFileContext(win, args) {
  const { x, y, fullPath, isDir, isDotDot, isAppBundle } = args;
  const send = (cmd) => win.webContents.send("menu:command", cmd);
  const canOpenWith = !isDotDot && !isDir;
  const items = [
    { label: "Open", click: () => send("navigateInto"), enabled: !isDotDot },
    { label: "Open with Default App", click: () => openDefault(fullPath), enabled: !isDotDot },
    { label: "Open With…", click: () => void openWithChooser(win, fullPath), enabled: canOpenWith || isAppBundle },
    { label: "Reveal in Finder", click: () => shell.showItemInFolder(fullPath), enabled: !isDotDot },
    { type: "separator" },
    { label: "Copy", accelerator: "F5", click: () => send("copy"), enabled: !isDotDot },
    { label: "Move", accelerator: "F6", click: () => send("move"), enabled: !isDotDot },
    { label: "Duplicate", click: () => send("duplicate"), enabled: !isDotDot },
    { label: "Rename", accelerator: "F2", click: () => send("rename"), enabled: !isDotDot },
    { type: "separator" },
    { label: "Move to Trash", accelerator: "F8", click: () => send("trash"), enabled: !isDotDot },
    { label: "Delete Permanently…", accelerator: "Shift+F8", click: () => send("deleteCursorConfirm"), enabled: !isDotDot },
    { type: "separator" },
    { label: "Copy Full Path", click: () => send("copyPath"), enabled: !isDotDot },
    ...isDir && !isDotDot ? [{
      label: "Add to Favorites",
      click: () => send({ command: "addToFavorites", targetPath: fullPath })
    }] : []
  ];
  const menu = Menu.buildFromTemplate(items);
  menu.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}
class OpRunner {
  ops = /* @__PURE__ */ new Map();
  runningPromise = /* @__PURE__ */ new Map();
  start(op) {
    const id = randomUUID();
    const running = {
      id,
      op,
      controller: new AbortController(),
      subscribers: /* @__PURE__ */ new Set(),
      pendingConflict: null,
      overwriteAll: null,
      filesDone: 0,
      filesTotal: op.sources.length,
      bytesDone: 0,
      bytesTotal: 0
    };
    this.ops.set(id, running);
    this.runningPromise.set(id, Promise.resolve().then(() => this.run(running)));
    return id;
  }
  subscribe(id, cb) {
    const r = this.ops.get(id);
    if (!r) return () => {
    };
    r.subscribers.add(cb);
    return () => {
      r.subscribers.delete(cb);
    };
  }
  cancel(id) {
    const r = this.ops.get(id);
    if (!r) return;
    r.controller.abort();
    if (r.pendingConflict) {
      r.pendingConflict.resolve({ action: "cancel" });
      r.pendingConflict = null;
    }
  }
  answerConflict(id, a) {
    const r = this.ops.get(id);
    if (!r || !r.pendingConflict) return;
    if ((a.action === "overwrite" || a.action === "skip") && a.applyToAll) {
      r.overwriteAll = a.action;
    }
    r.pendingConflict.resolve(a);
    r.pendingConflict = null;
  }
  async await(id) {
    const p = this.runningPromise.get(id);
    if (p) await p;
  }
  emit(r, e) {
    for (const s of r.subscribers) s(e);
  }
  async sizeOf(path) {
    try {
      const s = await stat$1(path);
      if (s.isDirectory()) {
        const entries = await readdir(path);
        let total = 0;
        for (const entry of entries) total += await this.sizeOf(join(path, entry));
        return total;
      }
      return s.size;
    } catch {
      return 0;
    }
  }
  isValidBasename(name) {
    return !!name && name === basename(name) && name !== "." && name !== ".." && !name.includes("\0");
  }
  async run(r) {
    try {
      for (const src of r.op.sources) r.bytesTotal += await this.sizeOf(src);
      for (const src of r.op.sources) {
        if (r.controller.signal.aborted) {
          this.emit(r, { kind: "cancelled", filesDone: r.filesDone, bytesDone: r.bytesDone });
          return;
        }
        const name = basename(src);
        const dst = join(r.op.dst, name);
        const didSkip = await this.processOne(r, src, dst);
        r.filesDone += didSkip ? 0 : 1;
      }
      if (r.controller.signal.aborted) {
        this.emit(r, { kind: "cancelled", filesDone: r.filesDone, bytesDone: r.bytesDone });
      } else {
        this.emit(r, { kind: "complete", filesDone: r.filesDone, bytesDone: r.bytesDone });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "cancelled" || msg === "copyFile failed" || msg === "trashPaths failed" || msg === "rename answer invalid") {
        return;
      }
      this.emit(r, { kind: "error", error: { kind: "unknown", message: msg }, path: "" });
    } finally {
      setTimeout(() => {
        this.ops.delete(r.id);
        this.runningPromise.delete(r.id);
      }, 5e3);
    }
  }
  /** Returns true if the file was SKIPPED (not counted). */
  async processOne(r, src, initialDst) {
    let dst = initialDst;
    let overwriteThis = false;
    let dstExists = false;
    try {
      await stat$1(dst);
      dstExists = true;
    } catch {
    }
    if (dstExists) {
      if (r.overwriteAll === "overwrite") {
        overwriteThis = true;
      } else if (r.overwriteAll === "skip") {
        return true;
      } else {
        this.emit(r, { kind: "conflict", srcPath: src, dstPath: dst });
        const answer = await new Promise((resolve2) => {
          r.pendingConflict = { resolve: resolve2 };
        });
        if (answer.action === "cancel" || r.controller.signal.aborted) {
          this.emit(r, { kind: "cancelled", filesDone: r.filesDone, bytesDone: r.bytesDone });
          throw new Error("cancelled");
        }
        if (answer.action === "skip") return true;
        if (answer.action === "rename") {
          if (!this.isValidBasename(answer.newName)) {
            this.emit(r, {
              kind: "error",
              error: { kind: "name-invalid", reason: "rename target must be a basename" },
              path: initialDst
            });
            throw new Error("rename answer invalid");
          }
          dst = join(r.op.dst, answer.newName);
          let renamedDstExists = true;
          try {
            await stat$1(dst);
          } catch (err) {
            const e = err;
            if (e.code && e.code !== "ENOENT") throw err;
            renamedDstExists = false;
          }
          if (renamedDstExists) {
            this.emit(r, { kind: "error", error: { kind: "exists", path: dst }, path: dst });
            throw new Error("rename answer invalid");
          }
          overwriteThis = false;
        }
        if (answer.action === "overwrite") overwriteThis = true;
      }
    }
    if (r.op.kind === "move" && !overwriteThis) {
      try {
        await rename$1(src, dst);
        return false;
      } catch (err) {
        const e = err;
        if (e.code !== "EXDEV") throw err;
      }
    }
    try {
      await mkdir$1(r.op.dst, { recursive: true });
    } catch {
    }
    const cpRes = await copyFile(src, dst, {
      overwrite: overwriteThis,
      signal: r.controller.signal,
      onProgress: (n) => {
        this.emit(r, {
          kind: "progress",
          bytesDone: r.bytesDone + n,
          bytesTotal: r.bytesTotal,
          filesDone: r.filesDone,
          filesTotal: r.filesTotal,
          currentFile: basename(src)
        });
      }
    });
    if (!cpRes.ok) {
      if (r.controller.signal.aborted) {
        this.emit(r, { kind: "cancelled", filesDone: r.filesDone, bytesDone: r.bytesDone });
      } else {
        this.emit(r, { kind: "error", error: cpRes.error, path: src });
      }
      throw new Error("copyFile failed");
    }
    const sz = await this.sizeOf(src);
    r.bytesDone += sz;
    if (r.op.kind === "move") {
      const trashRes = await trashPaths([src]);
      if (!trashRes.ok) {
        this.emit(r, { kind: "error", error: trashRes.error, path: src });
        throw new Error("trashPaths failed");
      }
    }
    return false;
  }
}
const runner = new OpRunner();
const MAX_PATH_LENGTH = 4096;
const MAX_BASENAME_LENGTH = 255;
const MAX_PATHS_PER_REQUEST = 1024;
const MAX_COMMAND_LENGTH = 8e3;
const MAX_TERMINAL_DATA_LENGTH = 64e3;
const MAX_TERMINAL_DIMENSION = 1e3;
const MAX_MENU_COORDINATE = 1e5;
const MAX_BUFFERED_OP_EVENTS = 32;
const OP_BRIDGE_RETENTION_MS = 5e3;
const opBridges = /* @__PURE__ */ new Map();
const ownerOpIds = /* @__PURE__ */ new Map();
const watchedOpOwners = /* @__PURE__ */ new Set();
function expectedPackagedRendererUrl() {
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}
function allowedDevRendererOrigin() {
  if (app.isPackaged) return null;
  const raw = process.env.ELECTRON_RENDERER_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
function isTrustedRendererUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return false;
  let actual;
  try {
    actual = new URL(rawUrl);
  } catch {
    return false;
  }
  const devOrigin = allowedDevRendererOrigin();
  if (devOrigin && actual.origin === devOrigin) return true;
  const expected = expectedPackagedRendererUrl();
  return actual.protocol === expected.protocol && actual.origin === expected.origin && actual.pathname === expected.pathname;
}
function assertTrustedSender(event) {
  const url = event.senderFrame.url;
  if (!isTrustedRendererUrl(url)) {
    throw new Error(`Untrusted IPC sender: ${url || "<empty>"}`);
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function expectString(value, name, opts = {}) {
  const { allowEmpty = false, maxLength = MAX_PATH_LENGTH } = opts;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  if (!allowEmpty && value.length === 0) throw new RangeError(`${name} must not be empty`);
  if (value.length > maxLength) throw new RangeError(`${name} is too long`);
  return value;
}
function expectStringArray(value, name, opts = {}) {
  const { maxItems = MAX_PATHS_PER_REQUEST, maxItemLength = MAX_PATH_LENGTH } = opts;
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > maxItems) throw new RangeError(`${name} has too many items`);
  return value.map((item, index) => expectString(item, `${name}[${index}]`, { maxLength: maxItemLength }));
}
function expectBoolean(value, name) {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
  return value;
}
function expectInteger(value, name, opts) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  if (value < opts.min || value > opts.max) {
    throw new RangeError(`${name} must be between ${opts.min} and ${opts.max}`);
  }
  return value;
}
function expectArgs(args, channel, count) {
  if (args.length !== count) {
    throw new TypeError(`${channel} expected ${count} argument(s), received ${args.length}`);
  }
}
function validateListDirOptions(value) {
  if (!isRecord(value)) throw new TypeError("opts must be an object");
  return { showHidden: expectBoolean(value.showHidden, "opts.showHidden") };
}
function validateFileContextArgs(value) {
  if (!isRecord(value)) throw new TypeError("args must be an object");
  return {
    x: expectInteger(value.x, "args.x", { min: -MAX_MENU_COORDINATE, max: MAX_MENU_COORDINATE }),
    y: expectInteger(value.y, "args.y", { min: -MAX_MENU_COORDINATE, max: MAX_MENU_COORDINATE }),
    fullPath: expectString(value.fullPath, "args.fullPath"),
    isDir: expectBoolean(value.isDir, "args.isDir"),
    isDotDot: expectBoolean(value.isDotDot, "args.isDotDot"),
    isAppBundle: expectBoolean(value.isAppBundle, "args.isAppBundle")
  };
}
function validateFileOpPayload(value) {
  if (!isRecord(value)) throw new TypeError("op must be an object");
  const kind = value.kind;
  if (kind !== "copy" && kind !== "move") throw new TypeError("op.kind must be copy or move");
  return {
    kind,
    sources: expectStringArray(value.sources, "op.sources"),
    dst: expectString(value.dst, "op.dst")
  };
}
function validateConflictAnswerPayload(value) {
  if (!isRecord(value)) throw new TypeError("answer must be an object");
  switch (value.action) {
    case "overwrite":
    case "skip":
      return {
        action: value.action,
        applyToAll: expectBoolean(value.applyToAll, "answer.applyToAll")
      };
    case "rename":
      return {
        action: "rename",
        newName: expectString(value.newName, "answer.newName", { maxLength: MAX_BASENAME_LENGTH }),
        applyToAll: false
      };
    case "cancel":
      return { action: "cancel" };
    default:
      throw new TypeError("answer.action must be overwrite, skip, rename, or cancel");
  }
}
function handleValidated(channel, validateArgs, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...validateArgs(args));
  });
}
function isTerminalOpEvent(event) {
  return event.kind === "complete" || event.kind === "cancelled" || event.kind === "error";
}
function rememberOwnerOp(ownerId, id) {
  const ids = ownerOpIds.get(ownerId);
  if (ids) {
    ids.add(id);
    return;
  }
  ownerOpIds.set(ownerId, /* @__PURE__ */ new Set([id]));
}
function forgetOwnerOp(ownerId, id) {
  const ids = ownerOpIds.get(ownerId);
  if (!ids) return;
  ids.delete(id);
  if (ids.size === 0) ownerOpIds.delete(ownerId);
}
function disposeOpBridge(id) {
  const bridge = opBridges.get(id);
  if (!bridge) return;
  if (bridge.cleanupTimer) clearTimeout(bridge.cleanupTimer);
  bridge.runnerUnsubscribe();
  opBridges.delete(id);
  forgetOwnerOp(bridge.owner.id, id);
}
function cleanupOwnerOpBridges(ownerId) {
  const ids = ownerOpIds.get(ownerId);
  if (ids) {
    for (const id of [...ids]) {
      runner.cancel(id);
      disposeOpBridge(id);
    }
  }
  watchedOpOwners.delete(ownerId);
}
function ensureOpOwnership(sender, id) {
  const bridge = opBridges.get(id);
  if (!bridge) return null;
  if (bridge.owner.id !== sender.id) {
    throw new Error(`Operation ${id} belongs to a different renderer`);
  }
  return bridge;
}
function scheduleOpBridgeCleanup(id) {
  const bridge = opBridges.get(id);
  if (!bridge) return;
  if (bridge.cleanupTimer) clearTimeout(bridge.cleanupTimer);
  bridge.cleanupTimer = setTimeout(() => disposeOpBridge(id), OP_BRIDGE_RETENTION_MS);
}
function bufferOpEvent(bridge, event) {
  if (event.kind === "progress") {
    const last = bridge.buffer[bridge.buffer.length - 1];
    if (last?.kind === "progress") bridge.buffer[bridge.buffer.length - 1] = event;
    else bridge.buffer.push(event);
  } else {
    bridge.buffer.push(event);
  }
  while (bridge.buffer.length > MAX_BUFFERED_OP_EVENTS) {
    const progressIndex = bridge.buffer.findIndex((entry) => entry.kind === "progress");
    if (progressIndex >= 0) bridge.buffer.splice(progressIndex, 1);
    else bridge.buffer.shift();
  }
}
function sendOpEvent(id, bridge, event) {
  if (bridge.owner.isDestroyed()) {
    disposeOpBridge(id);
    return;
  }
  bridge.owner.send(`ops:event:${id}`, event);
}
function forwardOpEvent(id, event) {
  const bridge = opBridges.get(id);
  if (!bridge) return;
  if (bridge.ready) sendOpEvent(id, bridge, event);
  else bufferOpEvent(bridge, event);
  if (isTerminalOpEvent(event)) scheduleOpBridgeCleanup(id);
}
function registerIpc() {
  handleValidated("fs:listDir", (args) => {
    expectArgs(args, "fs:listDir", 2);
    return [
      expectString(args[0], "path"),
      validateListDirOptions(args[1])
    ];
  }, (_e, path, opts) => listDir(path, opts));
  handleValidated("fs:stat", (args) => {
    expectArgs(args, "fs:stat", 1);
    return [expectString(args[0], "path")];
  }, (_e, path) => stat(path));
  handleValidated("fs:mkdir", (args) => {
    expectArgs(args, "fs:mkdir", 2);
    return [
      expectString(args[0], "parent"),
      expectString(args[1], "name", { maxLength: MAX_BASENAME_LENGTH })
    ];
  }, (_e, parent, name) => mkdir(parent, name));
  handleValidated("fs:rename", (args) => {
    expectArgs(args, "fs:rename", 2);
    return [
      expectString(args[0], "from"),
      expectString(args[1], "to")
    ];
  }, (_e, from, to) => rename(from, to));
  handleValidated("fs:trash", (args) => {
    expectArgs(args, "fs:trash", 1);
    return [expectStringArray(args[0], "paths")];
  }, (_e, paths) => trashPaths(paths));
  handleValidated("fs:delete", (args) => {
    expectArgs(args, "fs:delete", 1);
    return [expectStringArray(args[0], "paths")];
  }, (_e, paths) => deletePaths(paths));
  handleValidated("fs:duplicate", (args) => {
    expectArgs(args, "fs:duplicate", 1);
    return [expectString(args[0], "path")];
  }, (_e, path) => duplicate(path));
  handleValidated("volumes:list", (args) => {
    expectArgs(args, "volumes:list", 0);
    return [];
  }, () => listVolumes());
  handleValidated("shell:openPath", (args) => {
    expectArgs(args, "shell:openPath", 1);
    return [expectString(args[0], "path")];
  }, (_e, path) => shell.openPath(path));
  handleValidated("shell:quickLook", (args) => {
    expectArgs(args, "shell:quickLook", 1);
    return [expectString(args[0], "path")];
  }, (_e, path) => {
    quickLook(path);
  });
  handleValidated("shell:openTerminal", (args) => {
    expectArgs(args, "shell:openTerminal", 1);
    return [expectString(args[0], "path")];
  }, (_e, path) => openTerminal(path));
  handleValidated("shell:runCommand", (args) => {
    expectArgs(args, "shell:runCommand", 2);
    return [
      expectString(args[0], "cmd", { maxLength: MAX_COMMAND_LENGTH }),
      expectString(args[1], "cwd")
    ];
  }, (_e, cmd, cwd) => runCommand(cmd, cwd));
  handleValidated("term:spawn", (args) => {
    expectArgs(args, "term:spawn", 3);
    return [
      expectString(args[0], "cwd"),
      expectInteger(args[1], "cols", { min: 1, max: MAX_TERMINAL_DIMENSION }),
      expectInteger(args[2], "rows", { min: 1, max: MAX_TERMINAL_DIMENSION })
    ];
  }, (e, cwd, cols, rows) => {
    const id = spawnTerminal(e.sender, cwd, cols, rows);
    e.sender.once("destroyed", () => killAllForContents(e.sender));
    return id;
  });
  handleValidated("term:write", (args) => {
    expectArgs(args, "term:write", 2);
    return [
      expectString(args[0], "id", { maxLength: 128 }),
      expectString(args[1], "data", { allowEmpty: true, maxLength: MAX_TERMINAL_DATA_LENGTH })
    ];
  }, (_e, id, data) => writeTerminal(id, data));
  handleValidated("term:resize", (args) => {
    expectArgs(args, "term:resize", 3);
    return [
      expectString(args[0], "id", { maxLength: 128 }),
      expectInteger(args[1], "cols", { min: 1, max: MAX_TERMINAL_DIMENSION }),
      expectInteger(args[2], "rows", { min: 1, max: MAX_TERMINAL_DIMENSION })
    ];
  }, (_e, id, cols, rows) => resizeTerminal(id, cols, rows));
  handleValidated("term:kill", (args) => {
    expectArgs(args, "term:kill", 1);
    return [expectString(args[0], "id", { maxLength: 128 })];
  }, (_e, id) => killTerminal(id));
  handleValidated("menu:popupFileContext", (args) => {
    expectArgs(args, "menu:popupFileContext", 1);
    return [validateFileContextArgs(args[0])];
  }, (e, args) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) popupFileContext(win, args);
  });
  handleValidated("ops:start", (args) => {
    expectArgs(args, "ops:start", 1);
    return [validateFileOpPayload(args[0])];
  }, (e, op) => {
    const id = runner.start(op);
    const wc = e.sender;
    if (!watchedOpOwners.has(wc.id)) {
      watchedOpOwners.add(wc.id);
      wc.once("destroyed", () => cleanupOwnerOpBridges(wc.id));
    }
    const bridge = {
      owner: wc,
      ready: false,
      buffer: [],
      runnerUnsubscribe: () => {
      },
      cleanupTimer: null
    };
    opBridges.set(id, bridge);
    rememberOwnerOp(wc.id, id);
    bridge.runnerUnsubscribe = runner.subscribe(id, (ev) => forwardOpEvent(id, ev));
    return id;
  });
  handleValidated("ops:subscribe", (args) => {
    expectArgs(args, "ops:subscribe", 1);
    return [expectString(args[0], "id", { maxLength: 128 })];
  }, (e, id) => {
    const bridge = ensureOpOwnership(e.sender, id);
    if (!bridge) return;
    bridge.ready = true;
    const buffered = bridge.buffer.slice();
    bridge.buffer.length = 0;
    for (const event of buffered) sendOpEvent(id, bridge, event);
  });
  handleValidated("ops:unsubscribe", (args) => {
    expectArgs(args, "ops:unsubscribe", 1);
    return [expectString(args[0], "id", { maxLength: 128 })];
  }, (e, id) => {
    const bridge = ensureOpOwnership(e.sender, id);
    if (!bridge) return;
    runner.cancel(id);
    disposeOpBridge(id);
  });
  handleValidated("ops:cancel", (args) => {
    expectArgs(args, "ops:cancel", 1);
    return [expectString(args[0], "id", { maxLength: 128 })];
  }, (e, id) => {
    if (!ensureOpOwnership(e.sender, id)) return;
    runner.cancel(id);
  });
  handleValidated("ops:answerConflict", (args) => {
    expectArgs(args, "ops:answerConflict", 2);
    return [
      expectString(args[0], "id", { maxLength: 128 }),
      validateConflictAnswerPayload(args[1])
    ];
  }, (e, id, a) => {
    if (!ensureOpOwnership(e.sender, id)) return;
    runner.answerConflict(id, a);
  });
  handleValidated("update:check", (args) => {
    expectArgs(args, "update:check", 0);
    return [];
  }, () => checkForUpdates());
  handleValidated("update:download", (args) => {
    expectArgs(args, "update:download", 0);
    return [];
  }, () => downloadUpdate());
  handleValidated("update:install", (args) => {
    expectArgs(args, "update:install", 0);
    return [];
  }, () => quitAndInstall());
  handleValidated("update:status", (args) => {
    expectArgs(args, "update:status", 0);
    return [];
  }, () => getUpdateStatus());
  handleValidated("update:releaseNotes", (args) => {
    expectArgs(args, "update:releaseNotes", 0);
    return [];
  }, () => openReleaseNotes());
}
function sendMenuCommand(win, command) {
  win?.webContents.send("menu:command", command);
}
function buildMenuTemplate() {
  const isMac = process.platform === "darwin";
  return [
    ...isMac ? [{
      label: "Grander Commander",
      submenu: [
        { role: "about" },
        { label: "Check for Updates…", click: () => void checkForUpdates() },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : [],
    {
      label: "Files",
      submenu: [
        {
          label: "New Folder",
          accelerator: "CmdOrCtrl+N",
          click: (_i, w) => sendMenuCommand(w, "mkdir")
        },
        {
          label: "Rename",
          accelerator: "CmdOrCtrl+Shift+R",
          click: (_i, w) => sendMenuCommand(w, "rename")
        },
        { type: "separator" },
        {
          label: "Copy",
          accelerator: "F5",
          click: (_i, w) => sendMenuCommand(w, "copy")
        },
        {
          label: "Move",
          accelerator: "F6",
          click: (_i, w) => sendMenuCommand(w, "move")
        },
        {
          label: "Move to Trash",
          accelerator: "F8",
          click: (_i, w) => sendMenuCommand(w, "trash")
        },
        {
          label: "Delete Permanently…",
          accelerator: "Shift+F8",
          click: (_i, w) => sendMenuCommand(w, "deleteConfirm")
        }
      ]
    },
    {
      label: "Show",
      submenu: [
        {
          label: "Toggle Hidden Files",
          accelerator: "Ctrl+H",
          click: (_i, w) => sendMenuCommand(w, "toggleHidden")
        },
        { role: "reload" },
        { role: "toggleDevTools" }
      ]
    },
    { role: "windowMenu" }
  ];
}
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}
function installProductionWindowGuards(win) {
  if (!app.isPackaged) return;
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
function getRendererLoadTarget() {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    return { kind: "url", target: devUrl };
  }
  return { kind: "file", target: join(__dirname, "../renderer/index.html") };
}
async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Grander Commander",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  installProductionWindowGuards(win);
  const target = getRendererLoadTarget();
  if (target.kind === "url") {
    await win.loadURL(target.target);
  } else {
    await win.loadFile(target.target);
  }
}
app.whenReady().then(async () => {
  buildMenu();
  registerIpc();
  initUpdater();
  await createWindow();
  setTimeout(() => void checkForUpdates(), 4e3);
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
export {
  buildMenuTemplate,
  getRendererLoadTarget,
  installProductionWindowGuards
};
