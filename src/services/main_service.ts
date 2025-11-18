import { Service, PlatformAccessory } from "homebridge";
import { distinct, filter, map, tap } from "rxjs";
import { CoreContext } from "./types";
import { MainServiceConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";

export class MainService extends PluginServiceClass {
  public readonly cachedState = new Map<string, unknown>();
  private readonly service: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory,
    private getRoomIdsToClean?: () => Set<number>
  ) {
    super(coreContext);
    
    if (this.config.serviceType === "fan") {
      this.service = this.accessory.getService(this.hap.Service.Fanv2)
        || this.accessory.addService(this.hap.Service.Fanv2);
      
      this.service
        .getCharacteristic(this.hap.Characteristic.RotationSpeed)
        .onGet(() => this.getSpeed())
        .onSet((newState) => this.setSpeed(newState as number))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 25, // 0%, 25%, 50%, 75%, 100% (maps to Off, Quiet, Balanced, Turbo, Max)
        });
    } else {
      this.service = this.accessory.getServiceById(this.hap.Service.Switch, "main")
        || this.accessory.addService(this.hap.Service.Switch, this.config.name, "main");
    }

    ensureName(this.hap, this.service, this.config.name);
    
    // Set as primary service for better HomeKit integration
    if (this.service.setPrimaryService) {
      this.service.setPrimaryService(true);
    }
    
    // Link other services to main service for better grouping in HomeKit
    const firstService = this.service;
    this.accessory.services.forEach((srv) => {
      if (srv !== firstService && firstService.addLinkedService) {
        firstService.addLinkedService(srv);
      }
    });

    this.service
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => this.getCleaning())
      .onSet((newState) => this.setCleaning(newState as boolean));
  }

  public async init() {
    // Subscribe to state changes
    this.deviceManager.stateChanged$
      .pipe(
        filter(({ key }) => key === "state" || key === "fan_power"),
        distinct(({ key, value }) => `${key}:${value}`)
      )
      .subscribe(({ key, value }) => {
        if (key === "state") {
          const isCleaning = this.deviceManager.isCleaning;
          this.log.debug(`State changed: ${value}, isCleaning: ${isCleaning}`);
          this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .updateValue(isCleaning);
        } else if (key === "fan_power" && this.config.serviceType === "fan") {
          const rotationSpeed = this.fanPowerToRotationSpeed(value as number);
          this.service
            .getCharacteristic(this.hap.Characteristic.RotationSpeed)
            .updateValue(rotationSpeed);
        }
      });
  }

  get services() {
    return [this.service];
  }

  public async getCleaning() {
    try {
      const isCleaning = this.deviceManager.isCleaning;
      this.log.debug(`getCleaning: ${isCleaning}`);
      return isCleaning;
    } catch (err) {
      this.log.error(`getCleaning failed:`, err);
      throw err;
    }
  }

  public async setCleaning(state: boolean) {
    this.log.info(`setCleaning: ${state}`);
    try {
      if (state && !this.deviceManager.isCleaning) {
        // Start cleaning
        const roomIdsToClean = this.getRoomIdsToClean?.();
        if (roomIdsToClean && roomIdsToClean.size > 0) {
          await this.roborockAPI.app_segment_clean(
            this.duid,
            Array.from(roomIdsToClean)
          );
          this.log.info(`Started room cleaning for rooms: ${Array.from(roomIdsToClean)}`);
        } else {
          await this.roborockAPI.app_start(this.duid);
          this.log.info(`Started full cleaning`);
        }
      } else if (!state && (this.deviceManager.isCleaning || this.deviceManager.isPaused)) {
        // Stop cleaning and return to dock
        await this.roborockAPI.app_charge(this.duid);
        this.log.info(`Stopped cleaning and returning to dock`);
      }
    } catch (err) {
      this.log.error(`setCleaning failed:`, err);
      throw err;
    }
  }

  private async getSpeed() {
    const fanPower = this.deviceManager.getStatus("fan_power");
    if (fanPower === undefined || fanPower === "") {
      return 0;
    }
    
    const rotationSpeed = this.fanPowerToRotationSpeed(fanPower);
    this.log.debug(`getSpeed: fan_power=${fanPower}, rotationSpeed=${rotationSpeed}`);
    return rotationSpeed;
  }

  public async setSpeed(speed: number) {
    this.log.info(`setSpeed: ${speed}%`);
    
    const fanPower = this.rotationSpeedToFanPower(speed);
    if (fanPower === null) {
      this.log.warn(`Invalid speed: ${speed}%`);
      return;
    }

    try {
      await this.roborockAPI.set_custom_mode(this.duid, fanPower);
      this.log.info(`Set fan power to ${fanPower} (${speed}%)`);
    } catch (err) {
      this.log.error(`setSpeed failed:`, err);
      throw err;
    }
  }

  private fanPowerToRotationSpeed(fanPower: number): number {
    // Map fan power to rotation speed percentage
    // 101 = Quiet (25%), 102 = Balanced (50%), 103 = Turbo (75%), 104 = Max (100%)
    switch (fanPower) {
      case 101:
        return 25;
      case 102:
        return 50;
      case 103:
        return 75;
      case 104:
        return 100;
      case 105:
        return 0; // Off
      default:
        return 0;
    }
  }

  private rotationSpeedToFanPower(rotationSpeed: number): number | null {
    // Map rotation speed percentage to fan power
    if (rotationSpeed === 0) {
      return 105; // Off
    } else if (rotationSpeed <= 25) {
      return 101; // Quiet
    } else if (rotationSpeed <= 50) {
      return 102; // Balanced
    } else if (rotationSpeed <= 75) {
      return 103; // Turbo
    } else {
      return 104; // Max
    }
  }
}

