# Changelog

## [1.0.1](https://github.com/sebastianlungu/openramble/compare/v1.0.0...v1.0.1) (2026-07-29)


### Bug Fixes

* **macos-helper:** recover interrupted signing ([#20](https://github.com/sebastianlungu/openramble/issues/20)) ([fb185e3](https://github.com/sebastianlungu/openramble/commit/fb185e3912570387feb2893044ac55e889ef8110))

## 1.0.0 (2026-07-14)


### Features

* **macos-helper:** dev-only CaptureSmokeView for 10s capture PASS/FAIL (T6, all 6 dims ≥90) ([9894f73](https://github.com/sebastianlungu/openramble/commit/9894f732fbc592620cca32a95b7ffe5f83b2e2ba))
* **macos-helper:** persist compiler-stage failures in history with calm orange badge ([a6e64f8](https://github.com/sebastianlungu/openramble/commit/a6e64f8793c85300940522bddf63bc7a18a249ab))
* open-source readiness ([#5](https://github.com/sebastianlungu/openramble/issues/5)) ([e0d814a](https://github.com/sebastianlungu/openramble/commit/e0d814a4db99e9142a570a08c8dac8e5fd8f7f7a))


### Bug Fixes

* **ci:** use GitHub App client-id input ([#6](https://github.com/sebastianlungu/openramble/issues/6)) ([c403cf2](https://github.com/sebastianlungu/openramble/commit/c403cf24713a78d1bb4074fa579ada9bc5bcb4c1))
* **helper:** bound compile subprocess at 3 minutes, unblock cooperative thread ([#3](https://github.com/sebastianlungu/openramble/issues/3)) ([1c501da](https://github.com/sebastianlungu/openramble/commit/1c501dabc590176b7e7a750be3e5c5fd90966565))
* **macos-helper:** add NSScreenCaptureUsageDescription to source Info.plist (T4, all 6 dims ≥90) ([b50ddab](https://github.com/sebastianlungu/openramble/commit/b50ddabbb17186a8cc701f66ba878ba89fe60b95))
* **macos-helper:** keep banner pulse continuous across state transitions ([beb83b7](https://github.com/sebastianlungu/openramble/commit/beb83b7ae42ddec63690b5f9447b15bc60aab348))
* **macos-helper:** move AVAssetWriter append to dedicated writer queue (T1, all 6 dims ≥90) ([95994a7](https://github.com/sebastianlungu/openramble/commit/95994a7c3b3b16936dc199f8fb769b8f221eb9f1))
* **macos-helper:** release AVAudioFile in stopRecording (T3, all 6 dims ≥90) ([41bae32](https://github.com/sebastianlungu/openramble/commit/41bae327b24482968f8c2e66671d90f97558b61f))
* **macos-helper:** route capture errors to banner instead of modal alert ([2ff4b06](https://github.com/sebastianlungu/openramble/commit/2ff4b06ac521c1094ecdd258bc0837609fb135eb))
* **macos-helper:** smooth banner state transitions (T1-T7) ([68e723a](https://github.com/sebastianlungu/openramble/commit/68e723a3ac6e99366dd6a11e2de55bc9f016eb2d))
* **macos-helper:** wire screen-capture errors to user-visible banner (T2, all 6 dims ≥90) ([6c71ca6](https://github.com/sebastianlungu/openramble/commit/6c71ca6253072a5bc73550e9e59373ea930b42ef))
* OMNICAPTAIN -&gt; OPENVYSTA in handoff.ts + clean stale .build cache ([d099612](https://github.com/sebastianlungu/openramble/commit/d099612e2faaa13d837b969d27034afc5bfc2f2a))
