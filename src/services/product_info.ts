import { Service, PlatformAccessory } from "homebridge";
import { CoreContext } from "./types";
import { PluginServiceClass } from "./plugin_service_class";

export class ProductInfo extends PluginServiceClass {
  private readonly service: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory
  ) {
    super(coreContext);
    this.service = this.accessory.getService(this.hap.Service.AccessoryInformation)
      || this.accessory.addService(this.hap.Service.AccessoryInformation);
  }

  public async init(): Promise<void> {
    this.service
      .setCharacteristic(
        this.hap.Characteristic.Manufacturer,
        "Roborock"
      )
      .setCharacteristic(
        this.hap.Characteristic.Model,
        this.deviceManager.getProductAttribute("model") || "Unknown"
      )
      .setCharacteristic(
        this.hap.Characteristic.SerialNumber,
        this.deviceManager.getInfo("sn") || "Unknown"
      )
      .setCharacteristic(
        this.hap.Characteristic.FirmwareRevision,
        this.deviceManager.getInfo("fv") || "Unknown"
      );
  }

  public get services(): Service[] {
    return [this.service];
  }
}

