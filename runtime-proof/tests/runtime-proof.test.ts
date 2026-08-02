import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"

import {
  getPinnedBinaryPath, getManifestPath, readManifest,
  startServer, stopServer, deleteAllSessions,
  assertProcessDead, sha256Of, basicAuthHeader, isPortFree,
  type ServerHandle,
} from "./helpers"

const BINARY = getPinnedBinaryPath()
const MANIFEST = readManifest() as Record<string, any>

function url(h: ServerHandle): string {
  return `http://127.0.0.1:${h.port}`
}
function ah(h: ServerHandle): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: basicAuthHeader(h.password) }
}

const MY_DIR = dirname(new URL(import.meta.url).pathname)
const REPO_ROOT = resolve(MY_DIR, "../..")

describe("Manifest", () => {
  it("valid JSON", () => {
    expect(() => JSON.parse(readFileSync(getManifestPath(), "utf-8"))).not.toThrow()
  })

  it("pins three components", () => {
    const names = MANIFEST.components.map((c: any) => c.name)
    for (const k of ["opencode-cli", "@opencode-ai/sdk", "bun"]) expect(names).toContain(k)
  })

  it("each component has name, version, provenance, license", () => {
    for (const c of MANIFEST.components) {
      expect(c.name).toBeString()
      expect(c.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(c.provenance).toBeString()
      expect(c.license).toBeString()
    }
  })

  it("opencode-cli license URL is reachable", async () => {
    const cli = MANIFEST.components.find((c: any) => c.name === "opencode-cli")
    const r = await fetch(cli.licenseUrl, { signal: AbortSignal.timeout(10000) })
    expect(r.ok).toBe(true)
    const text = await r.text()
    expect(text).toContain("MIT License")
    expect(text).toContain("Copyright (c) 2025 opencode")
  })

  it("bun license URL is reachable", async () => {
    const bun = MANIFEST.components.find((c: any) => c.name === "bun")
    const r = await fetch(bun.licenseUrl, { signal: AbortSignal.timeout(10000) })
    expect(r.ok).toBe(true)
    const text = await r.text()
    expect(text).toContain("MIT License")
  })
})

describe("Source tag verification", () => {
  const cli = MANIFEST.components.find((c: any) => c.name === "opencode-cli")

  it("GitHub tag v1.18.9 resolves to a valid release", async () => {
    const r = await fetch("https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.18.9", {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "open-ramble-runtime-proof" },
      signal: AbortSignal.timeout(15000),
    })
    expect(r.ok).toBe(true)
    const release = await r.json() as any
    expect(release.tag_name).toBe("v1.18.9")
  })

  it("release commit matches manifest", async () => {
    const r = await fetch("https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.18.9", {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "open-ramble-runtime-proof" },
      signal: AbortSignal.timeout(15000),
    })
    expect(r.ok).toBe(true)
    const ref = await r.json() as any
    expect(ref.object?.sha).toBe(cli.commit)
  })
})

describe("Binary", () => {
  it("exists executable", () => {
    expect(existsSync(BINARY)).toBe(true)
    expect(statSync(BINARY).mode & 0o111).not.toBe(0)
  })

  it("version 1.18.9", () => {
    const p = Bun.spawnSync([BINARY, "--version"], {
      env: { PATH: "/usr/bin:/bin", HOME: "/tmp" },
    })
    expect((p.stdout.toString() + p.stderr.toString()).trim()).toBe("1.18.9")
  })

  it("sha256 matches manifest arm64 entry", () => {
    const h = sha256Of(BINARY)
    const arm = MANIFEST.components.find((c: any) => c.name === "opencode-cli")?.platforms?.["darwin-arm64"]
    expect(arm).toBeDefined()
    expect(arm.binarySha256).toBe(h)
  })

  it("actual file architecture matches arm64", () => {
    const p = Bun.spawnSync(["file", BINARY], { env: { PATH: "/usr/bin:/bin" } })
    const out = (p.stdout.toString() + p.stderr.toString()).trim()
    expect(out).toContain("arm64")
  })

  it("actual file size matches manifest", () => {
    const arm = MANIFEST.components.find((c: any) => c.name === "opencode-cli")?.platforms?.["darwin-arm64"]
    expect(arm.binarySize).toBe(statSync(BINARY).size)
  })
})

