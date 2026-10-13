# Changelog

All notable changes to `@hs1n/rpiv-sidecall` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New shared library package: the host-version-tolerant side-call surface that `rpiv-advisor` and `rpiv-btw` previously each implemented in their own `pi-compat.ts`. `resolveSideCall(modelRegistry)` reports which path this host takes — the auth-aware `ModelRuntime` facade, or the legacy global `/compat` entrypoint with its package-root fallback — and a caller passes request options accordingly. `loadIsContextOverflow()` and `stripToolDeclarations()` move here with it.
