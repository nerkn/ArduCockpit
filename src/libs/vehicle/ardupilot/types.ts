import { v4 as uuid } from 'uuid'

import { type Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'
import { round } from '@/libs/utils'
import { type Waypoint, AltitudeReferenceType, WaypointType } from '@/types/mission'

import { MavCmd, MavFrame, MAVLinkType, MavMissionType } from '../../connection/m2r/messages/mavlink2rest-enum'

const cockpitMavlinkFrameCorrespondency: [MavFrame, AltitudeReferenceType][] = [
  [MavFrame.MAV_FRAME_GLOBAL_INT, AltitudeReferenceType.ABSOLUTE_RELATIVE_TO_MSL],
  [MavFrame.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, AltitudeReferenceType.RELATIVE_TO_HOME],
  [MavFrame.MAV_FRAME_GLOBAL_TERRAIN_ALT_INT, AltitudeReferenceType.RELATIVE_TO_TERRAIN],
]

const mavlinkFrameFromCockpitAltRef = (cockpitAltRef: AltitudeReferenceType): MavFrame | undefined => {
  const correspondency = cockpitMavlinkFrameCorrespondency.find((corresp) => corresp[1] === cockpitAltRef)
  return correspondency === undefined ? undefined : correspondency[0]
}

const cockpitAltRefFromMavlinkFrame = (mavframe: MavFrame): AltitudeReferenceType | undefined => {
  const correspondency = cockpitMavlinkFrameCorrespondency.find((corresp) => corresp[0] === mavframe)
  return correspondency === undefined ? undefined : correspondency[1]
}

export const convertCockpitWaypointsToMavlink = (cockpitWaypoints: Waypoint[]): Message.MissionItemInt[] => {
  return cockpitWaypoints.map((cockpitWaypoint, i) => {
    return {
      target_system: 1,
      target_component: 1,
      type: MAVLinkType.MISSION_ITEM_INT,
      seq: i,
      frame: {
        type:
          mavlinkFrameFromCockpitAltRef(cockpitWaypoint.altitudeReferenceType) ||
          MavFrame.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
      },
      command: { type: MavCmd.MAV_CMD_NAV_WAYPOINT },
      current: 0,
      autocontinue: 1,
      param1: 0,
      param2: 5,
      param3: 0,
      param4: 999,
      x: round(cockpitWaypoint.coordinates[0] * Math.pow(10, 7)),
      y: round(cockpitWaypoint.coordinates[1] * Math.pow(10, 7)),
      z: cockpitWaypoint.altitude,
      mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
    }
  })
}

export const convertMavlinkWaypointsToCockpit = (mavlinkWaypoints: Message.MissionItemInt[]): Waypoint[] => {
  return mavlinkWaypoints.map((mavlinkWaypoint) => {
    return {
      id: uuid(),
      coordinates: [mavlinkWaypoint.x / Math.pow(10, 7), mavlinkWaypoint.y / Math.pow(10, 7)],
      altitude: mavlinkWaypoint.z,
      altitudeReferenceType:
        cockpitAltRefFromMavlinkFrame(mavlinkWaypoint.frame.type) || AltitudeReferenceType.RELATIVE_TO_HOME,
      type: mavlinkWaypoint.command.type === MavCmd.MAV_CMD_NAV_WAYPOINT ? WaypointType.PASS_BY : WaypointType.TAKEOFF,
    }
  })
}