describe("Lifecycle", () => {
  let h: ServerHandle

  beforeAll(async () => { h = await startServer(BINARY) }, 60000)
  afterAll(async () => { await deleteAllSessions(h); await stopServer(h) }, 15000)

  it("rejects unauthenticated health", async () => {
    const r = await fetch(`${url(h)}/api/health`, { signal: AbortSignal.timeout(5000) })
    expect(r.status).toBe(401)
  })

  it("accepts authenticated health", async () => {
    const r = await fetch(`${url(h)}/api/health`, {
      headers: { Authorization: basicAuthHeader(h.password) },
      signal: AbortSignal.timeout(5000),
    })
    expect(r.ok).toBe(true)
    const b = await r.json() as any
    expect(b.healthy).toBe(true)
  })

  it("rejects wrong password", async () => {
    const r = await fetch(`${url(h)}/api/health`, {
      headers: { Authorization: `Basic ${Buffer.from("opencode:wrongpw").toString("base64")}` },
      signal: AbortSignal.timeout(5000),
    })
    expect(r.status).toBe(401)
  })
})

describe("Isolation", () => {
  let h: ServerHandle

  beforeAll(async () => { h = await startServer(BINARY) }, 60000)
  afterAll(async () => { await deleteAllSessions(h); await stopServer(h) }, 15000)

  it("HOME isolated under runtime-proof", () => {
    expect(h.env.HOME).toContain("runtime-proof")
    expect(h.env.HOME).not.toBe(process.env.HOME)
  })

  it("XDG_CONFIG_HOME isolated under runtime-proof", () => {
    expect(h.env.XDG_CONFIG_HOME).toContain("runtime-proof")
  })

  it("project dir has no .opencode", () => {
    expect(existsSync(resolve(h.projectDir, ".opencode"))).toBe(false)
  })

  it("PATH is the fixed sanitized path", () => {
    expect(h.env.PATH).toBe("/usr/bin:/bin:/usr/sbin:/sbin")
  })

  it("env does not inherit host TMPDIR", () => {
    expect(h.env.TMPDIR).not.toBe(process.env.TMPDIR)
    expect(h.env.TMPDIR).toContain("runtime-proof")
  })

  it("does not inherit any API keys from host env", () => {
    const keys = Object.keys(h.env)
    for (const k of ["OPENCODE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AWS_PROFILE"]) {
      expect(keys).not.toContain(k)
    }
  })

  it("global contamination canary is not loaded", async () => {
    const authResp = await fetch(`${url(h)}/provider/auth`, {
      headers: ah(h), signal: AbortSignal.timeout(10000),
    })
    expect(authResp.ok).toBe(true)
    const body = await authResp.json() as any
    const allProviderIds = Object.keys(body)
    expect(allProviderIds).not.toContain("canary-provider")
    expect(allProviderIds).not.toContain("canary")
  })

  it("no canary config appears in provider list", async () => {
    const provResp = await fetch(`${url(h)}/provider`, {
      headers: ah(h), signal: AbortSignal.timeout(10000),
    })
    expect(provResp.ok).toBe(true)
    const body = await provResp.json() as any
    if (body.all) {
      const ids = body.all.map((p: any) => p.id)
      expect(ids).not.toContain("canary-provider")
    }
  })
})

