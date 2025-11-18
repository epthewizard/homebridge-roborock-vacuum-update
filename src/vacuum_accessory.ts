import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, CharacteristicEventTypes } from 'homebridge';
import RoborockPlatform from './platform';


import { catchError, concatMap, distinct } from "rxjs";
import { AccessoryPlugin, API, Logging } from "homebridge";
import { STATUS_CODES } from 'http';
import { log } from 'console';


/**
 * An instance of this class is created for each accessory the platform registers.
 * Each accessory may expose multiple services of different service types.
 */
export default class RoborockVacuumAccessory {
  private services: Service[] = [];
  private sceneServices: Map<string, Service> = new Map();
  private currentScenes: any[] = [];
  private roomServices: Map<string, Service> = new Map();
  private currentRooms: any[] = [];
  private currentCleaningMode: 'vacuum' | 'vac&mop' | 'mop' = 'vac&mop';

  constructor(
    private readonly platform: RoborockPlatform,
    private readonly accessory: PlatformAccessory<String>
  )
  {

    const self = this;

    // Accessory Information
    // https://developers.homebridge.io/#/service/AccessoryInformation
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Roborock',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.platform.roborockAPI.getProductAttribute(accessory.context, "model") || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.platform.roborockAPI.getVacuumDeviceInfo(accessory.context, "sn") || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.platform.roborockAPI.getVacuumDeviceInfo(accessory.context, "fv") || 'Unknown',
      );


    this.services['Fan'] = this.accessory.getService(this.platform.Service.Fanv2)
      || this.accessory.addService(this.platform.Service.Fanv2);

    
    // This is what is displayed as the default name on the Home app
    this.services['Fan'].setCharacteristic(
      this.platform.Characteristic.Name,
      this.platform.roborockAPI.getVacuumDeviceInfo(accessory.context, "name") || 'Roborock Vacuum',
    );

    this.services['Fan'].getCharacteristic(this.platform.Characteristic.Active)
    .onSet(this.setActive.bind(this))
    .onGet(this.getActive.bind(this));

