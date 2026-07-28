// ── Audio Capture + Speech-to-Text ──
// Captures the call's system/desktop audio (the interviewer), then transcribes
// it using browser SpeechRecognition or Whisper. Microphone capture remains an
// explicit fallback for platforms where desktop audio is unavailable; it is
// never selected silently because that would transcribe the candidate instead.

export interface TranscriptionChunk {
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: 'interviewer' | 'user' | 'unknown';
}

type TranscriptionCallback = (chunk: TranscriptionChunk) => void;

class AudioCaptureService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isCapturing = false;
  private onTranscription: TranscriptionCallback | null = null;
  private speechRecognition: any = null;
  private whisperApiKey: string | null = null;
  // Default to the LOCAL faster-whisper server (on-device, no API key).
  // Override via options.whisperEndpoint to point at a remote/OpenAI endpoint.
  private whisperEndpoint: string = 'http://localhost:18799/v1/audio/transcriptions';
  private transcriptionMode: 'browser' | 'whisper' = 'whisper';
  private chunkInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Capture system audio through getDisplayMedia. Electron's main-process
   * display-media handler supplies the primary display plus an audio loopback
   * track. The video track is stopped immediately; only call audio is recorded.
   */
  async startSystemAudioCapture(
    callback: TranscriptionCallback,
    options?: {
      mode?: 'browser' | 'whisper';
      whisperApiKey?: string;
      whisperEndpoint?: string;
    }
  ): Promise<void> {
    this.onTranscription = callback;
    this.transcriptionMode = options?.mode || 'browser';
    this.whisperApiKey = options?.whisperApiKey || null;
    if (options?.whisperEndpoint) this.whisperEndpoint = options.whisperEndpoint;

    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          width: { ideal: 1 },
          height: { ideal: 1 },
          frameRate: { ideal: 1, max: 1 },
        },
      });

      const audioTracks = this.mediaStream.getAudioTracks();
      this.mediaStream.getVideoTracks().forEach((track) => track.stop());

      if (audioTracks.length === 0) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
        throw new Error(
          'No system-audio track was provided. Allow Screen & System Audio Recording for Interview Copilot in System Settings → Privacy & Security.'
        );
      }

      console.log(
        '[AudioService] Interviewer system-audio capture started:',
        audioTracks.map((track) => ({ label: track.label, settings: track.getSettings() }))
      );
      this.isCapturing = true;
      this.startTranscription();
    } catch (error) {
      this.stopCapture();
      console.error('[AudioService] Interviewer system-audio capture failed:', error);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not capture the interviewer's system audio: ${detail}. ` +
        'This mode intentionally does not fall back to the microphone.'
      );
    }
  }

  /**
   * Explicit microphone fallback for diagnostics/unsupported platforms.
   * This captures the candidate and must never be selected automatically.
   */
  async startMicCapture(
    callback: TranscriptionCallback,
    options?: {
      mode?: 'browser' | 'whisper';
      whisperApiKey?: string;
      whisperEndpoint?: string;
    }
  ): Promise<void> {
    this.onTranscription = callback;
    this.transcriptionMode = options?.mode || 'whisper';
    this.whisperApiKey = options?.whisperApiKey || null;
    if (options?.whisperEndpoint) this.whisperEndpoint = options.whisperEndpoint;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
        },
      });
      console.log('[AudioService] Microphone capture started');
      this.isCapturing = true;
      this.startTranscription();
    } catch (error) {
      console.error('[AudioService] Microphone capture failed:', error);
      throw new Error('No audio capture method available. Please check microphone permissions.');
    }
  }

  private startTranscription(): void {
    const isElectron = !!(window as any).electronAPI;

    // In Electron, browser SpeechRecognition silently fails (can't reach
    // Google's servers). Always use Whisper when running in Electron.
    // Local Whisper (default endpoint) needs NO API key, so don't gate on it.
    if (isElectron) {
      console.log('[AudioService] Electron detected — using Whisper transcription:', this.whisperEndpoint);
      this.transcriptionMode = 'whisper';
      this.startWhisperTranscription();
      return;
    }

    if (this.transcriptionMode === 'browser') {
      this.startBrowserTranscription();
    } else {
      this.startWhisperTranscription();
    }
  }

  // Browser-based speech recognition (free, real-time)
  // NOTE: webkitSpeechRecognition in Electron may silently fail because it
  // depends on Google's speech servers. We detect failure via onerror and
  // auto-fallback to Whisper if an API key is available.
  private startBrowserTranscription(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[AudioService] Browser SpeechRecognition not available');
      this.fallbackToWhisperOrWarn();
      return;
    }

    let hasReceivedResult = false;
    let failCount = 0;

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = 'en-US';

    this.speechRecognition.onresult = (event: any) => {
      hasReceivedResult = true;
      failCount = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        this.onTranscription?.({
          text: result[0].transcript,
          timestamp: Date.now(),
          isFinal: result.isFinal,
          speaker: 'unknown',
        });
      }
    };

    this.speechRecognition.onerror = (event: any) => {
      console.error('[AudioService] Speech recognition error:', event.error);

      if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'not-allowed') {
        // Google speech servers unreachable (common in Electron) → switch to Whisper
        console.warn('[AudioService] Browser speech failed (' + event.error + '), switching to Whisper');
        try { this.speechRecognition?.stop(); } catch (_) { /* ignore */ }
        this.speechRecognition = null;
        this.fallbackToWhisperOrWarn();
        return;
      }

      if (event.error === 'no-speech' || event.error === 'aborted') {
        failCount++;
        // If we've failed 5 times without any results, switch to Whisper
        if (!hasReceivedResult && failCount >= 5) {
          console.warn('[AudioService] Browser speech not producing results, switching to Whisper');
          try { this.speechRecognition?.stop(); } catch (_) { /* ignore */ }
          this.speechRecognition = null;
          this.fallbackToWhisperOrWarn();
          return;
        }
        // Normal restart after silence
        setTimeout(() => {
          if (this.isCapturing && this.speechRecognition) {
            try { this.speechRecognition.start(); } catch (_) { /* already running */ }
          }
        }, 500);
      }
    };

    this.speechRecognition.onend = () => {
      // Auto-restart if still capturing
      if (this.isCapturing && this.speechRecognition) {
        setTimeout(() => {
          try { this.speechRecognition?.start(); } catch (_) { /* already running */ }
        }, 100);
      }
    };

    try {
      this.speechRecognition.start();
      console.log('[AudioService] Browser speech recognition started');
    } catch (e) {
      console.error('[AudioService] Failed to start speech recognition:', e);
      this.fallbackToWhisperOrWarn();
    }
  }

  private fallbackToWhisperOrWarn(): void {
    // Local Whisper needs no API key — a live media stream is enough.
    if (this.mediaStream) {
      console.log('[AudioService] Falling back to Whisper transcription:', this.whisperEndpoint);
      this.transcriptionMode = 'whisper';
      this.startWhisperTranscription();
    } else {
      console.error('[AudioService] No transcription method available — no audio stream.');
      // Send an error notification to the UI via a fake transcription event
      this.onTranscription?.({
        text: '[Audio capture unavailable — check microphone permissions, or type questions manually below]',
        timestamp: Date.now(),
        isFinal: true,
        speaker: 'unknown',
      });
    }
  }

  // Whisper-based transcription (local mode needs no API key)
  // Uses stop/restart pattern so each chunk is a complete valid WebM file
  // with proper headers (timeslice fragments lack headers and get rejected).
  private startWhisperTranscription(): void {
    if (!this.mediaStream) return;

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    // When stop() is called, ondataavailable fires with the complete recording.
    // We send it to Whisper, then restart recording for the next chunk.
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && this.isCapturing) {
        const audioBlob = new Blob([event.data], { type: 'audio/webm' });
        console.log(`[AudioService] Whisper: Got ${(audioBlob.size / 1024).toFixed(1)}KB complete WebM chunk`);

        // Restart recording immediately for the next chunk
        if (this.isCapturing && this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
          try { this.mediaRecorder.start(); } catch (_) { /* ignore */ }
        }

        // Send to Whisper API (async, doesn't block the next recording)
        await this.transcribeWithWhisper(audioBlob);
      }
    };

    // Start recording (no timeslice — we control chunks via stop/start)
    this.mediaRecorder.start();
    console.log('[AudioService] Whisper: MediaRecorder started, will cycle every 8s');

    // Eight-second chunks reduce word loss at recorder boundaries while keeping
    // the answer latency low enough for a live interview.
    // Stop the recorder to trigger ondataavailable with a
    // complete valid WebM file, then ondataavailable restarts it.
    this.chunkInterval = setInterval(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
    }, 8000);
  }

  private async transcribeWithWhisper(audioBlob: Blob): Promise<void> {
    try {
      // Convert Blob to ArrayBuffer for IPC transfer
      const arrayBuffer = await audioBlob.arrayBuffer();

      const api = (window as any).electronAPI;
      if (api?.whisperTranscribe) {
        // Route through main process to bypass CORS.
        // Local faster-whisper server ignores the key; remote endpoints use it.
        console.log(`[AudioService] Whisper: Sending ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB to ${this.whisperEndpoint} via IPC`);
        const result = await api.whisperTranscribe(arrayBuffer, this.whisperApiKey || '', this.whisperEndpoint);
        console.log('[AudioService] Whisper result:', JSON.stringify(result).slice(0, 200));

        if (result.ok && result.data?.text?.trim()) {
          console.log('[AudioService] Whisper transcription:', result.data.text.trim());
          this.onTranscription?.({
            text: result.data.text.trim(),
            timestamp: Date.now(),
            isFinal: true,
            speaker: 'unknown',
          });
        } else if (!result.ok) {
          console.error('[AudioService] Whisper API error:', result.data?.error?.message || JSON.stringify(result.data));
        } else {
          console.log('[AudioService] Whisper: No speech detected in this chunk');
        }
      } else {
        // Browser fallback (won't work due to CORS, but try anyway)
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('response_format', 'json');

        const response = await fetch(this.whisperEndpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.whisperApiKey}` },
          body: formData,
        });

        const data = await response.json();
        if (data.text?.trim()) {
          this.onTranscription?.({
            text: data.text.trim(),
            timestamp: Date.now(),
            isFinal: true,
            speaker: 'unknown',
          });
        }
      }
    } catch (error) {
      console.error('[AudioService] Whisper transcription failed:', error);
    }
  }

  stopCapture(): void {
    this.isCapturing = false;

    if (this.speechRecognition) {
      try { this.speechRecognition.stop(); } catch (_) { /* ignore */ }
      this.speechRecognition = null;
    }

    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) { /* ignore */ }
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.audioChunks = [];
    console.log('[AudioService] Capture stopped');
  }

  isActive(): boolean {
    return this.isCapturing;
  }
}

export const audioService = new AudioCaptureService();
