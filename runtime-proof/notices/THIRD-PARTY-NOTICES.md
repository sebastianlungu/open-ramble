# Third-Party Licenses and Notices

Open-Ramble incorporates redistributable components from the following projects.
Licenses and notices are reproduced from the exact upstream files at their pinned versions.

---

## OpenCode CLI (anomalyco/opencode)

- **Source**: https://github.com/anomalyco/opencode
- **License**: MIT
- **Version pinned**: 1.18.9 (tag v1.18.9, commit 4da7bb44c84e013fa53e9c5d02ac753d1435c81a)
- **Upstream file**: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.9/LICENSE

```
MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## @opencode-ai/sdk

- **Source**: https://opencode.ai
- **License**: MIT
- **Version pinned**: 1.18.9
- **npm registry**: https://registry.npmjs.org/@opencode-ai/sdk/1.18.9
- **Integrity**: sha512-oDJSmsmiGW+3lNLmZYj3EpUkpiT3ITZBKffH3mrmu2KMJXlkxQ/Nvv7jqPffSM7o8lCdBZS/aCE+2GkA3/92gQ==

Licensed under the MIT License (same text as OpenCode CLI above).

---

## Bun (oven-sh/bun)

- **Source**: https://bun.sh
- **Repository**: https://github.com/oven-sh/bun
- **Primary License**: MIT
- **Version pinned**: 1.3.11 (tag bun-v1.3.11)
- **Upstream file**: https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.11/LICENSE.md

### Bun Core (MIT)

```
MIT License

Copyright (c) Oven Labs / Jarred Sumner and bun contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### JavaScriptCore / WebKit (LGPL-2)

Bun statically links JavaScriptCore (and WebKit), which is **LGPL-2 licensed**.
Per LGPL-2 Section 6(a): if you statically link against an LGPL'd library, you
must also provide the application in object format so that a user may modify
the library and relink.

Patched WebKit source used by Bun:
https://github.com/oven-sh/webkit

To relink Bun with modified JavaScriptCore:
```
git submodule update --init --recursive
make jsc
zig build
```

### Statically Linked Libraries

The following libraries are statically linked into Bun and carry their own
licensing obligations:

| Library | License | Upstream |
|---------|---------|----------|
| boringssl | Multiple (ISC, OpenSSL) | https://boringssl.googlesource.com/boringssl/ |
| brotli | MIT | https://github.com/google/brotli |
| libarchive | Multiple (BSD, Public Domain) | https://github.com/libarchive/libarchive |
| lol-html | BSD 3-Clause | https://github.com/cloudflare/lol-html |
| mimalloc | MIT | https://github.com/microsoft/mimalloc |
| picohttpparser | MIT or Perl | https://github.com/h2o/picohttpparser |
| zstd | BSD or GPLv2 | https://github.com/facebook/zstd |
| simdutf | Apache 2.0 | https://github.com/simdutf/simdutf |
| tinycc | LGPL v2.1 | https://github.com/tinycc/tinycc |
| uSockets | Apache 2.0 | https://github.com/uNetworking/uSockets |
| zlib-cloudflare | zlib | https://github.com/cloudflare/zlib |
| c-ares | MIT | https://github.com/c-ares/c-ares |
| libicu 72 | Unicode License | https://github.com/unicode-org/icu |
| libbase64 | BSD 2-Clause | https://github.com/aklomp/base64 |
| libdeflate | MIT | https://github.com/ebiggers/libdeflate |
| uucode | MIT | https://github.com/jacobsandlund/uucode |
| uWebsockets (fork) | Apache 2.0 | https://github.com/jarred-sumner/uwebsockets |

### Embedded Polyfills

For compatibility, Bun embeds the following npm polyfills (all MIT licensed):
assert, browserify-zlib, buffer, constants-browserify, crypto-browserify,
domain-browser, events, https-browserify, os-browserify, path-browserify,
process, punycode, querystring-es3, stream-browserify, stream-http,
string_decoder, timers-browserify, tty-browserify, url, util, vm-browserify.

### Additional Credits

- Bun's JS transpiler, CSS lexer, and Node.js module resolver source code is a
  Zig port of Evan Wallace's esbuild project (MIT).
- The name "Bun" was contributed by @kipply.

---

## Open-Ramble (this project)

- **License**: MIT (see `LICENSE` in repository root)
- **Copyright**: Open-Ramble contributors

---

_This document was generated on 2026-07-29 from verified primary sources
(npm registry, GitHub releases, upstream LICENSE files)._
