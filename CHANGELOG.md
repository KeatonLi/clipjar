# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Named text snippets with editing, search and full-content previews.
- Content-type filters, search highlighting and pagination for all retained matches.
- Pause capture for 15 minutes or one hour, with early resume.
- Storage usage, ordinary-history retention settings, and clearing ordinary history while preserving favorites and snippets.
- Windows/macOS checks for frontend tests, Python diagnostics, native history tests, TypeScript compilation and a complete Tauri build. Successful runs upload trial executables without creating a release.
- An Ubuntu browser smoke check with screenshot artifacts for visual review.

### Changed

- Moved capture into a Rust background worker polling every 700 ms, independent of window visibility.
- Moved desktop history into an atomically replaced JSON manifest and PNG files in the application data directory; native image payloads no longer enter WebView localStorage.
- Limited retained images to 64 MiB and metadata to 4 MiB, with ordinary-history eviction and explicit errors when protected content fills the budget.
- Added durable legacy-history migration, including fractional IDs, image data, notes, favorites and shortcut preferences. Original storage is retained if migration fails.
- Unified ordinary-history limits at 10–500 records; favorites and snippets are excluded from automatic retention cleanup.
- Simplified the main interface and settings, with keyboard navigation and dialog focus management.

### Fixed

- Image copy now writes a real image rather than a text placeholder.
- Image deduplication now checks pixel content rather than dimensions alone.
- Removed the fixed 50-result display cap and disconnected frontend/backend history copies.
- Surface capture, storage and copy errors instead of silently treating operations as successful.

### Validation scope

- Automated checks and desktop trial artifacts are defined in CI; Windows/macOS runtime behavior still requires platform testing.
- The cause of previously reported multi-GB files is unconfirmed. These changes bound ClipJar-managed data and do not compact existing WebView databases.

## [1.0.4] - 2026-03-14

### Changed
- Updated app icon with new design
- Improved favicon

### Fixed
- TypeScript errors in build process
- CSS import order warning
- Added missing ContentType.FILE support

## [1.0.3] - 2026-02-28

### Added
- Initial release with core clipboard management features
