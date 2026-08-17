// ── Screenshot Capture + Vision OCR for Coding Interviews ──
// Takes screenshots of the screen and uses LLM vision to read coding questions

import { callLLM, type LLMConfig, type Message } from './llmService';

export interface ScreenCapture {
  base64: string;
  timestamp: number;
}

// P0 fix 2026-08-17 — discriminated result for capture operations. The
// previous `ScreenCapture | null` silently returned null on permission
// failures, which is exactly what Ade hit on the coding interview (the
// LLM said "no screenshot visible" because the capture was actually a
// 1x1 black PNG from the macOS permission-denied path). Now callers get
// a typed error with a user-actionable message.
export type CaptureResult =
  | { ok: true; base64: string; timestamp: number }
  | { ok: false; error: 'no-source' | 'permission-denied' | 'no-source-id' | 'window-not-found' | 'ipc-error'; message: string };

export interface WindowSource {
  id: string;
  name: string;
  thumbnail: string; // data:image/png;base64,...
}

class ScreenCaptureService {
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private isCapturing = false;
  private lastCapture: ScreenCapture | null = null;
  // P0 fix 1.4 — remember which window the candidate picked so repeat
  // captures in the same session don't make them re-pick.
  private pickedWindowId: string | null = null;

  // P0 fix 2026-08-17 — pre-flight macOS Screen Recording permission check.
  // Returns 'granted' or a specific reason. The Coding UI surfaces this
  // before the user clicks Capture so they fix permissions first.
  async checkPermission(): Promise<{ status: 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined'; platform: string; message: string }> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.checkScreenPermission) {
        return { status: 'unknown', platform: 'unknown', message: 'preload bridge missing checkScreenPermission' };
      }
      return await electronAPI.checkScreenPermission();
    } catch (e: any) {
      return { status: 'unknown', platform: 'unknown', message: e?.message || 'permission check failed' };
    }
  }

  // Take a single screenshot via Electron's desktopCapturer. Returns a
  // discriminated CaptureResult so the UI can show a real error when
  // macOS Screen Recording permission is not granted (the previous
  // null-return silently passed a 1x1 black PNG to the LLM).
  async takeScreenshot(): Promise<CaptureResult> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.takeScreenshot) {
        return { ok: false, error: 'ipc-error', message: 'preload bridge missing takeScreenshot' };
      }
      const result: CaptureResult = await electronAPI.takeScreenshot();
      if (result.ok) {
        this.lastCapture = { base64: result.base64, timestamp: result.timestamp };
      }
      return result;
    } catch (e: any) {
      return { ok: false, error: 'ipc-error', message: e?.message || 'IPC call failed' };
    }
  }

  // P0 fix 1.4 — list the candidate's open windows so they can pick the
  // coding window (VS Code, LeetCode, browser, etc.) instead of always
  // grabbing the whole screen.
  async listWindows(): Promise<WindowSource[]> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.listWindows) {
        console.error('electronAPI.listWindows not available');
        return [];
      }
      return await electronAPI.listWindows();
    } catch (error) {
      console.error('listWindows failed:', error);
      return [];
    }
  }

  // P0 fix 1.4 — capture a specific window by its desktopCapturer id.
  // Returns a discriminated CaptureResult so callers can show real errors.
  async captureWindow(sourceId: string): Promise<CaptureResult> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.captureWindow) {
        return { ok: false, error: 'ipc-error', message: 'preload bridge missing captureWindow' };
      }
      const result: CaptureResult = await electronAPI.captureWindow(sourceId);
      if (result.ok) {
        this.pickedWindowId = sourceId;
        this.lastCapture = { base64: result.base64, timestamp: result.timestamp };
      }
      return result;
    } catch (e: any) {
      return { ok: false, error: 'ipc-error', message: e?.message || 'IPC call failed' };
    }
  }

  // Convenience: re-capture the previously picked window (or full screen
  // if nothing was picked yet). Returns a CaptureResult so callers can
  // surface permission errors instead of silently swallowing them.
  async recapturePickedOrScreen(): Promise<CaptureResult> {
    if (this.pickedWindowId) {
      const result = await this.captureWindow(this.pickedWindowId);
      if (result.ok) return result;
      // Window might have closed — fall back to full screen.
      this.pickedWindowId = null;
    }
    return this.takeScreenshot();
  }

  // Use LLM vision to analyze the screenshot for coding questions.
  //
  // 2026-08-17 P0 fix: also accept `audioTranscript` (the interviewer's
  // speech-to-text from audioService). When present, prepend a text
  // section describing what the interviewer SAID so the LLM can use both
  // the on-screen question AND the interviewer's spoken framing. This is
  // what Ade needed on 2026-08-17 when LeetCode + the interviewer's
  // voice together give the LLM enough context to write a usable answer.
  async analyzeScreenForCode(
    screenshot: ScreenCapture,
    config: LLMConfig,
    context?: {
      jobDescription?: string;
      programmingLanguage?: string;
      audioTranscript?: string;
    }
  ): Promise<string> {
    const audioBlock = context?.audioTranscript?.trim()
      ? `\n\n── INTERVIEWER'S SPOKEN FRAMING (transcribed from system audio) ──\n${context.audioTranscript.trim()}\n\nUse the spoken framing together with what's on screen to identify the exact problem. If the on-screen problem statement is partially obscured or not yet visible, infer the full statement from the interviewer's words.`
      : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are an expert coding interview assistant. Analyze the screenshot and:
1. Identify any coding problem/question visible on screen
2. Extract the full problem statement
3. Note any constraints, examples, or test cases visible
4. Identify the programming language being used (or expected)
${context?.programmingLanguage ? `The user is coding in ${context.programmingLanguage}.` : ''}
${context?.jobDescription ? `Job context: ${context.jobDescription}` : ''}
${audioBlock}

Return a clear summary of what you see on screen related to the coding interview.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What coding question or problem is visible on my screen? Extract all details.' + (context?.audioTranscript?.trim() ? ' Use the interviewer\'s spoken framing as additional context.' : '') },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshot.base64}` },
          },
        ],
      },
    ];

    const response = await callLLM(messages, config);
    return response.text;
  }

  // Solve a coding problem extracted from the screen. Also accepts
  // `audioTranscript` so the LLM can refine the problem statement or pick
  // up clarifications the interviewer said out loud (e.g. "and ignore
  // duplicate edges", "your solution should be O(n log n)"). When the
  // transcript adds constraints the screen image doesn't show, we splice
  // them into the problem text.
  async solveCodingProblem(
    problemDescription: string,
    config: LLMConfig,
    context?: {
      programmingLanguage?: string;
      resumeContext?: string;
      additionalNotes?: string;
      audioTranscript?: string;
    }
  ): Promise<string> {
    const audioBlock = context?.audioTranscript?.trim()
      ? `\n\n── INTERVIEWER'S SPOKEN CLARIFICATIONS (transcribed from system audio) ──\n${context.audioTranscript.trim()}\n\nIncorporate any clarifications, constraints, or hints the interviewer said out loud into your solution.`
      : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: `You are an expert software engineer in a coding interview. Provide a clean, optimal solution.

Guidelines:
- Write clean, well-commented code
- Explain your approach briefly BEFORE the code
- Include time and space complexity analysis
- If multiple approaches exist, mention the optimal one
- Use ${context?.programmingLanguage || 'the appropriate programming language'}
- Write code that is interview-ready: clear variable names, proper structure
${context?.resumeContext ? `\nCandidate background: ${context.resumeContext}` : ''}
${context?.additionalNotes ? `\nAdditional context: ${context.additionalNotes}` : ''}${audioBlock}`,
      },
      {
        role: 'user',
        content: `Solve this coding interview problem:\n\n${problemDescription}`,
      },
    ];

    const response = await callLLM(messages, config);
    return response.text;
  }

  // Start periodic screen monitoring for coding interviews
  startMonitoring(
    intervalMs: number,
    onCapture: (capture: ScreenCapture) => void
  ): void {
    if (this.isCapturing) return;
    this.isCapturing = true;

    this.captureInterval = setInterval(async () => {
      const result = await this.takeScreenshot();
      // 2026-08-17 P0 fix — only call onCapture on success, so the
      // callback isn't handed a permission-denied error disguised as a
      // 1x1 black PNG.
      if (result.ok) onCapture({ base64: result.base64, timestamp: result.timestamp });
    }, intervalMs);
  }

  stopMonitoring(): void {
    this.isCapturing = false;
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }

  getLastCapture(): ScreenCapture | null {
    return this.lastCapture;
  }

  isActive(): boolean {
    return this.isCapturing;
  }
}

export const screenCaptureService = new ScreenCaptureService();
