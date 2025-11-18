import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";
import { CoreContext } from "./types";
import { FindMeConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";

export class FindMeService extends PluginServiceClass {
  private readonly service?: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory
  ) {
    super(coreContext);
    
    if (this.config.findMe) {
      const name = `${this.config.name} ${this.config.findMeWord}`;
      this.service = this.accessory.getServiceById(this.hap.Service.Switch, "findMe")
        || this.accessory.addService(this.hap.Service.Switch, name, "findMe");
      
      ensureName(this.hap, this.service, name);
      
      this.service
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => false) // Always return false (momentary switch)
        .onSet((newState) => this.identify(newState));
    }
  }

  public async init(): Promise<void> {}

  public get services(): Service[] {
    return this.service ? [this.service] : [];
  }

  public async identify(newState: CharacteristicValue) {
    if (!newState) return;
    
    this.log.info(`Find me - Hello!`);
    try {
      await this.roborockAPI.find_me(this.duid);
      // Turn off switch after a moment (momentary behavior)
      setTimeout(() => {
        if (this.service) {
          this.service
            .getCharacteristic(this.hap.Characteristic.On)
            .updateValue(false);
        }
      }, 1000);
    } catch (err) {
      this.log.error(`identify failed:`, err);
      if (this.service) {
        this.service
          .getCharacteristic(this.hap.Characteristic.On)
          .updateValue(false);
      }
      throw err;
    }
  }
}

