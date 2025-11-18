# Changelog

All notable changes to this project will be documented in this file.

## [1.2.4+] - 2024

### Added

#### Core Features
- **LED Status Control**: Toggle LED indicator on/off (if supported)
- **Sound Volume Control**: Adjust notification sound volume (0-100%)
- **Do Not Disturb (DND)**: Enable/disable DND timer with default schedule (22:00-08:00)
- **Child Lock**: Enable/disable child lock protection (if supported)

#### Cleaning Controls
- **Fan Speed Control**: Adjust suction power (Quiet, Balanced, Turbo, Max)
- **Water Level Control**: Control scrub intensity for mopping (Mild, Standard, Intense) - *Mopping models*
- **Mop Mode**: Select mop cleaning route (Standard, Deep, Deep+, Fast) - *Mopping models*
- **Cleaning Mode Selector**: Choose between Vacuum only, Vacuum & Mop, or Mop only - *Mopping models*
- **Room Cleaning**: Clean specific rooms by name (dynamic switches)
- **Zone Cleaning**: API support for zone cleaning (requires coordinates)

#### Dock Features
- **Dust Collection**: Start auto-empty dock dust collection - *Auto-empty dock required*
- **Mop Washing**: Start mop washing cycle - *Wash dock required*
- **Wash Intensity**: Control wash intensity (Eco, Medium, Intense) - *Wash dock required*
- **Dryer**: Control dock dryer on/off - *Dry dock required*
- **Dryer Duration**: Set dryer duration (2h, 3h, 4h) - *Dry dock required*

#### Carpet Features
- **Carpet Boost**: Enable/disable carpet boost mode - *If supported*
- **Carpet Mode**: Set carpet avoidance behavior (Avoid, Rise, Ignore) - *If supported*

#### Advanced Features
- **Flow LED**: Control flow LED status - *If supported*
- **Automatic Feature Detection**: Only shows features supported by your device
- **Dynamic Room Switches**: Automatically creates switches for each named room
- **Enhanced State Synchronization**: Real-time state updates from device

### Changed

- Improved error handling throughout the plugin
- Better device compatibility detection
- Enhanced logging for debugging
- More robust state management
- Better handling of unsupported features

### Technical Improvements

- Added feature detection methods to `roborockAPI.js`
- Implemented conditional service creation based on device capabilities
- Added comprehensive TypeScript type safety
- Improved state update logic
- Better error recovery

### Documentation

- Added comprehensive README with all features
- Added BUILD_AND_TEST.md guide
- Added DEPLOY_TO_DOCKER.md guide
- Added ALL_FEATURES_IMPLEMENTED.md
- Added V8_FEATURES.md
- Added COMPREHENSIVE_FEATURES_PLAN.md
- Updated .gitignore with comprehensive patterns

## [1.2.4] - Previous Version

### Features
- Basic start/stop cleaning
- Battery status
- Basic device detection

