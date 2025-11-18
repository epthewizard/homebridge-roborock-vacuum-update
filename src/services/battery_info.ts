import { Service, PlatformAccessory } from "homebridge";
import { distinct, filter, map, tap } from "rxjs";
import { CoreContext } from "./types";
import { PluginServiceClass } from "./plugin_service_class";

export class BatteryInfo extends PluginServiceClass {
  private readonly service: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory
  ) {
    super(coreContext);
    this.service = this.accessory.getService(this.hap.Service.Battery)
      || this.accessory.addService(this.hap.Service.Battery);
  }

  public async init(): Promise<void> {
    // Subscribe to battery and charging state changes
    this.deviceManager.stateChanged$
      .pipe(
        filter(({ key }) => key === "battery" || key === "charge_status"),
        distinct(({ key, value }) => `${key}:${value}`)
      )
      .subscribe(({ key, value }) => {
        if (key === "battery") {
          const batteryLevel = value as number;
          this.service
            .getCharacteristic(this.hap.Characteristic.BatteryLevel)
            .updateValue(batteryLevel);
          
          this.service
            .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
            .updateValue(batteryLevel < 20 
              ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
              : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
            );
        } else if (key === "charge_status") {
          const chargeStatus = value as number;
          const isCharging = chargeStatus !== 0;
          this.service
            .getCharacteristic(this.hap.Characteristic.ChargingState)
            .updateValue(isCharging
              ? this.hap.Characteristic.ChargingState.CHARGING
              : this.hap.Characteristic.ChargingState.NOT_CHARGING
            );
        }
      });

    // Initial state
    const battery = this.deviceManager.battery;
    const chargeStatus = this.deviceManager.getStatus("charge_status");
    
    this.service
      .getCharacteristic(this.hap.Characteristic.BatteryLevel)
      .updateValue(battery);
    
    this.service
      .getCharacteristic(this.hap.Characteristic.StatusLowBattery)
      .updateValue(battery < 20
        ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      );
    
    this.service
      .getCharacteristic(this.hap.Characteristic.ChargingState)
      .updateValue(chargeStatus !== 0
        ? this.hap.Characteristic.ChargingState.CHARGING
        : this.hap.Characteristic.ChargingState.NOT_CHARGING
      );
  }

  public get services(): Service[] {
    return [this.service];
  }
}

