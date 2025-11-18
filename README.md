# homebridge-roborock-vacuum-update

![Roborock Vacuum in Home App](https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/40/21/71/40217177-c879-f670-bd01-c93acfabc31e/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/460x0w.webp)

A comprehensive Homebridge plugin to integrate your Roborock vacuum cleaner with Apple HomeKit, allowing you to control it via the Home app and Siri.

## Introduction

`homebridge-roborock-vacuum` brings your Roborock vacuum cleaner into Apple HomeKit. Using your Roborock app account credentials, this plugin automatically detects your vacuum and enables you to control it directly from the Home app on your iPhone, iPad, or Mac, or with Siri voice commands.

This plugin is inspired by and adapted from the [ioBroker.roborock](https://github.com/copystring/ioBroker.roborock) project by copystring, and incorporates features from the [python-roborock](https://github.com/Python-roborock/python-roborock) library.

## Features

### Core Features
- **Automatic Device Detection**: No need to manually find or enter your vacuum's device ID
- **Start/Stop Cleaning**: Begin or end cleaning sessions
- **Pause/Resume**: Pause and resume cleaning operations
- **Return to Dock**: Command the vacuum to return to its charging dock
- **Spot Cleaning**: Clean a small area around the robot
- **Find Me**: Make the robot play a sound to help locate it
- **Battery Status**: Monitor battery level and charging state
- **Error Detection**: Get notified when the vacuum encounters errors

### Advanced Cleaning Controls
- **Fan Speed Control**: Adjust suction power (Quiet, Balanced, Turbo, Max)
- **Water Level Control**: Control scrub intensity for mopping (Mild, Standard, Intense) - *Mopping models only*
- **Mop Mode**: Select mop cleaning route (Standard, Deep, Deep+, Fast) - *Mopping models only*
- **Cleaning Mode Selector**: Choose between Vacuum only, Vacuum & Mop, or Mop only - *Mopping models only*
- **Room Cleaning**: Clean specific rooms by name - *Requires named rooms in Roborock app*
- **Zone Cleaning**: Clean specific zones (requires coordinates) - *API available*

### Device Settings
- **LED Status**: Control the vacuum's LED indicator - *If supported*
- **Sound Volume**: Adjust notification sound volume (0-100%)
- **Do Not Disturb**: Enable/disable DND timer (default: 22:00-08:00)
- **Child Lock**: Enable/disable child lock protection - *If supported*
- **Carpet Boost**: Enable/disable carpet boost mode - *If supported*
- **Carpet Mode**: Set carpet avoidance behavior (Avoid, Rise, Ignore) - *If supported*
- **Flow LED**: Control flow LED status - *If supported*

### Dock Features
- **Dust Collection**: Start auto-empty dock dust collection - *Auto-empty dock required*
- **Mop Washing**: Start mop washing cycle - *Wash dock required*
- **Wash Intensity**: Control wash intensity (Eco, Medium, Intense) - *Wash dock required*
- **Dryer**: Control dock dryer - *Dry dock required*
- **Dryer Duration**: Set dryer duration (2h, 3h, 4h) - *Dry dock required*

### Smart Features
- **Scene Execution**: Execute saved Roborock scenes
- **Dynamic Room Switches**: Automatically create switches for each named room
- **Feature Detection**: Automatically detects and enables only supported features
- **State Synchronization**: Real-time state updates from device

## Supported Devices

### Vacuum Models
- Roborock S4
- Roborock S4 Max
- Roborock S5 Max
- Roborock S6
- Roborock S6 Pure
- Roborock S6 MaxV
- Roborock S7
- Roborock S7 MaxV (Ultra)
- Roborock S8
- Roborock S8 Pro Ultra
- Roborock V8

### Mopping Models
- Roborock Q7
- Roborock Q7 Max
- Roborock S7 Pro Ultra
- Roborock S7 Max Ultra
- Roborock Q Revo
- Roborock Q8 Max
- Roborock Q5 Pro
- Roborock Q Revo Pro
- Roborock Qrevo S
- Roborock Qrevo Curve

*Note: Features are automatically detected based on your device model. Only supported features will appear in HomeKit.*

## Requirements

Before installing, ensure you have:

- A Roborock vacuum cleaner compatible with the Roborock app
- A Roborock app account (email and password)
- [Homebridge](https://github.com/homebridge/homebridge) installed on a server (e.g., Raspberry Pi, Unraid, etc.)
- Node.js (v18.20.4, v20.15.1, or v22+) and npm installed on your Homebridge server

## Installation

### Via Homebridge UI (Recommended)

1. Open Homebridge UI
2. Go to the "Plugins" tab
3. Search for "homebridge-roborock-vacuum"
4. Click "Install"

### Via npm

```bash
npm install -g homebridge-roborock-vacuum
```

### Manual Installation

1. Clone or download this repository
2. Navigate to the plugin directory
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Link or install in your Homebridge directory

See [BUILD_AND_TEST.md](BUILD_AND_TEST.md) for detailed build instructions.

## Configuration

Add the following to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "RoborockVacuumPlatformUpdate",
      "name": "RoborockVacuum",
      "email": "your-email@example.com",
      "password": "your-password",
      "baseURL": "usiot.roborock.com"
    }
  ]
}
```

### Configuration Options

- **platform** (required): Must be `"RoborockVacuumPlatformUpdate"`
- **name** (required): Display name for the platform
- **email** (required): Your Roborock app email address
- **password** (required): Your Roborock app password
- **baseURL** (optional): Roborock API endpoint (default: `"usiot.roborock.com"`). Use `"euiot.roborock.com"` for Europe
- **debugMode** (optional): Enable debug logging (default: `false`)

## Usage

### Home App

Once configured, your Roborock vacuum will appear in the Home app with all supported features:

- **Fan Service**: Control cleaning on/off, fan speed, and pause/resume
- **Battery Service**: Monitor battery level and charging status
- **Switch Services**: Return to dock, spot clean, find me, room cleaning, etc.
- **Lightbulb Services**: Water level, mop mode, cleaning mode, sound volume, etc.
- **Contact Sensor**: Error status detection

### Siri Commands

You can use Siri to control your vacuum:

- "Turn on the vacuum"
- "Turn off the vacuum"
- "Set the vacuum fan speed to 50%"
- "Pause the vacuum"
- "Resume the vacuum"
- "Return the vacuum to dock"
- "Start spot cleaning"
- "Find my vacuum"
- "Clean the living room" (if room is named)
- "Set scrub intensity to intense"
- "Set cleaning mode to mop only"

### HomeKit Automations

Create automations in the Home app:

- When you leave home → Start cleaning
- When vacuum finishes → Start dust collection
- At 10 PM → Enable Do Not Disturb
- When battery is low → Return to dock
- When cleaning starts → Set carpet boost on

## Feature Detection

The plugin automatically detects which features your device supports:

- **Mopping Features**: Only appear on mopping-capable models
- **Dock Features**: Only appear if you have the required dock type
- **Advanced Features**: Only appear if your device firmware supports them

Features are detected using:
- Device model information
- Firmware feature flags
- Status availability

## Troubleshooting

### Plugin Not Loading

- Check Homebridge logs for errors
- Verify your email and password are correct
- Ensure your country code is correct
- Check that your device is online in the Roborock app

### Features Not Appearing

- Some features require specific device models or firmware versions
- Check Homebridge logs for feature detection messages
- Verify your device supports the feature in the Roborock app

### Connection Issues

- Ensure your Homebridge server can reach the internet
- Check that your Roborock account credentials are correct
- Verify your device is online in the Roborock app
- Check Homebridge logs for connection errors

### Build Issues

See [BUILD_AND_TEST.md](BUILD_AND_TEST.md) for build troubleshooting.

### Docker Deployment

See [DEPLOY_TO_DOCKER.md](DEPLOY_TO_DOCKER.md) for Docker-specific instructions.

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Clean build artifacts
npm run clean

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Project Structure

```
homebridge-roborock-vacuum/
├── src/                    # TypeScript source files
│   ├── index.ts           # Plugin entry point
│   ├── platform.ts        # Platform implementation
│   └── vacuum_accessory.ts # HomeKit accessory implementation
├── roborockLib/           # Roborock API library
│   ├── roborockAPI.js     # Main API interface
│   └── lib/               # Core library files
├── dist/                  # Compiled JavaScript (generated)
└── package.json           # Package configuration
```

## Documentation

- [BUILD_AND_TEST.md](BUILD_AND_TEST.md) - Build and testing guide
- [DEPLOY_TO_DOCKER.md](DEPLOY_TO_DOCKER.md) - Docker deployment guide
- [ALL_FEATURES_IMPLEMENTED.md](ALL_FEATURES_IMPLEMENTED.md) - Complete feature list
- [V8_FEATURES.md](V8_FEATURES.md) - V8-specific features
- [ENHANCEMENTS.md](ENHANCEMENTS.md) - Recent enhancements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

- Inspired by [ioBroker.roborock](https://github.com/copystring/ioBroker.roborock) by copystring
- Features verified against [python-roborock](https://github.com/Python-roborock/python-roborock) library
- Original plugin by tasict

## License

MIT

## Changelog

### Version 1.2.4+

#### New Features
- ✅ LED Status control
- ✅ Sound Volume control (0-100%)
- ✅ Do Not Disturb (DND) timer
- ✅ Child Lock control
- ✅ Dust Collection (auto-empty dock)
- ✅ Carpet Boost and Carpet Mode
- ✅ Flow LED control
- ✅ Water Level control (scrub intensity)
- ✅ Mop Mode control (route selection)
- ✅ Cleaning Mode selector (Vacuum/Vac&mop/Mop)
- ✅ Room Cleaning switches
- ✅ Zone Cleaning API
- ✅ Mop Washing (wash dock)
- ✅ Wash Intensity control
- ✅ Dryer control (dry dock)
- ✅ Dryer Duration control
- ✅ Automatic feature detection
- ✅ Dynamic room switch creation
- ✅ Enhanced error handling

#### Improvements
- Better device compatibility
- Automatic feature detection
- Improved state synchronization
- Better error handling
- Enhanced logging

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
# homebridge-roborock-vacuum-update
# homebridge-roborock-vacuum-update
