import { Service, PlatformAccessory } from "homebridge";
import { distinct, filter } from "rxjs";
import { CoreContext } from "./types";
import { PauseConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";
import type { RoomsService } from "./rooms_service";

export class PauseSwitch extends PluginServiceClass {
  private readonly service?: Service;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory,
    private readonly roomsService?: RoomsService
  ) {
    super(coreContext);
    
    if (this.config.pause) {
      const name = `${this.config.name} ${this.config.pauseWord}`;
      this.service = this.accessory.getServiceById(this.hap.Service.Switch, "pause")
        || this.accessory.addService(this.hap.Service.Switch, name, "pause");
      
      ensureName(this.hap, this.service, name);
      
      this.service
        .getCharacteristic(this.hap.Characteristic.On)
        .onGet(() => this.getPauseState())
        .onSet((newState) => this.setPauseState(newState as boolean));
    }
  }

  public async init(): Promise<void> {
    if (!this.service) return;

    this.deviceManager.stateChanged$
      .pipe(
        filter(({ key }) => key === "state"),
        distinct(({ value }) => value)
      )
      .subscribe(({ value }) => {
        this.changedPause(this.deviceManager.isCleaning);
      });
  }

  public get services(): Service[] {
    return this.service ? [this.service] : [];
  }

  public changedPause(isCleaning: boolean) {
    if (!this.service) return;
    
    this.log.debug(`Pause state changed: isCleaning=${isCleaning}`);
    const canBePaused = isCleaning && !this.deviceManager.isPaused;
    this.service
      .getCharacteristic(this.hap.Characteristic.On)
      .updateValue(canBePaused);
  }

  private async getPauseState() {
    const isPaused = this.deviceManager.isPaused;
    const canBePaused = this.deviceManager.isCleaning && !isPaused;
    this.log.debug(`getPauseState: ${canBePaused}`);
    return canBePaused;
  }

  private async setPauseState(state: boolean) {
    this.log.info(`setPauseState: ${state}`);
    
    try {
      if (state && this.deviceManager.isPaused) {
        // Resume
        const roomIdsToClean = this.roomsService?.roomIdsToClean;
        if (roomIdsToClean && roomIdsToClean.size > 0) {
          // Resume room cleaning - Roborock doesn't have a specific resume command for rooms
          // So we just start cleaning again
          await this.roborockAPI.app_segment_clean(
            this.duid,
            Array.from(roomIdsToClean)
          );
          this.log.info(`Resumed room cleaning`);
        } else {
          await this.roborockAPI.app_start(this.duid);
          this.log.info(`Resumed cleaning`);
        }
      } else if (!state && this.deviceManager.isCleaning) {
        // Pause
        await this.roborockAPI.app_pause(this.duid);
        this.log.info(`Paused cleaning`);
      }
    } catch (err) {
      this.log.error(`setPauseState failed:`, err);
      throw err;
    }
  }
}

