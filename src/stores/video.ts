import { useStorage } from '@vueuse/core'
import { saveAs } from 'file-saver'
import localforage from 'localforage'
import { defineStore } from 'pinia'
import Swal from 'sweetalert2'
import { computed, ref, watch } from 'vue'
import adapter from 'webrtc-adapter'

import { WebRTCManager } from '@/composables/webRTC'
import { isEqual } from '@/libs/utils'
import { useMainVehicleStore } from '@/stores/mainVehicle'
import type { StreamData } from '@/types/video'

export const useVideoStore = defineStore('video', () => {
  const { rtcConfiguration, webRTCSignallingURI } = useMainVehicleStore()
  console.debug('[WebRTC] Using webrtc-adapter for', adapter.browserDetails)

  const allowedIceIps = useStorage<string[]>('cockpit-allowed-stream-ips', [])
  const activeStreams = ref<{ [key in string]: StreamData | undefined }>({})
  const mainWebRTCManager = new WebRTCManager(webRTCSignallingURI.val, rtcConfiguration)
  const { availableStreams } = mainWebRTCManager.startStream(ref(undefined), allowedIceIps)
  const availableIceIps = ref<string[]>([])

  const namesAvailableStreams = computed(() => availableStreams.value.map((stream) => stream.name))

  // If the allowed ICE IPs are updated, all the streams should be reconnected
  watch(allowedIceIps, () => {
    Object.keys(activeStreams.value).forEach((streamName) => (activeStreams.value[streamName] = undefined))
  })

  // Streams update routine. Responsible for starting and updating the streams.
  setInterval(() => {
    Object.keys(activeStreams.value).forEach((streamName) => {
      if (activeStreams.value[streamName] === undefined) return
      // Update the list of available remote ICE Ips with those available for each stream
      // @ts-ignore: availableICEIPs is not reactive here, for some yet to know reason
      const newIps = activeStreams.value[streamName].webRtcManager.availableICEIPs.filter(
        (ip: string) => !availableIceIps.value.includes(ip)
      )
      availableIceIps.value = [...availableIceIps.value, ...newIps]

      const updatedStream = availableStreams.value.find((s) => s.name === streamName)
      if (isEqual(updatedStream, activeStreams.value[streamName]!.stream)) return

      // Whenever the stream is to be updated we first reset it's variables (activateStream method), so
      // consumers can be updated as well.
      console.log(`New stream for '${streamName}':`)
      console.log(JSON.stringify(updatedStream, null, 2))
      activateStream(streamName)
      // @ts-ignore
      activeStreams.value[streamName].stream = updatedStream
    })
  }, 300)

  /**
   * Activates a stream by starting it and storing it's variables inside a common object.
   * This way multiple consumers will always access the same resource, so we don't consume unnecessary
   * bandwith or stress the stream provider more than we need to.
   * @param {string} streamName - Unique name for the stream, common between the multiple consumers
   */
  const activateStream = (streamName: string): void => {
    const stream = ref()
    const webRtcManager = new WebRTCManager(webRTCSignallingURI.val, rtcConfiguration)
    const { mediaStream } = webRtcManager.startStream(stream, allowedIceIps)
    activeStreams.value[streamName] = {
      stream: stream,
      webRtcManager: webRtcManager,
      mediaStream: mediaStream,
    }
  }

  /**
   * bandwith or stress the stream provider more than we need to.
   * @param {string} streamName - Name of the stream
   * @returns {MediaStream | undefined} MediaStream that is running, if available
   */
  const getMediaStream = (streamName: string): MediaStream | undefined => {
    if (activeStreams.value[streamName] === undefined) {
      activateStream(streamName)
    }
    // @ts-ignore
    return activeStreams.value[streamName].mediaStream
  }

  // Offer download of backuped videos
  const videoRecoveryDB = localforage.createInstance({
    driver: localforage.INDEXEDDB,
    name: 'Cockpit - Video Recovery',
    storeName: 'cockpit-video-recovery-db',
    version: 1.0,
    description: 'Local backups of Cockpit video recordings to be retrieved in case of failure.',
  })

  videoRecoveryDB.length().then((len) => {
    if (len === 0) return

    Swal.fire({
      title: 'Video recording recovery',
      text: `Cockpit has pending backups for videos that you started recording but did not download.
        Click 'Discard' to remove the backuped files.
        Click 'Dismiss' to postpone this decision for the next boot.
        Click 'Download' to download the files. If you decide to download them, they will be removed afterwards.
      `,
      icon: 'warning',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Download',
      denyButtonText: 'Discard',
      cancelButtonText: 'Dismiss',
    }).then((decision) => {
      if (decision.isDismissed) return
      if (decision.isDenied) {
        videoRecoveryDB.iterate((_, videoName) => videoRecoveryDB.removeItem(videoName))
      } else if (decision.isConfirmed) {
        videoRecoveryDB.iterate((videoFile, videoName) => {
          const blob = (videoFile as Blob[]).reduce((a, b) => new Blob([a, b], { type: 'video/webm' }))
          saveAs(blob, videoName)
        })
        videoRecoveryDB.iterate((_, videoName) => videoRecoveryDB.removeItem(videoName))
      }
    })
  })

  // Routine to make sure the user has chosen the allowed ICE candidate IPs, so the stream works as expected
  const iceIpCheckInterval = setInterval(() => {
    // Pass if there are no available IPs yet or if the user has already set the allowed ones
    if (availableIceIps.value === undefined || !allowedIceIps.value.isEmpty()) {
      return
    }
    // If there's more than one IP candidate available, send a warning an clear the check routine
    if (availableIceIps.value.length >= 1) {
      Swal.fire({
        html: `
          <p>Cockpit detected more than one IP address being used to route the video streaming. This often
          leads to video stuttering, especially if one of the IPs is from a non-wired connection.</p>
          </br>
          <p>To prevent issues and achieve an optimal streaming experience, please:</p>
          <ol>
            <li>1. Open the configuration of one of your video widgets (in Edit Mode).</li>
            <li>2. Select the IP address that should be used for the video streaming.</li>
          </ol>
        `,
        icon: 'warning',
        customClass: {
          htmlContainer: 'text-left',
        },
      })
      clearInterval(iceIpCheckInterval)
    }
  }, 5000)

  return {
    availableIceIps,
    allowedIceIps,
    namesAvailableStreams,
    videoRecoveryDB,
    getMediaStream,
  }
})
