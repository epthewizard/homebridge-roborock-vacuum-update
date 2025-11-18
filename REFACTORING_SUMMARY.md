# Plugin Refactoring Summary

## Overview

The plugin has been completely refactored to match the architecture of `homebridge-xiaomi-roborock-vacuum`, providing a modular, configurable, and maintainable structure.

## What Changed

### Architecture

**Before:** Monolithic structure with all features hardcoded in a single file
**After:** Modular service-based architecture with configurable features

### Key Improvements

1. **Modular Services**: Each feature is now a separate service class
   - `MainService` - Fan/Switch service (on/off + speed control)
   - `BatteryInfo` - Battery status
   - `RoomsService` - Individual room switches
   - `ZonesService` - Zone cleaning switches
   - `PauseSwitch` - Pause/resume switch
   - `DockService` - Dock status sensor
   - `FindMeService` - Find me switch
   - `WaterBoxService` - Water level/scrub intensity control

2. **DeviceManager**: Centralized device state management with reactive state changes

3. **Configurable Features**: All features can be enabled/disabled via config.json

4. **Better UX**:
   - Individual room switches (toggle rooms before starting)
   - Individual zone switches
   - Customizable service names (pauseWord, findMeWord, cleanword)
   - Better HomeKit integration with linked services

## Configuration

### New Config Options

```json
{
  "platform": "RoborockVacuumPlatformUpdate",
  "email": "your@email.com",
  "password": "yourpassword",
  "baseURL": "usiot.roborock.com",
  "debugMode": false,
  "serviceType": "fan",
  "pause": true,
  "pauseWord": "Pause",
  "findMe": true,
  "findMeWord": "where are you",
  "dock": true,
  "waterBox": true,
  "cleanword": "cleaning",
  "roomTimeout": 0,
  "rooms": [
    {
      "id": 16,
      "name": "Living Room"
    },
    {
      "id": 17,
      "name": "Kitchen"
    }
  ],
  "zones": [
    {
      "name": "Kitchen Zone",
      "zone": [[25000, 25000, 32000, 32000, 1]]
    }
  ]
}
```

### Config Options Explained

- **serviceType**: `"fan"` (default) or `"switch"` - Controls how the main service appears
- **pause**: Enable/disable pause switch
- **pauseWord**: Custom name for pause switch
- **findMe**: Enable/disable find me switch
- **findMeWord**: Custom name for find me switch
- **dock**: Enable/disable dock sensor
- **waterBox**: Enable/disable water level control (for mopping models)
- **cleanword**: Prefix for room/zone switches (e.g., "cleaning Living Room")
- **roomTimeout**: Auto-start cleaning after X seconds when rooms are selected
- **rooms**: Array of room definitions for room cleaning
- **zones**: Array of zone definitions for zone cleaning

## How It Works

### Service Initialization

1. Platform creates accessory
2. Accessory creates DeviceManager
3. Accessory initializes all services based on config
4. Services subscribe to DeviceManager state changes
5. Services add themselves to the accessory

### State Updates

1. Platform receives device updates via MQTT/Cloud
2. Platform calls `notifyDeviceUpdater()` on accessory
3. Accessory emits state changes through DeviceManager
4. Services react to state changes via RxJS observables
5. Services update their HomeKit characteristics

### Room Cleaning Flow

1. User toggles room switches in HomeKit
2. RoomsService tracks selected rooms
3. User turns on main Fan/Switch
4. MainService checks for selected rooms
5. If rooms selected: calls `app_segment_clean()`
6. If no rooms: calls `app_start()` for full clean

## File Structure

```
src/
├── services/
│   ├── types.ts                    # Core types and interfaces
│   ├── config_service.ts           # Config types and defaults
│   ├── device_manager.ts           # Device state management
│   ├── plugin_service_class.ts     # Base class for services
│   ├── product_info.ts             # Accessory information
│   ├── main_service.ts             # Main Fan/Switch service
│   ├── battery_info.ts             # Battery service
│   ├── rooms_service.ts            # Room cleaning switches
│   ├── zones_service.ts            # Zone cleaning switches
│   ├── pause_switch.ts             # Pause/resume switch
│   ├── dock_service.ts             # Dock sensor
│   ├── find_me_service.ts          # Find me switch
│   ├── water_box_service.ts        # Water level control
│   ├── utils/
│   │   └── ensure_name.ts          # Name persistence utility
│   └── index.ts                    # Service exports
├── platform.ts                     # Platform plugin
├── vacuum_accessory.ts             # Main accessory (refactored)
└── ...
```

## Migration Notes

### Breaking Changes

- Old config structure is still supported, but new options are available
- Service names may change slightly in HomeKit (they're now more customizable)
- Room switches now work differently - toggle rooms first, then start cleaning

### Backward Compatibility

- Existing configs will work with defaults
- Old accessory file is backed up as `vacuum_accessory_old.ts.bak`
- All existing features are preserved

## Testing

1. Build the plugin: `npm run build`
2. Restart Homebridge
3. Check logs for any errors
4. Verify services appear in HomeKit
5. Test room cleaning by toggling room switches, then starting cleaning
6. Test zone cleaning by toggling zone switches
7. Test pause/resume functionality
8. Test water level control (if supported by device)

## Future Enhancements

- Add more services (Dust Collection, Care Services, etc.)
- Add automatic room detection
- Add more customization options
- Improve error handling
- Add more device-specific features

## Credits

This refactoring is based on the excellent architecture of [homebridge-xiaomi-roborock-vacuum](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum).

