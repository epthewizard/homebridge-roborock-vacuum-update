import { Service, PlatformAccessory } from "homebridge";
import { distinct, filter } from "rxjs";
import { CoreContext } from "./types";
import { WaterBoxConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";

export class WaterBoxService extends PluginServiceClass {
  private readonly service?: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory
  ) {
    super(coreContext);
    
    if (this.config.waterBox && this.deviceManager.hasFeature("waterLevel")) {
      const name = `${this.config.name} Water Box`;
      this.service = this.accessory.getServiceById(this.hap.Service.Fan, "waterBox")
        || this.accessory.addService(this.hap.Service.Fan, name, "waterBox");
      
      ensureName(this.hap, this.service, name);
      
      this.service
        .getCharacteristic(this.hap.Characteristic.RotationSpeed)
        .onGet(() => this.getWaterSpeed())
        .onSet((newState) => this.setWaterSpeed(newState as number))
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 33, // 0%, 33%, 67%, 100% (maps to Off, Mild, Standard, Intense)
        });

      // Handle ON/OFF characteristic
      this.service
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(async () => (await this.getWaterSpeed()) > 0)
        .onSet(async (newState) => {
          if (!newState) {
            await this.setWaterSpeed(0);
          }
        });
    }
  }

  public async init(): Promise<void> {
    if (!this.service) return;

    this.deviceManager.stateChanged$
      .pipe(
        filter(({ key }) => key === "water_box_custom_mode"),
        distinct(({ value }) => value)
      )
      .subscribe(({ value: mode }) => {
        this.log.debug(`Water box mode changed: ${mode}`);
        const speed = this.waterModeToSpeed(mode as number);
        this.service!
          .getCharacteristic(this.hap.Characteristic.RotationSpeed)
          .updateValue(speed);
        this.service!
          .getCharacteristic(this.hap.Characteristic.On)
          .updateValue(speed > 0);
      });
  }

  public get services(): Service[] {
    return this.service ? [this.service] : [];
  }

  public async setWaterSpeed(speed: number) {
    this.log.info(`setWaterSpeed: ${speed}%`);
    
    const waterMode = this.speedToWaterMode(speed);
    if (waterMode === null) {
      this.log.warn(`Invalid water speed: ${speed}%`);
      return;
    }

    try {
      await this.roborockAPI.set_water_box_custom_mode(this.duid, waterMode);
      this.log.info(`Set water box mode to ${waterMode} (${speed}%)`);
    } catch (err) {
      this.log.error(`setWaterSpeed failed:`, err);
      throw err;
    }
  }

  private async getWaterSpeed() {
    const mode = this.deviceManager.getStatus("water_box_custom_mode");
    if (mode === undefined || mode === "") {
      return 0;
    }
    
    const speed = this.waterModeToSpeed(mode);
    this.log.debug(`getWaterSpeed: mode=${mode}, speed=${speed}%`);
    return speed;
  }

  private waterModeToSpeed(mode: number): number {
    // Map water box mode to speed percentage
    // 200 = Off (0%), 201 = Mild (33%), 202 = Moderate/Standard (67%), 203 = Intense (100%)
    switch (mode) {
      case 200:
        return 0;
      case 201:
        return 33;
      case 202:
        return 67;
      case 203:
        return 100;
      default:
        return 0;
    }
  }

  private speedToWaterMode(speed: number): number | null {
    // Map speed percentage to water box mode
    if (speed === 0) {
      return 200; // Off
    } else if (speed <= 33) {
      return 201; // Mild
    } else if (speed <= 67) {
      return 202; // Moderate/Standard
    } else {
      return 203; // Intense
    }
  }
}

