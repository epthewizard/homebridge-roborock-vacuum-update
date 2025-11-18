import { CoreContext, PluginService } from "./types";
import { HAP, Service } from "homebridge";
import RoborockPlatformLogger from "../logger";
import { Config } from "./config_service";
import { DeviceManager } from "./device_manager";

type Logger = RoborockPlatformLogger;

export abstract class PluginServiceClass implements PluginService {
  protected readonly hap: HAP;
  protected readonly log: Logger;
  protected readonly config: Config;
  protected readonly deviceManager: DeviceManager;
  protected readonly roborockAPI: any;
  protected readonly duid: string;

  protected constructor({ hap, log, config, deviceManager, roborockAPI, duid }: CoreContext) {
    this.hap = hap;
    this.log = log;
    this.config = config;
    this.deviceManager = deviceManager;
    this.roborockAPI = roborockAPI;
    this.duid = duid;
  }

  public abstract init(): Promise<void>;

  public abstract get services(): Service[];
}

