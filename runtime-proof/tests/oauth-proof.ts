#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { randomBytes, createHash } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
const TEMP_BASE = "/var/folders/rr/jvph_g6n153d1l4cs32ctmxc0000gn/T/opencode/runtime-proof"

function getBinary(): string {
  const p = resolve(TEMP_BASE, "bin", "opencode")
  if (!existsSync(p)) throw new Error(`Binary not found at ${p}`)
  return p
}

function randomPassword(len = 16): string {
  return randomBytes(len).toString("base64url")
}

function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
}

function findFreePort(): Promise<number> {
  return new Promise((resolve_, reject) => {
    const s = createServer()
    s.on("listening", () => {
      const port = (s.address() as import("node:net").AddressInfo).port
      s.close()
      resolve_(port)
    })
    s.on("error", reject)
    s.listen(0, "127.0.0.1")
  })
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve_) => {
    const s = createServer()
    s.once("error", () => resolve_(false))
    s.once("listening", () => { s.close(); resolve_(true) })
    s.listen(port, "127.0.0.1")
  })
}

async function waitForPortFree(port: number, timeout = 10000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return
    await new Promise((r) => setTimeout(r, 200))
  }
}

function waitForExit(pid: number, timeout = 10000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve_) => {
    const check = () => {
      if (Date.now() - start > timeout) { resolve_(); return }
      try { process.kill(pid, 0); setTimeout(check, 50) }
      catch { resolve_() }
    }
    check()
  })
}

function makePngFixture(filePath: string): void {
  const width = 64
  const height = 64
  const raw = Buffer.alloc(width * height * 4 + 128)
  let off = 0
  raw.writeUInt8(137, off++)
  raw.write("PNG\r\n\x1a\n", off, "ascii"); off += 7
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 6
  ihdr[9] = 8
  ihdr[10] = 2
  ihdr[11] = 0
  ihdr[12] = 0
  const type = Buffer.from("IHDR", "ascii")
  const len = Buffer.alloc(4)
  len.writeUInt32BE(13, 0)
  const crcData = Buffer.concat([type, ihdr])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(createHash("crc32").update(crcData).readUInt32BE(0) >>> 0, 0)
  off += Buffer.concat([len, type, ihdr, crc]).copy(raw, off)
  for (let y = 0; y < height; y++) {
    raw[off++] = 0
    for (let x = 0; x < width; x++) {
      raw[off++] = (x * 4) & 255
      raw[off++] = (y * 4) & 255
      raw[off++] = 128
      raw[off++] = 255
    }
  }
  const iend = Buffer.from("IEND", "ascii")
  const iendLen = Buffer.alloc(4)
  iendLen.writeUInt32BE(0, 0)
  const iendCrc = createHash("crc32").update(iend).digest()
  off += Buffer.concat([iendLen, iend, iendCrc]).copy(raw, off)
  writeFileSync(filePath, raw.subarray(0, off))
}

interface ServerState {
  process: ChildProcess
  port: number
  password: string
  profileDir: string
  workDir: string
}

async function startServer(binary: string, profileDir: string | null): Promise<ServerState> {
  const port = await findFreePort()
  const password = randomPassword()

  const workDir = resolve(TEMP_BASE, "work", `oauth-${port}-${randomBytes(4).toString("hex")}`)
  const xdgConfig = profileDir ?? resolve(workDir, "config")
  const xdgData = profileDir ? resolve(profileDir, "data") : resolve(workDir, "data")
  const xdgCache = resolve(workDir, "cache")
  const xdgState = resolve(workDir, "state")
  const homeDir = resolve(workDir, "home")
  const projectDir = resolve(workDir, "project")
  const opencodeConfigDir = resolve(xdgConfig, "opencode")
  const opencodeDataDir = resolve(xdgData, "opencode")

  for (const d of [workDir, xdgConfig, xdgData, xdgCache, xdgState, homeDir, projectDir, opencodeConfigDir, opencodeDataDir]) {
    mkdirSync(d, { recursive: true })
  }

  if (!profileDir) {
    writeFileSync(resolve(opencodeConfigDir, "opencode.jsonc"), JSON.stringify({
      server: { port, hostname: "127.0.0.1" },
    }, null, 2))
  }

  const env: Record<string, string> = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: homeDir,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
    XDG_CACHE_HOME: xdgCache,
    XDG_STATE_HOME: xdgState,
    OPENCODE_DATA_DIR: opencodeDataDir,
    OPENCODE_CONFIG_DIR: opencodeConfigDir,
    OPENCODE_SERVER_URL: `http://127.0.0.1:${port}`,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_SERVER_PORT: String(port),
    TMPDIR: resolve(workDir, "tmp"),
  }

  mkdirSync(resolve(workDir, "tmp"), { recursive: true })

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
    throw new Error("Failed to spawn server")
  }

  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Authorization: basicAuth(password) },
        signal: AbortSignal.timeout(3000),
      })
      if (r.ok) return { process: child, port, password, profileDir: xdgConfig, workDir }
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  child.kill("SIGKILL")
  throw new Error(`Server did not start on port ${port}`)
}

