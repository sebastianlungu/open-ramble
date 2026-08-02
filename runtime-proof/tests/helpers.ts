import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { randomBytes, createHash } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"

export const TEMP_BASE = process.env.RUNTIME_PROOF_TEMP ?? "/var/folders/rr/jvph_g6n153d1l4cs32ctmxc0000gn/T/opencode/runtime-proof"

export function getPinnedBinaryPath(): string {
  const p = resolve(TEMP_BASE, "bin", "opencode")
  if (!existsSync(p)) throw new Error(`Pinned binary not found at ${p}.`)
  return p
}

export function getManifestPath(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "compatibility-manifest.json")
}

export function readManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(getManifestPath(), "utf-8"))
}

export function sha256Of(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

export function randomPassword(length = 16): string {
  return randomBytes(length).toString("base64url")
}

export function basicAuthHeader(password: string): string {
  const encoded = Buffer.from(`opencode:${password}`).toString("base64")
  return `Basic ${encoded}`
}

export function sanitizeEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  }
  for (const [k, v] of Object.entries(extra)) {
    env[k] = v
  }
  return env
}

export function makeCanaryDir(basePath: string): string {
  const canaryDir = resolve(basePath, "canary")
  mkdirSync(resolve(canaryDir, ".opencode", "providers"), { recursive: true })
  const configPath = resolve(canaryDir, ".opencode", "opencode.jsonc")
  writeFileSync(configPath, JSON.stringify({
    model: "canary-model-should-not-load",
    provider: {
      "canary-provider": {
        api: "https://canary.example.com",
        models: {
          "canary-model": { id: "canary-model" }
        }
      }
    }
  }, null, 2))
  writeFileSync(resolve(canaryDir, ".opencode", "providers", "canary-provider.json"), JSON.stringify({
    type: "api", key: "sk-canary-should-not-exist"
  }, null, 2))
  writeFileSync(resolve(canaryDir, ".opencode", "credentials.json"), JSON.stringify({
    canary: { type: "api", key: "sk-credentials-canary" }
  }, null, 2))
  return canaryDir
}

export interface ServerHandle {
  process: ChildProcess
  port: number
  password: string
  env: Record<string, string>
  workDir: string
  projectDir: string
  canaryDir?: string
}

export async function startServer(binary: string, extraOpts?: { profileDir?: string; extraEnv?: Record<string, string> }): Promise<ServerHandle> {
  const port = await findFreePort()
  const password = randomPassword()

  const workDir = resolve(TEMP_BASE, "work", `proof-${port}-${randomBytes(4).toString("hex")}`)
  const xdgConfig = resolve(workDir, "config")
  const xdgData = resolve(workDir, "data")
  const xdgCache = resolve(workDir, "cache")
  const xdgState = resolve(workDir, "state")
  const homeDir = resolve(workDir, "home")
  const projectDir = resolve(workDir, "project")

  const canaryDir = makeCanaryDir(resolve(TEMP_BASE, "canary"))
  const profileDir = extraOpts?.profileDir
  const activeConfig = profileDir ?? xdgConfig
  const activeData = profileDir ? resolve(profileDir, "data") : xdgData
  const opencodeConfigDir = resolve(activeConfig, "opencode")
  const opencodeDataDir = resolve(activeData, "opencode")

  for (const d of [workDir, xdgConfig, xdgData, xdgCache, xdgState, homeDir, projectDir, opencodeConfigDir, opencodeDataDir]) {
    mkdirSync(d, { recursive: true })
  }

  if (!profileDir) {
    writeFileSync(resolve(opencodeConfigDir, "opencode.jsonc"), JSON.stringify({
      server: { port, hostname: "127.0.0.1" },
    }, null, 2))
  }

  const dotOpencode = resolve(projectDir, ".opencode")
  if (existsSync(dotOpencode)) {
    throw new Error(`Project dir ${projectDir} already contains .opencode`)
  }

  const env = sanitizeEnv({
    HOME: homeDir,
    XDG_CONFIG_HOME: activeConfig,
    XDG_DATA_HOME: activeData,
    XDG_CACHE_HOME: xdgCache,
    XDG_STATE_HOME: xdgState,
    OPENCODE_DATA_DIR: opencodeDataDir,
    OPENCODE_CONFIG_DIR: opencodeConfigDir,
    OPENCODE_SERVER_URL: `http://127.0.0.1:${port}`,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_SERVER_PORT: String(port),
    TMPDIR: resolve(workDir, "tmp"),
    RUNTIME_PROOF_PORT: String(port),
    RUNTIME_PROOF_WORKDIR: workDir,
    ...extraOpts?.extraEnv,
  })

  mkdirSync(env.TMPDIR, { recursive: true })

  const child = spawn(binary, [
    "serve",
    "--port", String(port),
    "--hostname", "127.0.0.1",
    "--pure",
    "--print-logs",
  ], {
    env,
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  })

  if (!child.pid) {
    child.kill()
    throw new Error("Failed to spawn server process")
  }

  const deadline = Date.now() + 45000
  const authHeader = basicAuthHeader(password)

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(3000),
      })
      if (resp.ok) {
        return { process: child, port, password, env, workDir, projectDir, canaryDir }
      }
    } catch {
      await sleep(300)
    }
  }

  child.kill("SIGKILL")
  const stderr = child.stderr?.read()?.toString() ?? ""
  throw new Error(`Server did not start within 45s on port ${port}. stderr: ${stderr.slice(0, 500)}`)
}

