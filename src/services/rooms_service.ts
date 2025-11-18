import { Service, PlatformAccessory } from "homebridge";
import { filter } from "rxjs";
import { CoreContext } from "./types";
import { RoomsConfig } from "./config_service";
import { PluginServiceClass } from "./plugin_service_class";
import { ensureName } from "./utils/ensure_name";

interface Room extends Service {
  roomId: number;
}

export class RoomsService extends PluginServiceClass {
  public readonly roomIdsToClean = new Set<number>();
  private readonly rooms: Record<string, Room> = {};
  private roomTimeout: NodeJS.Timeout | null = null;

  constructor(
    coreContext: CoreContext,
    private readonly accessory: PlatformAccessory,
    private readonly setCleaning: (clean: boolean) => Promise<void>
  ) {
    super(coreContext);
    
    if (this.config.rooms) {
      for (const room of this.config.rooms) {
        this.createRoom(room.id, room.name);
      }
    }
  }

  public async init() {
    // Reset room switches when cleaning stops
    this.deviceManager.stateChanged$
      .pipe(filter(({ key }) => key === "state"))
      .subscribe(({ value }) => {
        const isCleaning = this.deviceManager.isCleaning;
        if (!isCleaning) {
          this.services.forEach((room) => {
            room
              .getCharacteristic(this.hap.Characteristic.On)
              .updateValue(false);
          });
          this.roomIdsToClean.clear();
        }
      });
  }

  public get services(): Service[] {
    return [...Object.values(this.rooms)];
  }

  private createRoom(roomId: number, roomName: string) {
    this.log.info(`Creating room switch: ${roomName} (ID: ${roomId})`);

    const switchName = `${this.config.cleanword} ${roomName}`;
    const room = Object.assign(
      this.accessory.getServiceById(this.hap.Service.Switch, `room-${roomId}`)
        || this.accessory.addService(this.hap.Service.Switch, switchName, `room-${roomId}`),
      { roomId }
    ) as Room;

    ensureName(this.hap, room, switchName);

    room
      .getCharacteristic(this.hap.Characteristic.On)
      .onGet(() => this.getCleaningRoom(room.roomId))
      .onSet((newState) => this.setCleaningRoom(newState as boolean, room.roomId));

    this.rooms[roomName] = room;
  }

  private async getCleaningRoom(roomId: number) {
    return this.roomIdsToClean.has(roomId);
  }

  private async setCleaningRoom(state: boolean, roomId: number) {
    try {
      if (state && !this.deviceManager.isCleaning && !this.deviceManager.isPaused) {
        this.log.info(`Enable cleaning Room ID ${roomId}`);
        this.roomIdsToClean.delete(roomId);
        this.roomIdsToClean.add(roomId);
        this.checkRoomTimeout();
      } else if (!state && !this.deviceManager.isCleaning && !this.deviceManager.isPaused) {
        this.log.info(`Disable cleaning Room ID ${roomId}`);
        this.roomIdsToClean.delete(roomId);
        this.checkRoomTimeout();
      }
    } catch (err) {
      this.log.error(`setCleaningRoom failed:`, err);
      throw err;
    }
  }

  private checkRoomTimeout() {
    if (this.config.roomTimeout > 0) {
      this.log.info(`Starting timeout to clean rooms (${this.config.roomTimeout}s)`);
      if (this.roomTimeout) {
        clearTimeout(this.roomTimeout);
      }
      if (this.roomIdsToClean.size > 0) {
        this.roomTimeout = setTimeout(
          () => this.setCleaning(true),
          this.config.roomTimeout * 1000
        );
      }
    }
  }
}