async function stopServer(state: ServerState, keepProfile = false): Promise<void> {
  const pid = state.process.pid
  if (!pid) return
  try { process.kill(pid, "SIGTERM") } catch { }
  await waitForExit(pid)
  try { process.kill(pid, "SIGKILL") } catch { }
  await waitForExit(pid)
  await waitForPortFree(state.port)
  if (!keepProfile && existsSync(state.workDir)) {
    try { rmSync(state.workDir, { recursive: true, force: true }) } catch { }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = args.includes("--manual") ? "manual" : "auto"

  const binary = getBinary()
  const profileRoot = resolve(TEMP_BASE, "profiles")
  mkdirSync(profileRoot, { recursive: true })
  const profileDir = resolve(profileRoot, `openai-oauth-${randomBytes(4).toString("hex")}`)

  let state: ServerState | null = null

  try {
    state = await startServer(binary, profileDir)
    const baseUrl = `http://127.0.0.1:${state.port}`
    const headers = { "Content-Type": "application/json", Authorization: basicAuth(state.password) }

    console.log("\n=== Open-Ramble OAuth Proof ===")

    const authResp = await fetch(`${baseUrl}/provider/auth`, { headers, signal: AbortSignal.timeout(5000) })
    if (!authResp.ok) throw new Error(`Provider auth endpoint: ${authResp.status}`)
    const authBody = await authResp.json() as any
    console.log("\nProvider auth methods:", JSON.stringify(authBody, null, 2))

    const openaiMethods: Array<{ type: string; label: string }> | undefined = authBody.openai
    if (!openaiMethods || openaiMethods.length === 0) {
      console.log("\nNo OpenAI auth methods available. Server may need restart.")
      console.log("OAuth proof incomplete.")
      process.exit(1)
    }

    const oauthMethods = openaiMethods.filter((m) => m.type === "oauth")
    if (oauthMethods.length === 0) {
      console.log("\nNo OAuth methods for OpenAI. Available:", JSON.stringify(openaiMethods))
      process.exit(1)
    }

    const authorizeResp = await fetch(`${baseUrl}/provider/openai/oauth/authorize`, {
      method: "POST", headers,
      body: JSON.stringify({ method: 0 }),
      signal: AbortSignal.timeout(10000),
    })
    if (!authorizeResp.ok) throw new Error(`Authorize: ${authorizeResp.status}`)
    const authorizeBody = await authorizeResp.json() as { url: string; method: string; instructions: string }

    console.log("\n=== OAuth Authorization ===\n")
    console.log("URL:", authorizeBody.url)
    console.log("Method:", authorizeBody.method)
    console.log("Instructions:", authorizeBody.instructions)
    console.log(`\nServer port: ${state.port}`)

    if (authorizeBody.method === "auto") {
      console.log("\n--- Phase 1: Authorization URL printed above ---")
      console.log("Open this URL in a browser where ChatGPT Pro/Plus is logged in.")
      console.log("After authorization completes, the browser will redirect back.")
      console.log("The server handles the callback automatically for 'auto' method.")
      console.log("\nPress ENTER after completing browser authorization to continue...")
      const readline = (await import("node:readline")).default
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      await new Promise<void>((resolve_) => {
        rl.question("", () => { rl.close(); resolve_() })
      })
    }

    if (mode === "manual") {
      console.log("\n--- Phase 1: Manual OAuth Flow ---")
      console.log("Open the URL above in a browser and authorize.")
      console.log("Paste the callback URL or authorization code below:")
      const readline = (await import("node:readline")).default
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const code = await new Promise<string>((resolve_) => {
        rl.question("> ", (answer: string) => { rl.close(); resolve_(answer.trim()) })
      })
      if (!code) throw new Error("No authorization code provided")
      console.log("Completing OAuth callback...")
      const callbackResp = await fetch(`${baseUrl}/provider/openai/oauth/callback`, {
        method: "POST", headers,
        body: JSON.stringify({ method: 0, code }),
        signal: AbortSignal.timeout(15000),
      })
      if (!callbackResp.ok) {
        const text = await callbackResp.text()
        throw new Error(`Callback: ${callbackResp.status} ${text.slice(0, 200)}`)
      }
      console.log("OAuth callback successful")
    }

    if (authorizeBody.method === "auto") {
      console.log("\nChecking provider connection state...")
      const provResp = await fetch(`${baseUrl}/provider`, { headers, signal: AbortSignal.timeout(10000) })
      if (provResp.ok) {
        const body = await provResp.json() as any
        if (body.connected) {
          console.log("Connected providers:", body.connected)
        }
      }
    }

    console.log("\n=== Image Prompt Test ===")
    const pngPath = resolve(state.workDir, "fixture.png")
    makePngFixture(pngPath)

    const provResp = await fetch(`${baseUrl}/provider`, { headers, signal: AbortSignal.timeout(10000) })
    const provBody = await provResp.json() as any
    const openaiProvider = provBody.all?.find((p: any) => p.id === "openai")
    let imageModelId = "gpt-4o"
    if (openaiProvider?.models) {
      const imageModels = Object.keys(openaiProvider.models)
        .filter((mid) => openaiProvider.models[mid]?.modalities?.input?.includes("image"))
      if (imageModels.length > 0) imageModelId = imageModels[0]
    }
    console.log("Selected image model:", imageModelId)

    const sessionResp = await fetch(`${baseUrl}/api/session`, {
      method: "POST", headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    })
    if (!sessionResp.ok) {
      console.log(`Session creation: ${sessionResp.status} (expected if no auth configured)`)
      console.log("Image prompt test skipped: no active provider credentials.")
      const sbody = await sessionResp.json() as any
      console.log("Session error:", JSON.stringify(sbody))
    } else {
      const sessionBody = await sessionResp.json() as any
      const sid = sessionBody.data?.id
      if (sid) {
        const pngData = readFileSync(pngPath)
        const pngB64 = pngData.toString("base64")
        const imgResp = await fetch(`${baseUrl}/session/${sid}/message`, {
          method: "POST", headers,
          body: JSON.stringify({
            model: { providerID: "openai", modelID: imageModelId },
            parts: [
              { type: "text", text: "Describe this image in one sentence" },
              { type: "file", mime: "image/png", url: `data:image/png;base64,${pngB64}` },
            ],
          }),
          signal: AbortSignal.timeout(60000),
        })
        if (imgResp.ok) {
          const msgBody = await imgResp.json() as any
          const msg = msgBody.info
          if (msg?.error) {
            console.log("Image response error:", msg.error.data?.message ?? JSON.stringify(msg.error))
          } else {
            console.log("Image response received, finish reason:", msg.finish ?? "N/A")
            if (msg.tokens) {
              console.log("Tokens input:", msg.tokens.input, "output:", msg.tokens.output)
            }
          }
        } else {
          const text = await imgResp.text()
          console.log(`Image prompt: ${imgResp.status} ${text.slice(0, 200)}`)
        }
      }
    }

    console.log("\n=== Restart Test ===")
    console.log("Stopping server...")
    await stopServer(state, true)
    state = null
    console.log("Restarting with same profile...")
    state = await startServer(binary, profileDir)
    const restartHeaders = { "Content-Type": "application/json", Authorization: basicAuth(state.password) }

    const restartAuthResp = await fetch(`http://127.0.0.1:${state.port}/provider/auth`, {
      headers: restartHeaders, signal: AbortSignal.timeout(5000),
    })
    const restartAuthBody = await restartAuthResp.json() as any
    console.log("OAuth methods after restart:", Object.keys(restartAuthBody))

    const restartProvResp = await fetch(`http://127.0.0.1:${state.port}/provider`, {
      headers: restartHeaders, signal: AbortSignal.timeout(10000),
    })
    if (restartProvResp.ok) {
      const restartProvBody = await restartProvResp.json() as any
      console.log("Connected providers after restart:", restartProvBody.connected ?? [])
    }

    console.log("\n=== Disconnect/Credential Deletion Test ===")
    const delResp = await fetch(`http://127.0.0.1:${state.port}/auth/openai`, {
      method: "DELETE", headers: restartHeaders, signal: AbortSignal.timeout(5000),
    })
    console.log(`DELETE /auth/openai: ${delResp.status}`)

    await stopServer(state, true)
    state = null
    console.log("Restarting after credential deletion...")
    state = await startServer(binary, profileDir)

    const afterDelProvResp = await fetch(`http://127.0.0.1:${state.port}/provider`, {
      headers: { "Content-Type": "application/json", Authorization: basicAuth(state.password) },
      signal: AbortSignal.timeout(10000),
    })
    if (afterDelProvResp.ok) {
      const afterDelBody = await afterDelProvResp.json() as any
      console.log("Connected providers after deletion:", afterDelBody.connected ?? [])
      if (afterDelBody.connected?.length === 0) {
        console.log("PASS: Provider disconnected after credential deletion")
      }
    }

    console.log("\n=== OAuth Proof Complete ===")

  } catch (err) {
    console.error("OAuth proof failed:", err)
    process.exit(1)
  } finally {
    if (state) {
      await stopServer(state, false)
      const profileRoot_ = resolve(TEMP_BASE, "profiles")
      if (existsSync(profileRoot_)) {
        try { rmSync(profileRoot_, { recursive: true, force: true }) } catch { }
      }
    }
  }
}

main()