describe("Session", () => {
  let h: ServerHandle
  let sid: string

  beforeAll(async () => { h = await startServer(BINARY) }, 60000)
  afterAll(async () => { await deleteAllSessions(h); await stopServer(h) }, 15000)

  it("creates", async () => {
    const r = await fetch(`${url(h)}/api/session`, {
      method: "POST", headers: ah(h), body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    })
    sid = ((await r.json()) as any).data.id
    expect(sid).toMatch(/^ses_/)
  })

  it("lists", async () => {
    const r = await fetch(`${url(h)}/api/session`, {
      headers: ah(h), signal: AbortSignal.timeout(5000),
    })
    expect(((await r.json()) as any).data.map((s: any) => s.id)).toContain(sid)
  })

  it("sends message", async () => {
    const r = await fetch(`${url(h)}/session/${sid}/message`, {
      method: "POST", headers: ah(h),
      body: JSON.stringify({ parts: [{ type: "text", text: "ping" }], noReply: true }),
      signal: AbortSignal.timeout(15000),
    })
    expect(r.ok).toBe(true)
    expect(((await r.json()) as any).info?.role).toBe("user")
  })

  it("lists messages", async () => {
    const r = await fetch(`${url(h)}/session/${sid}/message`, {
      headers: ah(h), signal: AbortSignal.timeout(5000),
    })
    expect(r.ok).toBe(true)
    expect(Array.isArray(await r.json())).toBe(true)
  })

  it("deletes", async () => {
    const r = await fetch(`${url(h)}/api/session/${sid}`, {
      method: "DELETE", headers: ah(h), signal: AbortSignal.timeout(5000),
    })
    expect(r.ok).toBe(true)
  })
})

describe("Provider", () => {
  let h: ServerHandle
  beforeAll(async () => { h = await startServer(BINARY) }, 60000)
  afterAll(async () => { await deleteAllSessions(h); await stopServer(h) }, 15000)

  it("GET /provider/auth enumerates methods", async () => {
    const r = await fetch(`${url(h)}/provider/auth`, {
      headers: ah(h), signal: AbortSignal.timeout(10000),
    })
    expect(r.ok).toBe(true)
    const body = await r.json() as any
    const keys = Object.keys(body)
    expect(keys.length).toBeGreaterThan(0)
    if (keys.includes("openai")) {
      const methods = body.openai as Array<{ type: string; label: string }>
      expect(methods.length).toBeGreaterThan(0)
      expect(methods.some((m) => m.type === "oauth" || m.type === "api")).toBe(true)
    }
  })

  it("POST /provider/openai/oauth/authorize returns URL", async () => {
    const r = await fetch(`${url(h)}/provider/auth`, {
      headers: ah(h), signal: AbortSignal.timeout(10000),
    })
    expect(r.ok).toBe(true)
    const body = await r.json() as any
    if (!body.openai || !Array.isArray(body.openai)) return

    const authResp = await fetch(`${url(h)}/provider/openai/oauth/authorize`, {
      method: "POST", headers: ah(h),
      body: JSON.stringify({ method: 0 }),
      signal: AbortSignal.timeout(10000),
    })
    expect(authResp.ok).toBe(true)
    const authBody = await authResp.json() as any
    expect(authBody.url).toMatch(/^https:\/\/auth\.openai\.com/)
    expect(authBody.method).toBeString()
    expect(authBody.instructions).toBeString()
  })

  it("DELETE /auth/openai returns 200", async () => {
    const r = await fetch(`${url(h)}/auth/openai`, {
      method: "DELETE", headers: ah(h), signal: AbortSignal.timeout(5000),
    })
    expect(r.ok).toBe(true)
  })
})

describe("Teardown", () => {
  it("kills PID and closes port", async () => {
    const h1 = await startServer(BINARY)
    const pid = h1.process.pid!
    const port = h1.port
    await deleteAllSessions(h1)
    await stopServer(h1)
    expect(assertProcessDead(pid)).toBe(true)
    expect(await isPortFree(port)).toBe(true)
  }, 60000)

  it("multiple sequential lifecycles", async () => {
    for (let i = 0; i < 3; i++) {
      const h2 = await startServer(BINARY)
      const pid2 = h2.process.pid!
      const port2 = h2.port
      await deleteAllSessions(h2)
      await stopServer(h2)
      expect(assertProcessDead(pid2)).toBe(true)
      expect(await isPortFree(port2)).toBe(true)
    }
  }, 120000)
})

describe("SDK pin", () => {
  it("package.json pins @opencode-ai/sdk to 1.18.9", () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8"))
    expect(pkg.dependencies["@opencode-ai/sdk"]).toBe("1.18.9")
  })

  it("bun.lock resolves @opencode-ai/sdk@1.18.9", () => {
    const lock = readFileSync(resolve(REPO_ROOT, "bun.lock"), "utf-8")
    expect(lock).toContain('"@opencode-ai/sdk@1.18.9"')
  })
})
