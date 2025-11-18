import { PlatformAccessory } from "homebridge";
import RoborockPlatform from "./platform";
import {
  applyConfigDefaults,
  DeviceManager,
  RoomsService,
  ProductInfo,
  BatteryInfo,
  MainService,
  PauseSwitch,
  FindMeService,
  DockService,
  ZonesService,
  WaterBoxService,
  Config,
  CoreContext,
} from "./services";

interface PluginServices {
  productInfo: ProductInfo;
  rooms: RoomsService;
  mainService: MainService;
  pause?: PauseSwitch;
  battery: BatteryInfo;
  findMe: FindMeService;
  dock?: DockService;
  zones?: ZonesService;
  waterBox?: WaterBoxService;
}

/**
 * Refactored Roborock Vacuum Accessory using modular services
 */
export default class RoborockVacuumAccessory {
  private readonly pluginServices: PluginServices;
  private readonly deviceManager: DeviceManager;
  private readonly config: Config;

  constructor(
    private readonly platform: RoborockPlatform,
    private readonly accessory: PlatformAccessory<String>
  ) {
    // Create config from platform config and device info
    const deviceName = this.platform.roborockAPI.getVacuumDeviceInfo(
      accessory.context,
      "name"
    ) || "Roborock Vacuum";

    this.config = applyConfigDefaults({
      ...this.platform.platformConfig, // Start with platform config
      name: deviceName, // Override with device name
    });

    // Create DeviceManager
    this.deviceManager = new DeviceManager(
      this.platform.api.hap,
      this.platform.log,
      this.platform.roborockAPI,
      accessory.context as string
    );

    // Create CoreContext
    const coreContext: CoreContext = {
      hap: this.platform.api.hap,
      log: this.platform.log,
      config: this.config,
      deviceManager: this.deviceManager,
      roborockAPI: this.platform.roborockAPI,
      duid: accessory.context as string,
    };

    // Initialize services
    this.pluginServices = this.initializeServices(coreContext);

    // Add all services to the accessory
    // In DynamicPlatformPlugin, services are added directly to the accessory
    // and Homebridge will discover them automatically
    Object.values(this.pluginServices).forEach((service) => {
      if (service) {
        // Services are already added to accessory in their constructors
        // Just initialize them
        if (typeof service.init === "function") {
          service.init().catch((err) => {
            this.platform.log.error(`Service init failed:`, err);
          });
        }
      }
    });

    // Set up device state notifications
    this.setupDeviceNotifications();
  }

  private initializeServices(coreContext: CoreContext): PluginServices {
    const { config } = this;

    const productInfo = new ProductInfo(coreContext, this.accessory);
    
    // Create main service first (without room callback)
    const mainService = new MainService(
      coreContext,
      this.accessory,
      undefined
    );

    // Create rooms service with callback to main service
    const rooms = new RoomsService(
      coreContext,
      this.accessory,
      async (clean) => {
        await mainService.setCleaning(clean);
      }
    );

    // Update main service with room IDs getter
    (mainService as any).getRoomIdsToClean = () => rooms.roomIdsToClean;

    return {
      mainService,
      productInfo,
      rooms,
      battery: new BatteryInfo(coreContext, this.accessory),
      findMe: new FindMeService(coreContext, this.accessory),
      pause: config.pause
        ? new PauseSwitch(coreContext, this.accessory, rooms)
        : undefined,
      dock: config.dock
        ? new DockService(coreContext, this.accessory)
        : undefined,
      zones: config.zones && config.zones.length > 0
        ? new ZonesService(coreContext, this.accessory, mainService)
        : undefined,
      waterBox: config.waterBox
        ? new WaterBoxService(coreContext, this.accessory)
        : undefined,
    };
  }

  private setupDeviceNotifications() {
    // Device state changes are handled by individual services via DeviceManager.stateChanged$
    // This method is kept for future use if needed
  }

  /**
   * Called by platform when device state changes
   */
  public notifyDeviceUpdater(id: string, data: any) {
    if (id === "CloudMessage" || id === "LocalMessage") {
      this.platform.log.debug(
        `Updating accessory with ${id} data: ${JSON.stringify(data)}`
      );

      if (data && Array.isArray(data) && data.length > 0) {
        const messages = data[0];
        
        // Emit state changes through DeviceManager so services can react
        if (messages && typeof messages === "object") {
          Object.keys(messages).forEach((key) => {
            this.deviceManager.emitStateChange(key, messages[key]);
          });
        }
      }
    }
  }

}