    // Add Fan Speed Control (Suction Power)
    this.services['Fan'].getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onSet(this.setRotationSpeed.bind(this))
      .onGet(this.getRotationSpeed.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 25, // 0%, 25%, 50%, 75%, 100% (maps to Off, Quiet, Balanced, Turbo, Max)
      });

    // Add Pause/Resume (TargetFanState)
    this.services['Fan'].getCharacteristic(this.platform.Characteristic.TargetFanState)
      .onSet(this.setTargetFanState.bind(this))
      .onGet(this.getTargetFanState.bind(this));

    // Return to Dock Switch
    this.services['ReturnToDock'] = this.accessory.getServiceById(this.platform.Service.Switch, 'ReturnToDock')
      || this.accessory.addService(this.platform.Service.Switch, 'Return to Dock', 'ReturnToDock');
    
    this.services['ReturnToDock'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setReturnToDock.bind(this))
      .onGet(this.getReturnToDock.bind(this));

    // Spot Cleaning Switch
    this.services['SpotClean'] = this.accessory.getServiceById(this.platform.Service.Switch, 'SpotClean')
      || this.accessory.addService(this.platform.Service.Switch, 'Spot Clean', 'SpotClean');
    
    this.services['SpotClean'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setSpotClean.bind(this))
      .onGet(this.getSpotClean.bind(this));

    // Find Me Switch
    this.services['FindMe'] = this.accessory.getServiceById(this.platform.Service.Switch, 'FindMe')
      || this.accessory.addService(this.platform.Service.Switch, 'Find Me', 'FindMe');
    
    this.services['FindMe'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setFindMe.bind(this))
      .onGet(this.getFindMe.bind(this));

    // Error Status Contact Sensor
    this.services['ErrorStatus'] = this.accessory.getServiceById(this.platform.Service.ContactSensor, 'ErrorStatus')
      || this.accessory.addService(this.platform.Service.ContactSensor, 'Error Status', 'ErrorStatus');
    
    this.services['ErrorStatus'].getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.getErrorStatus.bind(this));

    // Water Level Control (Scrub Intensity) - Using Lightbulb service for level control
    // Only add if device supports it
    if (this.platform.roborockAPI.supportsWaterLevel(this.accessory.context)) {
      this.services['WaterLevel'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'WaterLevel')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Scrub Intensity', 'WaterLevel');
      
      this.services['WaterLevel'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setWaterLevelOn.bind(this))
        .onGet(this.getWaterLevelOn.bind(this));
      
      this.services['WaterLevel'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setWaterLevelBrightness.bind(this))
        .onGet(this.getWaterLevelBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0%, 33%, 67%, 100% (maps to Off, Mild, Standard, Intense)
        });
    }

    // Cleaning Mode Selector - Using Lightbulb service for mode selection
    // Only add if device supports water level (needed for vac&mop and mop-only modes)
    if (this.platform.roborockAPI.supportsWaterLevel(this.accessory.context)) {
      this.services['CleaningMode'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'CleaningMode')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Cleaning Mode', 'CleaningMode');
      
      this.services['CleaningMode'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setCleaningModeOn.bind(this))
        .onGet(this.getCleaningModeOn.bind(this));
      
      this.services['CleaningMode'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setCleaningModeBrightness.bind(this))
        .onGet(this.getCleaningModeBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0-33% = Vacuum, 34-66% = Vac&mop, 67-100% = Mop only
        });
    }

    // Mop Mode Control - Using Lightbulb service for mop route selection
    // Only add if device supports it
    if (this.platform.roborockAPI.supportsMopMode(this.accessory.context)) {
      this.services['MopMode'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'MopMode')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Mop Route', 'MopMode');
      
      this.services['MopMode'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setMopModeOn.bind(this))
        .onGet(this.getMopModeOn.bind(this));
      
      this.services['MopMode'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setMopModeBrightness.bind(this))
        .onGet(this.getMopModeBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 25, // 0%, 25%, 50%, 75%, 100% (maps to Standard, Deep, Deep+, Fast, etc.)
        });
    }

    // Room Cleaning Switches - Will be created dynamically
    this.roomServices = new Map<string, Service>();

    // LED Status Control
    if (this.platform.roborockAPI.supportsLedStatus(this.accessory.context)) {
      this.services['LedStatus'] = this.accessory.getServiceById(this.platform.Service.Switch, 'LedStatus')
        || this.accessory.addService(this.platform.Service.Switch, 'LED Status', 'LedStatus');
      
      this.services['LedStatus'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setLedStatus.bind(this))
        .onGet(this.getLedStatus.bind(this));
    }

    // Sound Volume Control
    this.services['SoundVolume'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'SoundVolume')
      || this.accessory.addService(this.platform.Service.Lightbulb, 'Sound Volume', 'SoundVolume');
    
    this.services['SoundVolume'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setSoundVolumeOn.bind(this))
      .onGet(this.getSoundVolumeOn.bind(this));
    
    this.services['SoundVolume'].getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setSoundVolumeBrightness.bind(this))
      .onGet(this.getSoundVolumeBrightness.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });

    // Child Lock Control
    if (this.platform.roborockAPI.supportsChildLock(this.accessory.context)) {
      this.services['ChildLock'] = this.accessory.getServiceById(this.platform.Service.Switch, 'ChildLock')
        || this.accessory.addService(this.platform.Service.Switch, 'Child Lock', 'ChildLock');
      
      this.services['ChildLock'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setChildLock.bind(this))
        .onGet(this.getChildLock.bind(this));
    }

    // Do Not Disturb (DND) Timer
    this.services['DoNotDisturb'] = this.accessory.getServiceById(this.platform.Service.Switch, 'DoNotDisturb')
      || this.accessory.addService(this.platform.Service.Switch, 'Do Not Disturb', 'DoNotDisturb');
    
    this.services['DoNotDisturb'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setDoNotDisturb.bind(this))
      .onGet(this.getDoNotDisturb.bind(this));

    // Dust Collection Control (Auto-Empty Dock)
    if (this.platform.roborockAPI.supportsDustCollection(this.accessory.context)) {
      this.services['DustCollection'] = this.accessory.getServiceById(this.platform.Service.Switch, 'DustCollection')
        || this.accessory.addService(this.platform.Service.Switch, 'Dust Collection', 'DustCollection');
      
      this.services['DustCollection'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setDustCollection.bind(this))
        .onGet(this.getDustCollection.bind(this));
    }

    // Carpet Mode Control
    if (this.platform.roborockAPI.supportsCarpetMode(this.accessory.context)) {
      this.services['CarpetMode'] = this.accessory.getServiceById(this.platform.Service.Switch, 'CarpetMode')
        || this.accessory.addService(this.platform.Service.Switch, 'Carpet Boost', 'CarpetMode');
      
      this.services['CarpetMode'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setCarpetMode.bind(this))
        .onGet(this.getCarpetMode.bind(this));

      // Carpet Clean Mode (Avoidance)
      this.services['CarpetCleanMode'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'CarpetCleanMode')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Carpet Mode', 'CarpetCleanMode');
      
      this.services['CarpetCleanMode'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setCarpetCleanModeOn.bind(this))
        .onGet(this.getCarpetCleanModeOn.bind(this));
      
      this.services['CarpetCleanMode'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setCarpetCleanModeBrightness.bind(this))
        .onGet(this.getCarpetCleanModeBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0-33% = Avoid, 34-66% = Rise, 67-100% = Ignore
        });
    }

    // Flow LED Status
    if (this.platform.roborockAPI.supportsFlowLed(this.accessory.context)) {
      this.services['FlowLed'] = this.accessory.getServiceById(this.platform.Service.Switch, 'FlowLed')
        || this.accessory.addService(this.platform.Service.Switch, 'Flow LED', 'FlowLed');
      
      this.services['FlowLed'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setFlowLed.bind(this))
        .onGet(this.getFlowLed.bind(this));
    }

    // Mop Washing (Wash Dock)
    if (this.platform.roborockAPI.supportsWashing(this.accessory.context)) {
      this.services['MopWash'] = this.accessory.getServiceById(this.platform.Service.Switch, 'MopWash')
        || this.accessory.addService(this.platform.Service.Switch, 'Mop Washing', 'MopWash');
      
      this.services['MopWash'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setMopWash.bind(this))
        .onGet(this.getMopWash.bind(this));

      // Wash Towel Mode (Wash Intensity)
      this.services['WashTowelMode'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'WashTowelMode')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Wash Intensity', 'WashTowelMode');
      
      this.services['WashTowelMode'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setWashTowelModeOn.bind(this))
        .onGet(this.getWashTowelModeOn.bind(this));
      
      this.services['WashTowelMode'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setWashTowelModeBrightness.bind(this))
        .onGet(this.getWashTowelModeBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0-33% = Eco, 34-66% = Medium, 67-100% = Intense
        });
    }

    // Drying (Dry Dock)
    if (this.platform.roborockAPI.supportsDrying(this.accessory.context)) {
      this.services['Dryer'] = this.accessory.getServiceById(this.platform.Service.Switch, 'Dryer')
        || this.accessory.addService(this.platform.Service.Switch, 'Dryer', 'Dryer');
      
      this.services['Dryer'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setDryer.bind(this))
        .onGet(this.getDryer.bind(this));

      // Dryer Duration (Dry Time)
      this.services['DryerDuration'] = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'DryerDuration')
        || this.accessory.addService(this.platform.Service.Lightbulb, 'Dryer Duration', 'DryerDuration');
      
      this.services['DryerDuration'].getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setDryerDurationOn.bind(this))
        .onGet(this.getDryerDurationOn.bind(this));
      
      this.services['DryerDuration'].getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setDryerDurationBrightness.bind(this))
        .onGet(this.getDryerDurationBrightness.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0-33% = 2h, 34-66% = 3h, 67-100% = 4h
        });
    }

    // Zone Cleaning (Basic - requires saved zones or coordinates)
    // Note: Zone cleaning requires coordinates, so this is a basic trigger
    // For full zone control, zones need to be saved/configured separately
    this.services['ZoneClean'] = this.accessory.getServiceById(this.platform.Service.Switch, 'ZoneClean')
      || this.accessory.addService(this.platform.Service.Switch, 'Zone Clean', 'ZoneClean');
    
    this.services['ZoneClean'].getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setZoneClean.bind(this))
      .onGet(this.getZoneClean.bind(this));

    this.services['Battery'] = this.accessory.getService(this.platform.Service.Battery)
      || this.accessory.addService(this.platform.Service.Battery);
    
    this.services['Battery'].setCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      this.platform.roborockAPI.getVacuumDeviceStatus(accessory.context, "battery") || 0,
    );

    this.services['Battery'].setCharacteristic(
      this.platform.Characteristic.StatusLowBattery,
      this.platform.roborockAPI.getVacuumDeviceStatus(accessory.context, "battery") < 20 ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    );

    this.services['Battery'].setCharacteristic(
      this.platform.Characteristic.ChargingState,
      this.platform.roborockAPI.getVacuumDeviceStatus(accessory.context, "charge_status") == 1 ? this.platform.Characteristic.ChargingState.CHARGING : this.platform.Characteristic.ChargingState.NOT_CHARGING
    );

    // Initialize scene switches
    this.updateSceneSwitches();

    // Initialize room switches and all states
    this.updateRoomSwitches();
    if (this.services['WaterLevel']) {
      this.updateWaterLevelState();
    }
    if (this.services['MopMode']) {
      this.updateMopModeState();
    }
    if (this.services['LedStatus']) {
      this.updateLedStatusState();
    }
    this.updateSoundVolumeState();
    if (this.services['ChildLock']) {
      this.updateChildLockState();
    }
    this.updateDoNotDisturbState();
    if (this.services['DustCollection']) {
      this.updateDustCollectionState();
    }
    if (this.services['CarpetMode']) {
      this.updateCarpetModeState();
    }
    if (this.services['CarpetCleanMode']) {
      this.updateCarpetCleanModeState();
    }
    if (this.services['FlowLed']) {
      this.updateFlowLedState();
    }
    if (this.services['MopWash']) {
      this.updateMopWashState();
    }
    if (this.services['WashTowelMode']) {
      this.updateWashTowelModeState();
    }
    if (this.services['Dryer']) {
      this.updateDryerState();
    }
    if (this.services['DryerDuration']) {
      this.updateDryerDurationState();
    }
    
    // Retry room switches after a delay (in case room mapping isn't ready yet)
    setTimeout(() => {
      this.updateRoomSwitches();
    }, 5000);

   }



  updateDeviceState() {

    try{

      this.services['Fan'].updateCharacteristic(
        this.platform.Characteristic.Active,
        this.platform.roborockAPI.isCleaning(this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state")) ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE
      );

      this.services['Battery'].updateCharacteristic(
        this.platform.Characteristic.BatteryLevel,
        this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "battery") || 0
      );

      this.services['Battery'].updateCharacteristic(
        this.platform.Characteristic.StatusLowBattery,
        this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "battery") < 20 ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      );

      this.services['Battery'].updateCharacteristic(
        this.platform.Characteristic.ChargingState,
        this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "charge_status") != 0 ? this.platform.Characteristic.ChargingState.CHARGING : this.platform.Characteristic.ChargingState.NOT_CHARGING
      );

      // Update Fan Speed (RotationSpeed)
      const fanPower = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "fan_power");
      if (fanPower !== undefined) {
        const rotationSpeed = this.fanPowerToRotationSpeed(fanPower);
        this.services['Fan'].updateCharacteristic(
          this.platform.Characteristic.RotationSpeed,
          rotationSpeed
        );
      }

      // Update Target Fan State (Pause/Resume)
      const state = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state");
      if (state === 10) { // Paused
        this.services['Fan'].updateCharacteristic(
          this.platform.Characteristic.TargetFanState,
          this.platform.Characteristic.TargetFanState.MANUAL
        );
      } else {
        this.services['Fan'].updateCharacteristic(
          this.platform.Characteristic.TargetFanState,
          this.platform.Characteristic.TargetFanState.AUTO
        );
      }

      // Update Error Status
      const errorCode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "error_code");
      if (errorCode !== undefined) {
        const hasError = errorCode !== 0;
        this.services['ErrorStatus'].updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          hasError ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
        );
      }

      // Update Water Level (if supported)
      if (this.services['WaterLevel']) {
        this.updateWaterLevelState();
      }

      // Update Mop Mode (if supported)
      if (this.services['MopMode']) {
        this.updateMopModeState();
      }

      // Update LED Status (if supported)
      if (this.services['LedStatus']) {
        this.updateLedStatusState();
      }

      // Update Sound Volume
      this.updateSoundVolumeState();

      // Update Child Lock (if supported)
      if (this.services['ChildLock']) {
        this.updateChildLockState();
      }

      // Update Do Not Disturb
      this.updateDoNotDisturbState();

      // Update Dust Collection (if supported)
      if (this.services['DustCollection']) {
        this.updateDustCollectionState();
      }

      // Update Carpet Mode (if supported)
      if (this.services['CarpetMode']) {
        this.updateCarpetModeState();
      }

      if (this.services['CarpetCleanMode']) {
        this.updateCarpetCleanModeState();
      }

      // Update Flow LED (if supported)
      if (this.services['FlowLed']) {
        this.updateFlowLedState();
      }

      // Update Mop Washing (if supported)
      if (this.services['MopWash']) {
        this.updateMopWashState();
      }

      if (this.services['WashTowelMode']) {
        this.updateWashTowelModeState();
      }

      // Update Drying (if supported)
      if (this.services['Dryer']) {
        this.updateDryerState();
      }

      if (this.services['DryerDuration']) {
        this.updateDryerDurationState();
      }

      this.platform.log.debug("Device state is " + this.state_code_to_state(this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state")));
    
    
    }catch(e) {
      this.platform.log.error("Error updating device state: " + e);
    }


  }

  /**
   * Update scene switches based on available scenes for this device
   */
  updateSceneSwitches() {
    try {
      // Get scenes for this device
      const deviceScenes = this.platform.roborockAPI.getScenesForDevice(this.accessory.context);
      
      // Check if scenes have changed
      if (this.scenesChanged(deviceScenes)) {
        this.platform.log.debug(`Updating scene switches for device ${this.accessory.context}`);
        
        // Remove existing scene switches that are no longer available
       
        // Add new scene switches
        for (const scene of deviceScenes) {
          
          try{
            const sceneId = scene.id.toString();
            const sceneName = scene.name.replaceAll(" ", "_");
;
          
            if (!this.sceneServices.has(sceneId) && scene.enabled) {
              this.platform.log.debug(`Adding scene switch for: ${scene.name} (ID: ${sceneId})`);

              const switchService = this.accessory.getServiceById(this.platform.Service.Switch, `scene-${sceneId}`) || this.accessory.addService(
                this.platform.Service.Switch,
                sceneName,
                `scene-${sceneId}`
              );

              switchService.setCharacteristic(
                this.platform.Characteristic.Name,
                sceneName
              );
              
              switchService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
              switchService.setCharacteristic(this.platform.Characteristic.ConfiguredName, sceneName);

              switchService.getCharacteristic(this.platform.Characteristic.On)
                .onSet(this.setSceneSwitch.bind(this, sceneId))
                .onGet(this.getSceneSwitch.bind(this, sceneId));
              
              this.sceneServices.set(sceneId, switchService);
            }

          }catch(e) {
            this.platform.log.error(`Error processing scene ${scene.name}: ${e}`);
          }



        }

                
        //Remove scene switches that are no longer available
        this.accessory.services.forEach((service) => {
          if (service instanceof this.platform.Service.Switch && service.UUID.startsWith('scene-')) {
            const sceneId = service.UUID.replace('scene-', '');

            // Check if the scene id in deviceScenes
            if(!deviceScenes.some(scene => scene.id.toString() === sceneId)) {
              this.platform.log.debug(`Removing scene switch for: ${service.displayName} (ID: ${sceneId})`);
              this.accessory.removeService(service);
              this.sceneServices.delete(sceneId);              
            }
          }
        });

        // Update current scenes
        this.currentScenes = deviceScenes;
      }
    } catch (error) {
      this.platform.log.error(`Error updating scene switches: ${error}`);
    }
  }

  /**
   * Check if scenes have changed
   */
  private scenesChanged(newScenes: any[]): boolean {
    if (this.currentScenes.length !== newScenes.length) {
      return true;
    }
    
    const currentIds = this.currentScenes.map(scene => scene.id).sort();
    const newIds = newScenes.map(scene => scene.id).sort();
    
    return JSON.stringify(currentIds) !== JSON.stringify(newIds);
  }



  /**
   * Handle scene switch activation
   */
  async setSceneSwitch(sceneId: string, value: CharacteristicValue) {
    try {
      this.platform.log.debug(`Scene switch ${sceneId} set to: ${value}`);
      
      if (value) {
        // Execute the scene
        await this.platform.roborockAPI.executeScene({val: sceneId});
        this.platform.log.info(`Executed scene ID: ${sceneId}`);
        
        // Turn off the switch after execution (momentary switch behavior)
        setTimeout(() => {
          const service = this.sceneServices.get(sceneId);
          if (service) {
            service.updateCharacteristic(this.platform.Characteristic.On, false);
          }
        }, 1000);
      }
    } catch (error) {
      this.platform.log.error(`Error executing scene ${sceneId}: ${error}`);
      
      // Turn off the switch if there was an error
      const service = this.sceneServices.get(sceneId);
      if (service) {
        service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    }
  }

  /**
   * Get scene switch state (always returns false for momentary behavior)
   */
  async getSceneSwitch(sceneId: string): Promise<CharacteristicValue> {
    return false; // Momentary switch - always return false
  }

  notifyDeviceUpdater(id:string, data) {

    try{
      if(id == 'CloudMessage' || id == 'LocalMessage') {

        this.platform.log.debug(`Updating accessory with ${id} data: ` + JSON.stringify(data)); 
        
  
        if(data.length > 0) {
          const messages = data[0];
          if(messages.hasOwnProperty('state')) {
            this.services['Fan'].updateCharacteristic(
              this.platform.Characteristic.Active,
              this.isCleaningState(messages.state) ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE
            );
          }
          
          if(messages.hasOwnProperty('battery')) {
            this.services['Battery'].updateCharacteristic(
              this.platform.Characteristic.BatteryLevel,
              messages.battery
            );
      
            this.services['Battery'].updateCharacteristic(
              this.platform.Characteristic.StatusLowBattery,
              messages.battery < 20 ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
            );

          }

          if(messages.hasOwnProperty('charge_status')) {
      
            this.services['Battery'].updateCharacteristic(
              this.platform.Characteristic.ChargingState,
              messages.charge_status != 0 ? this.platform.Characteristic.ChargingState.CHARGING : this.platform.Characteristic.ChargingState.NOT_CHARGING
            );
          }

          if(messages.hasOwnProperty('in_cleaning')) {
      
            this.services['Fan'].updateCharacteristic(
              this.platform.Characteristic.Active,
              messages.in_cleaning != 0 ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE
            );
          }

          if(messages.hasOwnProperty('fan_power')) {
            const rotationSpeed = this.fanPowerToRotationSpeed(messages.fan_power);
            this.services['Fan'].updateCharacteristic(
              this.platform.Characteristic.RotationSpeed,
              rotationSpeed
            );
          }

          if(messages.hasOwnProperty('state')) {
            // Update Target Fan State based on pause state
            const isPaused = messages.state === 10;
            this.services['Fan'].updateCharacteristic(
              this.platform.Characteristic.TargetFanState,
              isPaused ? this.platform.Characteristic.TargetFanState.MANUAL : this.platform.Characteristic.TargetFanState.AUTO
            );
          }

          if(messages.hasOwnProperty('error_code')) {
            const hasError = messages.error_code !== 0;
            this.services['ErrorStatus'].updateCharacteristic(
              this.platform.Characteristic.ContactSensorState,
              hasError ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED
            );
          }

          if(messages.hasOwnProperty('water_box_custom_mode') && this.services['WaterLevel']) {
            this.updateWaterLevelState();
          }

          if(messages.hasOwnProperty('mop_mode') && this.services['MopMode']) {
            this.updateMopModeState();
          }

          if(messages.hasOwnProperty('led_status') && this.services['LedStatus']) {
            this.updateLedStatusState();
          }

          if(messages.hasOwnProperty('sound_volume')) {
            this.updateSoundVolumeState();
          }

          if(messages.hasOwnProperty('child_lock_status') && this.services['ChildLock']) {
            this.updateChildLockState();
          }

          if(messages.hasOwnProperty('dnd_timer')) {
            this.updateDoNotDisturbState();
          }

          if((messages.hasOwnProperty('dust_collection_switch_status') || messages.hasOwnProperty('dust_collection_mode')) && this.services['DustCollection']) {
            this.updateDustCollectionState();
          }

          if((messages.hasOwnProperty('carpet_mode') || messages.hasOwnProperty('carpet_clean_mode')) && this.services['CarpetMode']) {
            this.updateCarpetModeState();
            if (this.services['CarpetCleanMode']) {
              this.updateCarpetCleanModeState();
            }
          }

          if(messages.hasOwnProperty('flow_led_status') && this.services['FlowLed']) {
            this.updateFlowLedState();
          }

          if((messages.hasOwnProperty('wash_status') || messages.hasOwnProperty('wash_towel_mode')) && this.services['MopWash']) {
            this.updateMopWashState();
            if (this.services['WashTowelMode']) {
              this.updateWashTowelModeState();
            }
          }

          if((messages.hasOwnProperty('dry_status') || messages.hasOwnProperty('dryer_setting')) && this.services['Dryer']) {
            this.updateDryerState();
            if (this.services['DryerDuration']) {
              this.updateDryerDurationState();
            }
          }

          if((messages.hasOwnProperty('fan_power') || messages.hasOwnProperty('water_box_custom_mode')) && this.services['CleaningMode']) {
            // Update cleaning mode based on fan and water settings
            const fanPower = messages.fan_power !== undefined ? messages.fan_power : this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "fan_power");
            const waterLevel = messages.water_box_custom_mode !== undefined ? messages.water_box_custom_mode : this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "water_box_custom_mode");
            
            const isFanOn = fanPower !== undefined && fanPower !== 105;
            const isWaterOn = waterLevel !== undefined && waterLevel !== 200;
            
            let brightness: number;
            if (!isFanOn && isWaterOn) {
              brightness = 100; // Mop only
            } else if (isFanOn && isWaterOn) {
              brightness = 50; // Vac&mop
            } else {
              brightness = 0; // Vacuum only
            }
            
            this.services['CleaningMode'].updateCharacteristic(
              this.platform.Characteristic.Brightness,
              brightness
            );
          }

        }
  
        if(data.hasOwnProperty('dps') && data.dps.hasOwnProperty('121')) {
          
          this.platform.log.debug(`${this.platform.roborockAPI.getVacuumDeviceInfo(this.accessory.context, "name")} state update to: ${this.state_code_to_state(data.dps['121'])}`);

          this.services['Fan'].updateCharacteristic(
            this.platform.Characteristic.Active,
            this.isCleaningState(data.dps['121']) ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE
          );
        }
  
        if(data.hasOwnProperty('dps') && data.dps.hasOwnProperty('122')) {

          this.platform.log.debug(`${this.platform.roborockAPI.getVacuumDeviceInfo(this.accessory.context, "name")} battery update to: ${data.dps['122']}`);
 
          
          this.services['Battery'].updateCharacteristic(
            this.platform.Characteristic.BatteryLevel,
            data.dps['122']
          );
    
          this.services['Battery'].updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery,
            data.dps['122'] < 20 ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
          );
        }
        
  
      }
      else if(id == 'HomeData') {
       this.updateDeviceState();
       // Update scene switches when home data changes
       this.updateSceneSwitches();
       // Update room switches when home data changes
       this.updateRoomSwitches();
      }
    
    
    }catch(e) {
      this.platform.log.error("Error notifying device updater: " + e);
    }
    

  
  
  }

  async setActive(value: CharacteristicValue) {


    try{
      this.platform.log.debug("Setting active to " + value);

      if(value == this.platform.Characteristic.Active.ACTIVE) {
        await this.platform.roborockAPI.app_start(this.accessory.context);
      } 
      else {

          await this.platform.roborockAPI.app_stop(this.accessory.context);
          await this.platform.roborockAPI.app_charge(this.accessory.context);

      }

      this.services['Fan'].updateCharacteristic(
        this.platform.Characteristic.Active,
        value
      );


    }catch(e) {
      this.platform.log.error("Error setting active: " + e);
    }

  }

  async getActive():Promise<CharacteristicValue> {    

    this.updateDeviceState();
    return this.isCleaning() ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
  }

  state_code_to_state(code:number):string {

    const RoborockStateCodes = {
      0: "Unknown",
      1: "Initiating",
      2: "Sleeping",
      3: "Idle",
      4: "Remote Control",
      5: "Cleaning",
      6: "Returning Dock",
      7: "Manual Mode",
      8: "Charging",
      9: "Charging Error",
      10: "Paused",
      11: "Spot Cleaning",
      12: "In Error",
      13: "Shutting Down",
      14: "Updating",
      15: "Docking",
      16: "Go To",
      17: "Zone Clean",
      18: "Room Clean",
      22: "Empying dust container",
      23: "Washing the mop",
      26: "Going to wash the mop",
      28: "In call",
      29: "Mapping",
      100: "Fully Charged",
    };

    return RoborockStateCodes[code] || "Unknown";
    
  }

  isCleaning():boolean {
    
    return this.isCleaningState(this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state"));

  }

  isCleaningState(state:number):boolean {
  
		switch (state) {
			case 4: // Remote Control
			case 5: // Cleaning
			case 6: // Returning Dock
			case 7: // Manual Mode
			case 11: // Spot Cleaning
			case 15: // Docking
			case 16: // Go To
			case 17: // Zone Clean
			case 18: // Room Clean
      case 23: // Washing the mop
			case 26: // Going to wash the mop
				return true;
			default:
				return false;
		}

  }

  // Fan Speed Control (Suction Power)
  async setRotationSpeed(value: CharacteristicValue): Promise<void> {
    try {
      this.platform.log.debug(`Setting rotation speed to ${value}%`);
      
      // Map percentage to fan power levels
      // 0% = Off (105), 25% = Quiet (101), 50% = Balanced (102), 75% = Turbo (103), 100% = Max (104)
      const numValue = Number(value);
      let fanPower: number;
      if (numValue === 0) {
        fanPower = 105; // Off
      } else if (numValue <= 25) {
        fanPower = 101; // Quiet
      } else if (numValue <= 50) {
        fanPower = 102; // Balanced
      } else if (numValue <= 75) {
        fanPower = 103; // Turbo
      } else {
        fanPower = 104; // Max
      }

      await this.platform.roborockAPI.set_custom_mode(this.accessory.context, fanPower);
      
      this.services['Fan'].updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        value
      );
    } catch (e) {
      this.platform.log.error(`Error setting rotation speed: ${e}`);
    }
  }

  async getRotationSpeed(): Promise<CharacteristicValue> {
    const fanPower = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "fan_power");
    return this.fanPowerToRotationSpeed(fanPower);
  }

  fanPowerToRotationSpeed(fanPower: number): number {
    // Map fan power to percentage
    switch (fanPower) {
      case 105: return 0;   // Off
      case 101: return 25;  // Quiet
      case 102: return 50;  // Balanced
      case 103: return 75;  // Turbo
      case 104: return 100; // Max
      case 108: return 100; // Max+ (some models)
      default: return 50;   // Default to Balanced
    }
  }

  // Pause/Resume Control
  async setTargetFanState(value: CharacteristicValue): Promise<void> {
    try {
      this.platform.log.debug(`Setting target fan state to ${value}`);
      
      const state = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state");
      const isPaused = state === 10;
      
      if (value === this.platform.Characteristic.TargetFanState.MANUAL && !isPaused) {
        // Pause
        await this.platform.roborockAPI.app_pause(this.accessory.context);
      } else if (value === this.platform.Characteristic.TargetFanState.AUTO && isPaused) {
        // Resume (start cleaning)
        await this.platform.roborockAPI.app_start(this.accessory.context);
      }
      
      this.services['Fan'].updateCharacteristic(
        this.platform.Characteristic.TargetFanState,
        value
      );
    } catch (e) {
      this.platform.log.error(`Error setting target fan state: ${e}`);
    }
  }

  async getTargetFanState(): Promise<CharacteristicValue> {
    const state = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "state");
    return state === 10 
      ? this.platform.Characteristic.TargetFanState.MANUAL 
      : this.platform.Characteristic.TargetFanState.AUTO;
  }

  // Return to Dock
  async setReturnToDock(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        this.platform.log.debug("Returning to dock");
        await this.platform.roborockAPI.app_charge(this.accessory.context);
        
        // Turn off switch after a delay (momentary behavior)
        setTimeout(() => {
          this.services['ReturnToDock'].updateCharacteristic(
            this.platform.Characteristic.On,
            false
          );
        }, 1000);
      }
    } catch (e) {
      this.platform.log.error(`Error returning to dock: ${e}`);
      this.services['ReturnToDock'].updateCharacteristic(
        this.platform.Characteristic.On,
        false
      );
    }
  }

  async getReturnToDock(): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  // Spot Cleaning
  async setSpotClean(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        this.platform.log.debug("Starting spot cleaning");
        await this.platform.roborockAPI.app_spot(this.accessory.context);
        
        // Turn off switch after a delay (momentary behavior)
        setTimeout(() => {
          this.services['SpotClean'].updateCharacteristic(
            this.platform.Characteristic.On,
            false
          );
        }, 1000);
      }
    } catch (e) {
      this.platform.log.error(`Error starting spot cleaning: ${e}`);
      this.services['SpotClean'].updateCharacteristic(
        this.platform.Characteristic.On,
        false
      );
    }
  }

  async getSpotClean(): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  // Find Me
  async setFindMe(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        this.platform.log.debug("Finding robot");
        await this.platform.roborockAPI.find_me(this.accessory.context);
        
        // Turn off switch after a delay (momentary behavior)
        setTimeout(() => {
          this.services['FindMe'].updateCharacteristic(
            this.platform.Characteristic.On,
            false
          );
        }, 1000);
      }
    } catch (e) {
      this.platform.log.error(`Error finding robot: ${e}`);
      this.services['FindMe'].updateCharacteristic(
        this.platform.Characteristic.On,
        false
      );
    }
  }

  async getFindMe(): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  // Error Status
  async getErrorStatus(): Promise<CharacteristicValue> {
    const errorCode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "error_code");
    const hasError = errorCode !== undefined && errorCode !== 0;
    return hasError 
      ? this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED 
      : this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  }

  // Water Level Control (Scrub Intensity)
  async setWaterLevelOn(value: CharacteristicValue): Promise<void> {
    // When turned on, set to default (Standard/Moderate)
    if (value) {
      await this.setWaterLevelBrightness(67); // Standard
    } else {
      await this.setWaterLevelBrightness(0); // Off
    }
  }

  async getWaterLevelOn(): Promise<CharacteristicValue> {
    const waterLevel = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "water_box_custom_mode");
    return waterLevel !== undefined && waterLevel !== 200; // On if not Off (200)
  }

  async setWaterLevelBrightness(value: CharacteristicValue): Promise<void> {
    try {
      this.platform.log.debug(`Setting water level (scrub intensity) to ${value}%`);
      
      // Check if device uses MILD/STANDARD/INTENSE (shake mop) or LOW/MEDIUM/HIGH
      const usesShakeMop = this.platform.roborockAPI.usesShakeMopWaterModes(this.accessory.context);
      
      // Map percentage to water level values
      // For shake mop devices: 0% = Off (200), 1-33% = Mild (201), 34-66% = Standard (202), 67-100% = Intense (203)
      // For other devices: 0% = Off (200), 1-33% = Low (201), 34-66% = Medium (202), 67-100% = High (203)
      const numValue = Number(value);
      let waterLevel: number;
      if (numValue === 0) {
        waterLevel = 200; // Off
      } else if (numValue <= 33) {
        waterLevel = 201; // Mild/Low
      } else if (numValue <= 66) {
        waterLevel = 202; // Standard/Medium
      } else {
        waterLevel = 203; // Intense/High
      }

      await this.platform.roborockAPI.set_water_box_custom_mode(this.accessory.context, waterLevel);
      
      if (this.services['WaterLevel']) {
        this.services['WaterLevel'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          value
        );
        this.services['WaterLevel'].updateCharacteristic(
          this.platform.Characteristic.On,
          waterLevel !== 200
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting water level: ${e}`);
    }
  }

  async getWaterLevelBrightness(): Promise<CharacteristicValue> {
    const waterLevel = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "water_box_custom_mode");
    if (waterLevel === undefined || waterLevel === "") {
      return 67; // Default to Standard
    }
    return this.waterLevelToBrightness(waterLevel);
  }

  waterLevelToBrightness(waterLevel: number): number {
    // Map water level to percentage
    switch (waterLevel) {
      case 200: return 0;   // Off
      case 201: return 33;  // Mild/Low
      case 202: return 67;  // Standard/Medium
      case 203: return 100; // Intense/High
      default: return 67;   // Default to Standard
    }
  }

  updateWaterLevelState() {
    if (!this.services['WaterLevel']) {
      return;
    }
    const waterLevel = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "water_box_custom_mode");
    if (waterLevel !== undefined && waterLevel !== "") {
      const brightness = this.waterLevelToBrightness(waterLevel);
      this.services['WaterLevel'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        brightness
      );
      this.services['WaterLevel'].updateCharacteristic(
        this.platform.Characteristic.On,
        waterLevel !== 200
      );
    }
  }

  // Cleaning Mode Selector
  async setCleaningModeOn(value: CharacteristicValue): Promise<void> {
    // When turned on, set to default (Vac&mop)
    if (value) {
      await this.setCleaningModeBrightness(50); // Vac&mop
    }
  }

  async getCleaningModeOn(): Promise<CharacteristicValue> {
    // Always return true if a mode is set
    return true;
  }

  async setCleaningModeBrightness(value: CharacteristicValue): Promise<void> {
    try {
      this.platform.log.debug(`Setting cleaning mode to ${value}%`);
      
      // Map percentage to cleaning mode
      // 0-33% = Vacuum only, 34-66% = Vac&mop, 67-100% = Mop only
      const numValue = Number(value);
      let fanPower: number;
      let waterLevel: number;
      let mode: 'vacuum' | 'vac&mop' | 'mop';
      
      if (numValue <= 33) {
        // Vacuum only: Fan on, Water off
        fanPower = 102; // Balanced (default)
        waterLevel = 200; // Off
        mode = 'vacuum';
      } else if (numValue <= 66) {
        // Vac&mop: Fan on, Water on
        fanPower = 102; // Balanced (default)
        waterLevel = 202; // Standard (default)
        mode = 'vac&mop';
      } else {
        // Mop only: Fan off, Water on
        fanPower = 105; // Off
        waterLevel = 202; // Standard (default)
        mode = 'mop';
      }

      // Set both settings
      await this.platform.roborockAPI.set_custom_mode(this.accessory.context, fanPower);
      if (this.platform.roborockAPI.supportsWaterLevel(this.accessory.context)) {
        await this.platform.roborockAPI.set_water_box_custom_mode(this.accessory.context, waterLevel);
      }
      
      this.currentCleaningMode = mode;
      
      if (this.services['CleaningMode']) {
        this.services['CleaningMode'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          value
        );
        this.services['CleaningMode'].updateCharacteristic(
          this.platform.Characteristic.On,
          true
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting cleaning mode: ${e}`);
    }
  }

  async getCleaningModeBrightness(): Promise<CharacteristicValue> {
    const fanPower = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "fan_power");
    const waterLevel = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "water_box_custom_mode");
    
    // Determine mode from current settings
    const isFanOn = fanPower !== undefined && fanPower !== "" && fanPower !== 105;
    const isWaterOn = waterLevel !== undefined && waterLevel !== "" && waterLevel !== 200;
    
    if (!isFanOn && isWaterOn) {
      return 100; // Mop only
    } else if (isFanOn && isWaterOn) {
      return 50; // Vac&mop
    } else {
      return 0; // Vacuum only
    }
  }

  // Room Cleaning
  async updateRoomSwitches() {
    try {
      // Get rooms for this device
      const rooms = this.platform.roborockAPI.getRoomList(this.accessory.context);
      
      // Check if rooms have changed
      if (this.roomsChanged(rooms)) {
        this.platform.log.debug(`Updating room switches for device ${this.accessory.context}`);
        
        // Add new room switches
        for (const room of rooms) {
          try {
            const roomId = room.segmentId.toString();
            const roomName = room.name.replace(/[^a-zA-Z0-9]/g, '_');
            
            if (!this.roomServices.has(roomId)) {
              this.platform.log.debug(`Adding room switch for: ${room.name} (ID: ${roomId})`);

              const switchService = this.accessory.getServiceById(this.platform.Service.Switch, `room-${roomId}`) 
                || this.accessory.addService(
                  this.platform.Service.Switch,
                  `Clean ${room.name}`,
                  `room-${roomId}`
                );

              switchService.setCharacteristic(
                this.platform.Characteristic.Name,
                `Clean ${room.name}`
              );
              
              switchService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
              switchService.setCharacteristic(this.platform.Characteristic.ConfiguredName, `Clean ${room.name}`);

              switchService.getCharacteristic(this.platform.Characteristic.On)
                .onSet(this.setRoomSwitch.bind(this, roomId))
                .onGet(this.getRoomSwitch.bind(this, roomId));
              
              this.roomServices.set(roomId, switchService);
            }
          } catch (e) {
            this.platform.log.error(`Error processing room ${room.name}: ${e}`);
          }
        }
        
        // Remove room switches that are no longer available
        const currentRoomIds = new Set(rooms.map(room => room.segmentId.toString()));
        for (const [roomId, service] of this.roomServices.entries()) {
          if (!currentRoomIds.has(roomId)) {
            this.platform.log.debug(`Removing room switch for: ${service.displayName} (ID: ${roomId})`);
            this.accessory.removeService(service);
            this.roomServices.delete(roomId);
          }
        }

        // Update current rooms
        this.currentRooms = rooms;
      }
    } catch (error) {
      this.platform.log.error(`Error updating room switches: ${error}`);
    }
  }

  private roomsChanged(newRooms: any[]): boolean {
    if (this.currentRooms.length !== newRooms.length) {
      return true;
    }
    
    const currentIds = this.currentRooms.map(room => room.segmentId).sort();
    const newIds = newRooms.map(room => room.segmentId).sort();
    
    return JSON.stringify(currentIds) !== JSON.stringify(newIds);
  }

  async setRoomSwitch(roomId: string, value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        this.platform.log.debug(`Starting room cleaning for room ${roomId}`);
        
        // Get room list and create room list for cleaning
        const rooms = this.platform.roborockAPI.getRoomList(this.accessory.context);
        const room = rooms.find(r => r.segmentId.toString() === roomId);
        
        if (room) {
          const roomList = {
            segments: [room.segmentId],
            repeat: 1
          };
          
          await this.platform.roborockAPI.app_segment_clean(this.accessory.context, [roomList]);
          this.platform.log.info(`Started cleaning room: ${room.name}`);
        }
        
        // Turn off switch after a delay (momentary behavior)
        setTimeout(() => {
          const service = this.roomServices.get(roomId);
          if (service) {
            service.updateCharacteristic(this.platform.Characteristic.On, false);
          }
        }, 1000);
      }
    } catch (error) {
      this.platform.log.error(`Error starting room cleaning for room ${roomId}: ${error}`);
      const service = this.roomServices.get(roomId);
      if (service) {
        service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    }
  }

  async getRoomSwitch(roomId: string): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  // Mop Mode Control (Mop Route)
  async setMopModeOn(value: CharacteristicValue): Promise<void> {
    // When turned on, set to default (Standard)
    if (value) {
      await this.setMopModeBrightness(0); // Standard
    }
  }

  async getMopModeOn(): Promise<CharacteristicValue> {
    // Always return true if a mode is set
    return true;
  }

  async setMopModeBrightness(value: CharacteristicValue): Promise<void> {
    try {
      this.platform.log.debug(`Setting mop mode (route) to ${value}%`);
      
      // Map percentage to mop mode values
      // 0% = Standard (300), 25% = Deep (301), 50% = Deep+ (303), 75% = Fast (304)
      const numValue = Number(value);
      let mopMode: number;
      if (numValue <= 12) {
        mopMode = 300; // Standard
      } else if (numValue <= 37) {
        mopMode = 301; // Deep
      } else if (numValue <= 62) {
        mopMode = 303; // Deep+
      } else {
        mopMode = 304; // Fast
      }

      await this.platform.roborockAPI.set_mop_mode(this.accessory.context, mopMode);
      
      this.services['MopMode'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        value
      );
      this.services['MopMode'].updateCharacteristic(
        this.platform.Characteristic.On,
        true
      );
    } catch (e) {
      this.platform.log.error(`Error setting mop mode: ${e}`);
    }
  }

  async getMopModeBrightness(): Promise<CharacteristicValue> {
    const mopMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "mop_mode");
    return this.mopModeToBrightness(mopMode);
  }

  mopModeToBrightness(mopMode: number): number {
    // Map mop mode to percentage
    switch (mopMode) {
      case 300: return 0;   // Standard
      case 301: return 25;  // Deep
      case 303: return 50;  // Deep+
      case 304: return 75;  // Fast
      default: return 0;    // Default to Standard
    }
  }

  updateMopModeState() {
    if (!this.services['MopMode']) {
      return;
    }
    const mopMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "mop_mode");
    if (mopMode !== undefined && mopMode !== "") {
      const brightness = this.mopModeToBrightness(mopMode);
      this.services['MopMode'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        brightness
      );
      this.services['MopMode'].updateCharacteristic(
        this.platform.Characteristic.On,
        true
      );
    }
  }

  // LED Status Control
  async setLedStatus(value: CharacteristicValue): Promise<void> {
    try {
      const status = value ? 1 : 0;
      await this.platform.roborockAPI.set_led_status(this.accessory.context, status);
      if (this.services['LedStatus']) {
        this.services['LedStatus'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting LED status: ${e}`);
    }
  }

  async getLedStatus(): Promise<CharacteristicValue> {
    const ledStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "led_status");
    return ledStatus === 1;
  }

  updateLedStatusState() {
    if (!this.services['LedStatus']) {
      return;
    }
    const ledStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "led_status");
    if (ledStatus !== undefined && ledStatus !== "") {
      this.services['LedStatus'].updateCharacteristic(
        this.platform.Characteristic.On,
        ledStatus === 1
      );
    }
  }

  // Sound Volume Control
  async setSoundVolumeOn(value: CharacteristicValue): Promise<void> {
    if (value) {
      await this.setSoundVolumeBrightness(50); // Default to 50%
    } else {
      await this.setSoundVolumeBrightness(0); // Mute
    }
  }

  async getSoundVolumeOn(): Promise<CharacteristicValue> {
    const volume = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "sound_volume");
    return volume !== undefined && volume > 0;
  }

  async setSoundVolumeBrightness(value: CharacteristicValue): Promise<void> {
    try {
      const volume = Math.max(0, Math.min(100, Number(value)));
      await this.platform.roborockAPI.change_sound_volume(this.accessory.context, volume);
      if (this.services['SoundVolume']) {
        this.services['SoundVolume'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          volume
        );
        this.services['SoundVolume'].updateCharacteristic(
          this.platform.Characteristic.On,
          volume > 0
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting sound volume: ${e}`);
    }
  }

  async getSoundVolumeBrightness(): Promise<CharacteristicValue> {
    const volume = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "sound_volume");
    return volume !== undefined && volume !== "" ? volume : 50;
  }

  updateSoundVolumeState() {
    if (!this.services['SoundVolume']) {
      return;
    }
    const volume = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "sound_volume");
    if (volume !== undefined && volume !== "") {
      this.services['SoundVolume'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        volume
      );
      this.services['SoundVolume'].updateCharacteristic(
        this.platform.Characteristic.On,
        volume > 0
      );
    }
  }

  // Child Lock Control
  async setChildLock(value: CharacteristicValue): Promise<void> {
    try {
      const status = value ? 1 : 0;
      await this.platform.roborockAPI.set_child_lock_status(this.accessory.context, status);
      if (this.services['ChildLock']) {
        this.services['ChildLock'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting child lock: ${e}`);
    }
  }

  async getChildLock(): Promise<CharacteristicValue> {
    const childLock = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "child_lock_status");
    return childLock === 1;
  }

  updateChildLockState() {
    if (!this.services['ChildLock']) {
      return;
    }
    const childLock = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "child_lock_status");
    if (childLock !== undefined && childLock !== "") {
      this.services['ChildLock'].updateCharacteristic(
        this.platform.Characteristic.On,
        childLock === 1
      );
    }
  }

  // Do Not Disturb (DND) Timer Control
  async setDoNotDisturb(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        // Enable DND - get current settings or use defaults
        const currentDnd = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dnd_timer");
        if (currentDnd && typeof currentDnd === 'object') {
          // Use existing settings but enable
          const dndTimer = {...currentDnd, enabled: 1};
          await this.platform.roborockAPI.set_dnd_timer(this.accessory.context, dndTimer);
        } else {
          // Default: 22:00 - 08:00
          const dndTimer = {
            enabled: 1,
            start_time: "22:00",
            end_time: "08:00"
          };
          await this.platform.roborockAPI.set_dnd_timer(this.accessory.context, dndTimer);
        }
      } else {
        // Disable DND
        await this.platform.roborockAPI.close_dnd_timer(this.accessory.context);
      }
      if (this.services['DoNotDisturb']) {
        this.services['DoNotDisturb'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting Do Not Disturb: ${e}`);
    }
  }

  async getDoNotDisturb(): Promise<CharacteristicValue> {
    const dndTimer = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dnd_timer");
    if (dndTimer && typeof dndTimer === 'object') {
      return dndTimer.enabled === 1;
    }
    return false;
  }

  updateDoNotDisturbState() {
    if (!this.services['DoNotDisturb']) {
      return;
    }
    const dndTimer = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dnd_timer");
    if (dndTimer && typeof dndTimer === 'object') {
      this.services['DoNotDisturb'].updateCharacteristic(
        this.platform.Characteristic.On,
        dndTimer.enabled === 1
      );
    }
  }

  // Dust Collection Control
  async setDustCollection(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        await this.platform.roborockAPI.app_start_collect_dust(this.accessory.context);
        // Turn off after a delay (momentary behavior)
        setTimeout(() => {
          if (this.services['DustCollection']) {
            this.services['DustCollection'].updateCharacteristic(
              this.platform.Characteristic.On,
              false
            );
          }
        }, 1000);
      } else {
        await this.platform.roborockAPI.app_stop_collect_dust(this.accessory.context);
      }
    } catch (e) {
      this.platform.log.error(`Error setting dust collection: ${e}`);
      if (this.services['DustCollection']) {
        this.services['DustCollection'].updateCharacteristic(
          this.platform.Characteristic.On,
          false
        );
      }
    }
  }

  async getDustCollection(): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  updateDustCollectionState() {
    if (!this.services['DustCollection']) {
      return;
    }
    // Dust collection is a momentary action, so we don't track state
    // But we could check if it's currently running if needed
  }

  // Carpet Mode Control
  async setCarpetMode(value: CharacteristicValue): Promise<void> {
    try {
      // Carpet mode is JSON format: [{"enable": 0 or 1, ...}]
      const currentCarpet = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_mode");
      let carpetMode;
      if (currentCarpet && Array.isArray(currentCarpet) && currentCarpet.length > 0) {
        carpetMode = [{...currentCarpet[0], enable: value ? 1 : 0}];
      } else {
        // Default format
        carpetMode = [{
          enable: value ? 1 : 0,
          stall_time: 10,
          current_low: 400,
          current_high: 500,
          current_integral: 450
        }];
      }
      await this.platform.roborockAPI.set_carpet_mode(this.accessory.context, carpetMode);
      if (this.services['CarpetMode']) {
        this.services['CarpetMode'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting carpet mode: ${e}`);
    }
  }

  async getCarpetMode(): Promise<CharacteristicValue> {
    const carpetMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_mode");
    if (carpetMode && Array.isArray(carpetMode) && carpetMode.length > 0) {
      return carpetMode[0].enable === 1;
    }
    return false;
  }

  updateCarpetModeState() {
    if (!this.services['CarpetMode']) {
      return;
    }
    const carpetMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_mode");
    if (carpetMode && Array.isArray(carpetMode) && carpetMode.length > 0) {
      this.services['CarpetMode'].updateCharacteristic(
        this.platform.Characteristic.On,
        carpetMode[0].enable === 1
      );
    }
  }

  // Carpet Clean Mode Control (Avoidance)
  async setCarpetCleanModeOn(value: CharacteristicValue): Promise<void> {
    if (value) {
      await this.setCarpetCleanModeBrightness(50); // Default to Rise
    } else {
      await this.setCarpetCleanModeBrightness(0); // Avoid
    }
  }

  async getCarpetCleanModeOn(): Promise<CharacteristicValue> {
    const mode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_clean_mode");
    return mode !== undefined && mode !== 0;
  }

  async setCarpetCleanModeBrightness(value: CharacteristicValue): Promise<void> {
    try {
      // Map percentage to carpet clean mode: 0-33% = Avoid (0), 34-66% = Rise (1), 67-100% = Ignore (2)
      const numValue = Number(value);
      let mode: number;
      if (numValue <= 33) {
        mode = 0; // Avoid
      } else if (numValue <= 66) {
        mode = 1; // Rise
      } else {
        mode = 2; // Ignore
      }
      await this.platform.roborockAPI.set_carpet_clean_mode(this.accessory.context, mode);
      if (this.services['CarpetCleanMode']) {
        this.services['CarpetCleanMode'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          value
        );
        this.services['CarpetCleanMode'].updateCharacteristic(
          this.platform.Characteristic.On,
          mode !== 0
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting carpet clean mode: ${e}`);
    }
  }

  async getCarpetCleanModeBrightness(): Promise<CharacteristicValue> {
    const mode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_clean_mode");
    switch (mode) {
      case 0: return 0;   // Avoid
      case 1: return 50;  // Rise
      case 2: return 100; // Ignore
      default: return 50; // Default to Rise
    }
  }

  updateCarpetCleanModeState() {
    if (!this.services['CarpetCleanMode']) {
      return;
    }
    const mode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "carpet_clean_mode");
    if (mode !== undefined && mode !== "") {
      let brightness: number;
      switch (mode) {
        case 0: brightness = 0; break;   // Avoid
        case 1: brightness = 50; break;  // Rise
        case 2: brightness = 100; break; // Ignore
        default: brightness = 50; break; // Default to Rise
      }
      this.services['CarpetCleanMode'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        brightness
      );
      this.services['CarpetCleanMode'].updateCharacteristic(
        this.platform.Characteristic.On,
        mode !== 0
      );
    }
  }

  // Flow LED Status Control
  async setFlowLed(value: CharacteristicValue): Promise<void> {
    try {
      const status = value ? 1 : 0;
      await this.platform.roborockAPI.set_flow_led_status(this.accessory.context, status);
      if (this.services['FlowLed']) {
        this.services['FlowLed'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting flow LED: ${e}`);
    }
  }

  async getFlowLed(): Promise<CharacteristicValue> {
    const flowLed = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "flow_led_status");
    return flowLed === 1;
  }

  updateFlowLedState() {
    if (!this.services['FlowLed']) {
      return;
    }
    const flowLed = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "flow_led_status");
    if (flowLed !== undefined && flowLed !== "") {
      this.services['FlowLed'].updateCharacteristic(
        this.platform.Characteristic.On,
        flowLed === 1
      );
    }
  }

  // Zone Cleaning Control
  async setZoneClean(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        // Zone cleaning requires coordinates: [[x1, y1, x2, y2, cleanCount], ...]
        // For now, this is a placeholder - zones need to be configured separately
        // You can extend this to use saved zones or default zones
        this.platform.log.warn("Zone cleaning requires coordinates. Use app_zoned_clean() method with zone coordinates.");
        // Example: await this.platform.roborockAPI.app_zoned_clean(this.accessory.context, [[25000, 25000, 26000, 26000, 1]]);
        
        // Turn off immediately since we can't execute without coordinates
        setTimeout(() => {
          if (this.services['ZoneClean']) {
            this.services['ZoneClean'].updateCharacteristic(
              this.platform.Characteristic.On,
              false
            );
          }
        }, 100);
      }
    } catch (e) {
      this.platform.log.error(`Error setting zone clean: ${e}`);
      if (this.services['ZoneClean']) {
        this.services['ZoneClean'].updateCharacteristic(
          this.platform.Characteristic.On,
          false
        );
      }
    }
  }

  async getZoneClean(): Promise<CharacteristicValue> {
    return false; // Always return false for momentary switch
  }

  // Mop Washing Control
  async setMopWash(value: CharacteristicValue): Promise<void> {
    try {
      if (value) {
        await this.platform.roborockAPI.app_start_wash(this.accessory.context);
        // Turn off after a delay (momentary behavior)
        setTimeout(() => {
          if (this.services['MopWash']) {
            this.services['MopWash'].updateCharacteristic(
              this.platform.Characteristic.On,
              false
            );
          }
        }, 1000);
      } else {
        await this.platform.roborockAPI.app_stop_wash(this.accessory.context);
      }
    } catch (e) {
      this.platform.log.error(`Error setting mop wash: ${e}`);
      if (this.services['MopWash']) {
        this.services['MopWash'].updateCharacteristic(
          this.platform.Characteristic.On,
          false
        );
      }
    }
  }

  async getMopWash(): Promise<CharacteristicValue> {
    const washStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "wash_status");
    return washStatus === 1 || washStatus === 23 || washStatus === 26; // Washing states
  }

  updateMopWashState() {
    if (!this.services['MopWash']) {
      return;
    }
    const washStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "wash_status");
    if (washStatus !== undefined && washStatus !== "") {
      const isWashing = washStatus === 1 || washStatus === 23 || washStatus === 26;
      this.services['MopWash'].updateCharacteristic(
        this.platform.Characteristic.On,
        isWashing
      );
    }
  }

  // Wash Towel Mode Control (Wash Intensity)
  async setWashTowelModeOn(value: CharacteristicValue): Promise<void> {
    if (value) {
      await this.setWashTowelModeBrightness(67); // Default to Intense
    } else {
      await this.setWashTowelModeBrightness(0); // Eco
    }
  }

  async getWashTowelModeOn(): Promise<CharacteristicValue> {
    return true; // Always on if mode is set
  }

  async setWashTowelModeBrightness(value: CharacteristicValue): Promise<void> {
    try {
      // Map percentage to wash towel mode: 0-33% = Eco (0), 34-66% = Medium (1), 67-100% = Intense (2)
      const numValue = Number(value);
      let mode: number;
      if (numValue <= 33) {
        mode = 0; // Eco
      } else if (numValue <= 66) {
        mode = 1; // Medium
      } else {
        mode = 2; // Intense
      }

      await this.platform.roborockAPI.set_wash_towel_mode(this.accessory.context, {wash_mode: mode});
      
      if (this.services['WashTowelMode']) {
        this.services['WashTowelMode'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          value
        );
        this.services['WashTowelMode'].updateCharacteristic(
          this.platform.Characteristic.On,
          true
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting wash towel mode: ${e}`);
    }
  }

  async getWashTowelModeBrightness(): Promise<CharacteristicValue> {
    const washMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "wash_towel_mode");
    if (washMode && typeof washMode === 'object' && washMode.wash_mode !== undefined) {
      switch (washMode.wash_mode) {
        case 0: return 0;   // Eco
        case 1: return 50;  // Medium
        case 2: return 100; // Intense
        default: return 67; // Default to Intense
      }
    }
    return 67; // Default
  }

  updateWashTowelModeState() {
    if (!this.services['WashTowelMode']) {
      return;
    }
    const washMode = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "wash_towel_mode");
    if (washMode && typeof washMode === 'object' && washMode.wash_mode !== undefined) {
      let brightness: number;
      switch (washMode.wash_mode) {
        case 0: brightness = 0; break;   // Eco
        case 1: brightness = 50; break;  // Medium
        case 2: brightness = 100; break; // Intense
        default: brightness = 67; break; // Default
      }
      this.services['WashTowelMode'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        brightness
      );
      this.services['WashTowelMode'].updateCharacteristic(
        this.platform.Characteristic.On,
        true
      );
    }
  }

  // Dryer Control
  async setDryer(value: CharacteristicValue): Promise<void> {
    try {
      const status = value ? 1 : 0;
      await this.platform.roborockAPI.app_set_dryer_status(this.accessory.context, {status: status});
      if (this.services['Dryer']) {
        this.services['Dryer'].updateCharacteristic(
          this.platform.Characteristic.On,
          value
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting dryer: ${e}`);
    }
  }

  async getDryer(): Promise<CharacteristicValue> {
    const dryStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dry_status");
    return dryStatus === 1;
  }

  updateDryerState() {
    if (!this.services['Dryer']) {
      return;
    }
    const dryStatus = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dry_status");
    if (dryStatus !== undefined && dryStatus !== "") {
      this.services['Dryer'].updateCharacteristic(
        this.platform.Characteristic.On,
        dryStatus === 1
      );
    }
  }

  // Dryer Duration Control
  async setDryerDurationOn(value: CharacteristicValue): Promise<void> {
    if (value) {
      await this.setDryerDurationBrightness(50); // Default to 3h
    }
  }

  async getDryerDurationOn(): Promise<CharacteristicValue> {
    return true; // Always on if duration is set
  }

  async setDryerDurationBrightness(value: CharacteristicValue): Promise<void> {
    try {
      // Map percentage to dry time: 0-33% = 2h (7200s), 34-66% = 3h (10800s), 67-100% = 4h (14400s)
      const numValue = Number(value);
      let dryTime: number;
      if (numValue <= 33) {
        dryTime = 7200; // 2 hours
      } else if (numValue <= 66) {
        dryTime = 10800; // 3 hours
      } else {
        dryTime = 14400; // 4 hours
      }

      // Get current dryer setting or use default
      const currentSetting = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dryer_setting");
      let setting;
      if (currentSetting && typeof currentSetting === 'object') {
        setting = {
          on: {dry_time: dryTime},
          status: currentSetting.status || 1
        };
      } else {
        setting = {
          on: {dry_time: dryTime},
          status: 1
        };
      }

      await this.platform.roborockAPI.app_set_dryer_setting(this.accessory.context, setting);
      
      if (this.services['DryerDuration']) {
        this.services['DryerDuration'].updateCharacteristic(
          this.platform.Characteristic.Brightness,
          value
        );
        this.services['DryerDuration'].updateCharacteristic(
          this.platform.Characteristic.On,
          true
        );
      }
    } catch (e) {
      this.platform.log.error(`Error setting dryer duration: ${e}`);
    }
  }

  async getDryerDurationBrightness(): Promise<CharacteristicValue> {
    const dryerSetting = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dryer_setting");
    if (dryerSetting && typeof dryerSetting === 'object' && dryerSetting.on && dryerSetting.on.dry_time) {
      const dryTime = dryerSetting.on.dry_time;
      if (dryTime === 7200) return 0;   // 2h
      if (dryTime === 10800) return 50; // 3h
      if (dryTime === 14400) return 100; // 4h
    }
    return 50; // Default to 3h
  }

  updateDryerDurationState() {
    if (!this.services['DryerDuration']) {
      return;
    }
    const dryerSetting = this.platform.roborockAPI.getVacuumDeviceStatus(this.accessory.context, "dryer_setting");
    if (dryerSetting && typeof dryerSetting === 'object' && dryerSetting.on && dryerSetting.on.dry_time) {
      const dryTime = dryerSetting.on.dry_time;
      let brightness: number;
      if (dryTime === 7200) brightness = 0;   // 2h
      else if (dryTime === 10800) brightness = 50; // 3h
      else if (dryTime === 14400) brightness = 100; // 4h
      else brightness = 50; // Default

      this.services['DryerDuration'].updateCharacteristic(
        this.platform.Characteristic.Brightness,
        brightness
      );
      this.services['DryerDuration'].updateCharacteristic(
        this.platform.Characteristic.On,
        true
      );
    }
  }

}
