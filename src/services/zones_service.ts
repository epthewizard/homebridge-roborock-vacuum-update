import { Service, PlatformAccessory } from "homebridge";
import { filter } from "rxjs";
import { CoreContext } from "./types";
import { ZonesConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";
import type { MainService } from "./main_service";

interface ZoneDefinition {
  name: string;
  zone: Array<[number, number, number, number, number]>;
}

export class ZonesService extends PluginServiceClass {
  private readonly zones: Record<string, Service> = {};

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory,
    private readonly mainService: MainService
  ) {
    super(coreContext);
    
    if (this.config.zones) {
      for (const zoneDef of this.config.zones) {
        this.createZone(zoneDef.name, zoneDef.zone);
      }
    }
  }

  public async init() {
    // Reset zone switches when cleaning stops
    this.deviceManager.stateChanged$
      .pipe(filter(({ key }) => key === "state"))
      .subscribe(({ value }) => {
        const isCleaning = this.deviceManager.isCleaning;
        if (!isCleaning) {
          this.services.forEach((zone) => {
            zone
              .getCharacteristic(this.hap.Characteristic.On)
              .updateValue(false);
          });
        }
      });
  }

  public get services(): Service[] {
    return [...Object.values(this.zones)];
  }

  private createZone(zoneName: string, zoneParams: Array<[number, number, number, number, number]>) {
    this.log.info(`Creating zone switch: ${zoneName}`);
    
    const name = `${this.config.cleanword} ${zoneName}`;
    const zoneId = `zone-${zoneName}`;
    
    this.zones[zoneName] = this.accessory.getServiceById(this.hap.Service.Switch, zoneId)
      || this.accessory.addService(this.hap.Service.Switch, name, zoneId);
    
    ensureName(this.hap, this.zones[zoneName], name);
    
    this.zones[zoneName]
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => this.mainService.getCleaning())
      .onSet((newState) => this.setCleaningZone(newState as boolean, zoneParams));
  }

  private async setCleaningZone(state: boolean, zone: Array<[number, number, number, number, number]>) {
    this.log.info(`setCleaningZone: ${state} for zone`);
    
    try {
      if (state && !this.deviceManager.isCleaning) {
        // Start zone cleaning
        await this.roborockAPI.app_zoned_clean(this.duid, zone);
        this.log.info(`Started zone cleaning`);
      } else if (!state) {
        // Stop cleaning and return to dock
        await this.roborockAPI.app_charge(this.duid);
        this.log.info(`Stopped cleaning and returning to dock`);
      }
    } catch (err) {
      this.log.error(`setCleaningZone failed:`, err);
      throw err;
    }
  }
}

