import { HAP, Service } from "homebridge";
import RoborockPlatformLogger from "../logger";
type Logger = RoborockPlatformLogger;
import { Config } from "./config_service";
import { DeviceManager } from "./device_manager";

export interface PluginService {
  init(): Promise<void>;
  get services(): Service[];
}

export interface CoreContext {
  hap: HAP;
  log: Logger;
  config: Config;
  deviceManager: DeviceManager;
  roborockAPI: any; // The Roborock API instance
  duid: string; // Device unique ID
}

