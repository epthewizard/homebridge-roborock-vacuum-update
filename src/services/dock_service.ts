import { Service, PlatformAccessory } from "homebridge";
import { distinct, filter, map, tap } from "rxjs";
import { CoreContext } from "./types";
import { DockConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";

export class DockService extends PluginServiceClass {
  private readonly service?: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory
  ) {
    super(coreContext);
    
    if (this.config.dock) {
      const name = `${this.config.name} Dock`;
      this.service = this.accessory.getServiceById(this.hap.Service.OccupancySensor, "dock")
        || this.accessory.addService(this.hap.Service.OccupancySensor, name, "dock");
      
      ensureName(this.hap, this.service, name);
      
      this.service
        .getCharacteristic(this.hap.Characteristic.OccupancyDetected)
        .onGet(() => this.getDocked());
    }
  }

  public async init(): Promise<void> {
    if (!this.service) return;

    this.deviceManager.stateChanged$
      .pipe(
        filter(({ key }) => key === "state" || key === "charge_status"),
        map(({ value, key }) => {
          if (key === "state") {
            return this.deviceManager.isDocked;
          }
          return this.deviceManager.isCharging;
        }),
        distinct(),
        tap((isDocked) => {
          this.service!
            .getCharacteristic(this.hap.Characteristic.OccupancyDetected)
            .updateValue(isDocked);
        })
      )
      .subscribe((isDocked) => {
        const msg = isDocked ? "Robot was docked" : "Robot not anymore in dock";
        this.log.info(`Dock status changed: ${msg}`);
      });
  }

  public get services(): Service[] {
    return this.service ? [this.service] : [];
  }

  private async getDocked() {
    const isDocked = this.deviceManager.isDocked || this.deviceManager.isCharging;
    this.log.debug(`getDocked: ${isDocked}`);
    return isDocked;
  }
}

