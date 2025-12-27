/**
 * Ringtone utility using Web Audio API
 * Generates a phone ringtone sound
 */

let audioContext: AudioContext | null = null;
let ringtoneInterval: NodeJS.Timeout | null = null;
let isPlaying = false;

export function playRingtone() {
  if (isPlaying) return; // Already playing
  
  try {
    // Create audio context if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    isPlaying = true;
    let ringCount = 0;
    const maxRings = 20; // Stop after 20 rings (about 1 minute)

    const playRing = () => {
      if (!audioContext || ringCount >= maxRings) {
        stopRingtone();
        return;
      }

      ringCount++;
      
      // Create two oscillators for a dual-tone ring (like a real phone)
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Connect to gain node
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set frequencies for a phone ring (440Hz and 480Hz)
      oscillator1.frequency.value = 440;
      oscillator2.frequency.value = 480;
      oscillator1.type = 'sine';
      oscillator2.type = 'sine';

      // Set volume
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

      // Play the ring
      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.4);
      oscillator2.stop(audioContext.currentTime + 0.4);
    };

    // Play ring immediately
    playRing();

    // Then play every 2 seconds (ring pattern: 0.4s on, 1.6s off)
    ringtoneInterval = setInterval(() => {
      if (isPlaying) {
        playRing();
      }
    }, 2000);

  } catch (error) {
    console.error("Error playing ringtone:", error);
    isPlaying = false;
  }
}

export function stopRingtone() {
  isPlaying = false;
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  // Note: We don't close the audio context as it might be needed again
}

