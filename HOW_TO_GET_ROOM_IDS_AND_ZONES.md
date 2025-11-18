# How to Get Room IDs and Zone Coordinates

This guide explains how to find room IDs and zone coordinates from your Roborock device for use in the plugin configuration.

## Getting Room IDs

### Method 1: From Roborock App (Easiest)

1. **Open the Roborock App** on your phone
2. **Go to your vacuum's map view**
3. **Tap on a room** - The room should be highlighted
4. **Look for room information** - Some models show room IDs in the room details
5. **Check room names** - Rooms you've named in the app will have their names visible

### Method 2: Using Homebridge Logs (Automatic)

The plugin automatically fetches room mappings when it connects. To see the room IDs:

1. **Enable debug mode** in your config:
   ```json
   {
     "debugMode": true
   }
   ```

2. **Restart Homebridge** and check the logs

3. **Look for log messages** like:
   ```
   RoomIDs debug: {"16":"Living Room","17":"Kitchen","18":"Bedroom"}
   ```

4. **The numbers are the room IDs**, the strings are the room names

### Method 3: Using the Plugin's Room Mapping API

The plugin stores room mappings after calling `get_room_mapping`. You can access this programmatically, but the easiest way is through the logs.

### Method 4: From Roborock App Room Settings

1. **Open Roborock App**
2. **Go to Map Management** or **Room Settings**
3. **View room list** - Some models show room IDs here
4. **Note the room numbers** - These are typically the segment IDs

**Important Notes:**
- Room IDs are usually numeric (e.g., 16, 17, 18)
- Room names must match what you've set in the Roborock app
- If you haven't named rooms in the app, you may need to do that first
- Room IDs can change if you remap your home

## Getting Zone Coordinates

Zone coordinates are map positions in millimeters. The format is:
```
[bottom-left X, bottom-left Y, top-right X, top-right Y, number of cleanings]
```

### Method 1: Using Roborock App "Go To" Feature (Recommended)

1. **Open Roborock App**
2. **Go to Map view**
3. **Use "Go To" feature** - Tap on the map where you want to go
4. **Note the coordinates** - The app may show coordinates when you tap
5. **Test different positions** to find your zone boundaries

**Coordinate System:**
- **Base position (dock)**: Typically `25500, 25500` (X, Y)
- **X-axis (horizontal)**: 
  - Increase X = move right on map
  - Decrease X = move left on map
- **Y-axis (vertical)**:
  - Increase Y = move up on map  
  - Decrease Y = move down on map
- **Units**: Millimeters (1 meter = 1000 units)

### Method 2: Using Python-miio (Advanced)

If you have Python installed:

1. **Install python-miio**:
   ```bash
   pip install python-miio
   ```

2. **Find your device IP and token** (from Homebridge config or Roborock app)

3. **Test coordinates**:
   ```bash
   mirobo --ip 192.168.1.XX --token YOUR_TOKEN goto 25500 25500
   ```

4. **Adjust coordinates** and test until you find your zone boundaries:
   ```bash
   # Test bottom-left corner
   mirobo --ip 192.168.1.XX --token YOUR_TOKEN goto 24500 27000
   
   # Test top-right corner  
   mirobo --ip 192.168.1.XX --token YOUR_TOKEN goto 28000 30000
   ```

5. **Use the coordinates** you found in your config

### Method 3: Trial and Error with Homebridge Config

1. **Start with dock position**: `25500, 25500`

2. **Add a test zone** to your config:
   ```json
   {
     "zones": [
       {
         "name": "Test Zone",
         "zone": [[25000, 25000, 26000, 26000, 1]]
       }
     ]
   }
   ```

3. **Restart Homebridge** and test the zone switch

4. **Adjust coordinates** based on where the vacuum goes:
   - If it goes too far right: decrease top-right X
   - If it goes too far left: increase bottom-left X
   - If it goes too far up: decrease top-right Y
   - If it goes too far down: increase bottom-left Y

5. **Repeat** until you find the perfect zone

### Method 4: Using the Plugin's Map Viewer (If Available)

Some versions of the plugin include a map viewer. Check if you have access to:
- `http://your-homebridge-ip:port/map` (if available)
- This would show the map with coordinates

## Example Configurations

### Room Cleaning Example

```json
{
  "rooms": [
    {
      "id": 16,
      "name": "Living Room"
    },
    {
      "id": 17,
      "name": "Kitchen"
    },
    {
      "id": 18,
      "name": "Bedroom"
    }
  ]
}
```

### Zone Cleaning Example

```json
{
  "zones": [
    {
      "name": "Kitchen Zone",
      "zone": [
        [24500, 27000, 28000, 30000, 1]
      ]
    },
    {
      "name": "Living Room Corner",
      "zone": [
        [25000, 25000, 26500, 26500, 2]
      ]
    },
    {
      "name": "Multiple Zones",
      "zone": [
        [21000, 32000, 24000, 37000, 1],
        [25000, 25000, 32000, 32000, 1]
      ]
    }
  ]
}
```

## Tips and Tricks

### Finding Room IDs Quickly

1. **Enable debug mode** temporarily
2. **Restart Homebridge**
3. **Check logs** for "RoomIDs debug" message
4. **Copy the room IDs** from the log output

### Finding Zone Coordinates Efficiently

1. **Start with a small test zone** near the dock (25500, 25500)
2. **Use increments of 500-1000** (0.5-1 meter) when adjusting
3. **Test one coordinate at a time** - adjust X first, then Y
4. **Use the Roborock app's "Go To" feature** to verify positions
5. **Draw your zone on paper** first to visualize the coordinates

### Common Coordinate Ranges

- **Small room**: 2000-3000 units (2-3 meters)
- **Medium room**: 3000-5000 units (3-5 meters)
- **Large room**: 5000-8000 units (5-8 meters)
- **Entire floor**: 10000+ units (10+ meters)

### Troubleshooting

**Problem**: Room IDs not showing in logs
- **Solution**: Make sure you've named rooms in the Roborock app first
- **Solution**: Check that `get_room_mapping` is being called (enable debug mode)

**Problem**: Zone coordinates don't work
- **Solution**: Verify coordinates are in correct format: `[X1, Y1, X2, Y2, cleanings]`
- **Solution**: Make sure X1 < X2 and Y1 < Y2 (bottom-left to top-right)
- **Solution**: Check that coordinates are reasonable (typically 20000-35000 range)

**Problem**: Vacuum goes to wrong location
- **Solution**: Coordinates might be inverted - try swapping X and Y
- **Solution**: Check if your map orientation matches the coordinate system
- **Solution**: Start with dock position (25500, 25500) and work outward

## Additional Resources

- **Roborock App**: Use the map view and "Go To" feature
- **Python-miio**: For advanced coordinate testing
- **Homebridge Logs**: Enable debug mode to see room mappings
- **Plugin Documentation**: Check REFACTORING_SUMMARY.md for more info

## Quick Reference

**Room ID Format:**
```json
{
  "id": 16,           // Numeric room ID
  "name": "Kitchen"   // Room name (must match Roborock app)
}
```

**Zone Coordinate Format:**
```json
{
  "name": "Zone Name",
  "zone": [
    [X1, Y1, X2, Y2, cleanings]  // bottom-left to top-right, number of passes
  ]
}
```

**Where:**
- X1, Y1 = Bottom-left corner coordinates
- X2, Y2 = Top-right corner coordinates  
- cleanings = Number of times to clean (usually 1 or 2)
- All values in millimeters
- Dock typically at 25500, 25500

