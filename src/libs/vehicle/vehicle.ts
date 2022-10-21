import global from '@/libs/cosmos'
import * as FunnyName from '@/libs/funny-name/funny-name'
import { Signal } from '@/libs/signal'
import type {
  Attitude,
  Battery,
  Coordinates,
  PowerSupply,
} from '@/libs/vehicle/types'

/**
 * Define possible firmwares used by the vehicle
 */
export enum Firmware {
  ArduPilot = 'ardupilot',
  PX4 = 'px4',
  None = 'none',
}

/**
 * Define vehicle type
 */
export enum Type {
  Antenna = 'antenna',
  Blimp = 'blimp',
  Copter = 'copter',
  Plane = 'plane',
  Rover = 'rover',
  Sub = 'sub',
}

/**
 * Create funny name based on the vehicle type
 *
 * @param {Type} type
 * @returns {FunnyName.Type}
 */
function toFunnyNameType(type: Type): FunnyName.Type {
  switch (type) {
    case Type.Sub:
      return FunnyName.Type.Water
    default:
      return FunnyName.Type.None
  }
}

/**
 * Vehicle abstraction
 */
export abstract class Abstract {
  // Information used to identify vehicle on frontend and specialized functionalities
  _firmware: Firmware
  _type: Type

  // Unique identification number and name to check between vehicles
  _cockpitRegistrationUUID: string
  _funnyName: string

  // Signals
  onArm = new Signal<boolean>()
  onAttitude = new Signal<Attitude>()
  onBatteries = new Signal<Battery[]>()
  onCpuLoad = new Signal<number>()
  onPosition = new Signal<Coordinates>()
  onPowerSupply = new Signal<PowerSupply>()

  /**
   * Constructor for the abstract vehicle type
   *
   * @param {Firmware} firmware
   * @param {Type} type
   */
  constructor(firmware: Firmware, type: Type) {
    this._firmware = firmware
    this._type = type

    unimplemented(
      'We need to have a better way to generate a unique id based on the vehicle hardware'
    )
    this._cockpitRegistrationUUID = global.crypto.randomUUID()
    this._funnyName = FunnyName.generate(toFunnyNameType(type))

    console.info(
      `Creating a new Vehicle:\n`,
      `\tname: ${this._funnyName}\n`,
      `\tidentification: ${this._cockpitRegistrationUUID}\n`,
      `\ttype: ${this._type}\n`,
      `\tfirmware: ${this._firmware}\n`
    )

    this.onArm.register_caller(() => this.arm())
    this.onAttitude.register_caller(() => this.attitude())
    this.onBatteries.register_caller(() => this.batteries())
    this.onCpuLoad.register_caller(() => this.cpuLoad())
    this.onPosition.register_caller(() => this.position())
    this.onPowerSupply.register_caller(() => this.powerSupply())
  }

  /**
   * Return the firmware type of the vehicle
   *
   * @returns {Type}
   */
  firmware(): Type {
    return this._type
  }

  /**
   * Return the vehicle type
   *
   * @returns {Type}
   */
  type(): Type {
    return this._type
  }

  abstract onMessage(message: Uint8Array): void

  abstract arm(): boolean
  abstract attitude(): Attitude
  abstract batteries(): Battery[]
  abstract cpuLoad(): number // Percentage
  abstract disarm(): boolean
  abstract isArmed(): boolean
  abstract position(): Coordinates
  abstract powerSupply(): PowerSupply
}