export async function deleteAllSessions(handle: ServerHandle): Promise<void> {
  try {
    const authHeaderValue = basicAuthHeader(handle.password)
    const listResp = await fetch(`http://127.0.0.1:${handle.port}/api/session`, {
      headers: { Authorization: authHeaderValue },
      signal: AbortSignal.timeout(5000),
    })
    if (!listResp.ok) return
    const body = await listResp.json() as { data?: Array<{ id: string }> }
    const ids = (body.data ?? []).map((s: { id: string }) => s.id)
    for (const id of ids) {
      try {
        await fetch(`http://127.0.0.1:${handle.port}/api/session/${id}`, {
          method: "DELETE",
          headers: { Authorization: authHeaderValue },
          signal: AbortSignal.timeout(5000),
        })
      } catch { }
    }
  } catch { }
}

export async function stopServer(handle: ServerHandle, keepProfile?: boolean): Promise<void> {
  const pid = handle.process.pid
  if (!pid) return

  try { process.kill(pid, "SIGTERM") } catch { }
  await waitForProcessExit(pid, 5000)
  try { process.kill(pid, "SIGKILL") } catch { }
  await waitForProcessExit(pid, 2000)

  for (let i = 0; i < 30; i++) {
    if (await isPortFree(handle.port)) break
    await sleep(200)
  }

  if (!keepProfile && handle.workDir && existsSync(handle.workDir)) {
    try { rmSync(handle.workDir, { recursive: true, force: true }) } catch { }
  }
}

function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const start = Date.now()
  return new Promise((resolve_) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) { resolve_(); return }
      try { process.kill(pid, 0); setTimeout(check, 50) }
      catch { resolve_() }
    }
    check()
  })
}

export function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve_) => {
    const server = createServer()
    server.once("error", () => resolve_(false))
    server.once("listening", () => { server.close(); resolve_(true) })
    server.listen(port, host)
  })
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve_, reject) => {
    const server = createServer()
    server.on("listening", () => {
      const port = (server.address() as import("node:net").AddressInfo).port
      server.close()
      resolve_(port)
    })
    server.on("error", reject)
    server.listen(0, "127.0.0.1")
  })
}

export function assertProcessDead(pid: number): boolean {
  try { process.kill(pid, 0); return false }
  catch { return true }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
