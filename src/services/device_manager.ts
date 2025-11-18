import { HAP } from "homebridge";
import RoborockPlatformLogger from "../logger";
type Logger = RoborockPlatformLogger;
import { BehaviorSubject, Subject, distinct } from "rxjs";

export interface StateChangedEvent {
  key: string;
  value: unknown;
}

/**
 * DeviceManager wraps the Roborock API and provides a consistent interface
 * for services to access device state and control.
 */
export class DeviceManager {
  private readonly internalStateChanged$ = new Subject<StateChangedEvent>();
  public readonly stateChanged$ = this.internalStateChanged$.asObservable();

  constructor(
    hap: HAP,
    private readonly log: Logger,
    private readonly roborockAPI: any,
    private readonly duid: string
  ) {
    // HAP is passed but not stored as it's not directly used
    // All HAP access is through the roborockAPI
  }

  /**
   * Get a device status value
   */
  public getStatus(key: string): any {
    return this.roborockAPI.getVacuumDeviceStatus(this.duid, key);
  }

  /**
   * Get device info
   */
  public getInfo(key: string): any {
    return this.roborockAPI.getVacuumDeviceInfo(this.duid, key);
  }

  /**
   * Get product attribute
   */
  public getProductAttribute(key: string): any {
    return this.roborockAPI.getProductAttribute(this.duid, key);
  }

  /**
   * Check if device is cleaning
   */
  public get isCleaning(): boolean {
    const state = this.getStatus("state");
    return this.roborockAPI.isCleaning(state);
  }

  /**
   * Check if device is paused
   */
  public get isPaused(): boolean {
    const state = this.getStatus("state");
    return state === 10; // Paused state
  }

  /**
   * Check if device is charging
   */
  public get isCharging(): boolean {
    const chargeStatus = this.getStatus("charge_status");
    return chargeStatus === 1 || chargeStatus === 2;
  }

  /**
   * Check if device is docked
   */
  public get isDocked(): boolean {
    const state = this.getStatus("state");
    return state === 8; // Charging state
  }

  /**
   * Get current state
   */
  public get state(): number {
    return this.getStatus("state") || 0;
  }

  /**
   * Get battery level
   */
  public get battery(): number {
    return this.getStatus("battery") || 0;
  }

  /**
   * Emit state change event
   */
  public emitStateChange(key: string, value: unknown) {
    this.internalStateChanged$.next({ key, value });
  }

  /**
   * Check if device supports a feature
   */
  public hasFeature(feature: string): boolean {
    return this.roborockAPI.hasFeature(this.duid, feature);
  }

  /**
   * Get room mapping
   */
  public getRoomMapping(): Record<number, string> {
    return this.roborockAPI.roomIDs || {};
  }

  /**
   * Get scenes for device
   */
  public getScenes(): any[] {
    return this.roborockAPI.getScenesForDevice(this.duid) || [];
  }
}

