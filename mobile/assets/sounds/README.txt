Place your SOS alert MP3 here as:  sos-alert.mp3

Suggested sound: "Emergency Meeting" from myinstants.com
  https://www.myinstants.com/instant/emergency-meeting-41695/

After adding the file, update SOSAlert.tsx:
  Change:  const SOS_SOUND_SOURCE: AVPlaybackSource | null = null;
  To:      const SOS_SOUND_SOURCE = require('@/assets/sounds/sos-alert.mp3') as AVPlaybackSource;
