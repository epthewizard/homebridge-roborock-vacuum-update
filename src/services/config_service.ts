import { RoborockPlatformConfig } from "../types";

export interface MainServiceConfig {
  serviceType: "fan" | "switch";
}

export interface RoomsConfig {
  cleanword: string;
  rooms?: Array<{ id: number; name: string }>;
  roomTimeout: number;
}

export interface PauseConfig {
  pause: boolean;
  pauseWord: string;
}

export interface WaterBoxConfig {
  waterBox: boolean;
}

export interface FindMeConfig {
  findMe: boolean;
  findMeWord: string;
}

export interface GoToConfig {
  goTo: boolean;
  goToWord: string;
  goToX: number;
  goToY: number;
}

export interface DockConfig {
  dock: boolean;
}

export interface ZonesConfig {
  zones?: Array<{
    name: string;
    zone: Array<[number, number, number, number, number]>;
  }>;
}

export interface DustCollectionConfig {
  dustCollection: boolean;
}

export interface DustBinConfig {
  dustBin: boolean;
}

export interface CareConfig {
  disableCareServices: boolean;
}

export interface Config
  extends MainServiceConfig,
    RoomsConfig,
    PauseConfig,
    WaterBoxConfig,
    FindMeConfig,
    GoToConfig,
    DockConfig,
    ZonesConfig,
    DustCollectionConfig,
    DustBinConfig,
    CareConfig {
  /**
   * The name of the main service as it will show up in the Home App.
   */
  name: string;

  // Platform config
  email: string;
  password: string;
  baseURL?: string;
  debugMode?: boolean;
  skipDevices?: string;

  // For now, let's allow anything until all config entries are defined
  [key: string]: any;
}

/**
 * Applies the default configuration values to the config provided by the user.
 */
export function applyConfigDefaults(config: Partial<Config>): Config {
  return {
    name: config.name || "Roborock Vacuum",
    serviceType: config.serviceType || "fan",
    cleanword: config.cleanword || "cleaning",
    pause: config.pause ?? false,
    pauseWord: config.pauseWord || "Pause",
    findMe: config.findMe ?? false,
    findMeWord: config.findMeWord || "where are you",
    goTo: config.goTo ?? false,
    goToWord: config.goToWord || "go to coordinates",
    goToX: config.goToX ?? 25500,
    goToY: config.goToY ?? 25500,
    roomTimeout: config.roomTimeout ?? 0,
    waterBox: config.waterBox ?? true, // Default true since most Roborock devices support it
    dustBin: config.dustBin ?? false,
    dustCollection: config.dustCollection ?? false,
    dock: config.dock ?? true,
    zones: config.zones || [],
    rooms: config.rooms || [],
    disableCareServices: config.disableCareServices ?? false,
    email: config.email || "",
    password: config.password || "",
    baseURL: config.baseURL || "usiot.roborock.com",
    debugMode: config.debugMode ?? false,
    ...config,
  };
}

