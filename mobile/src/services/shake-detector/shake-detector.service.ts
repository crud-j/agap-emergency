import { Accelerometer } from 'expo-sensors';

const SHAKE_THRESHOLD = 2.5;
const SHAKE_DEBOUNCE_MS = 2000;

export class ShakeDetectorService {
  private subscription: { remove: () => void } | null = null;
  private lastShakeAt = 0;

  start(onShake: () => void): void {
    Accelerometer.setUpdateInterval(100);
    this.subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - this.lastShakeAt > SHAKE_DEBOUNCE_MS) {
          this.lastShakeAt = now;
          onShake();
        }
      }
    });
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export { ShakeDetectorService as ShakeDetector };
