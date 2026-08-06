// ── Screenshot Capture + Vision OCR for Coding Interviews ──
// Takes screenshots of the screen and uses LLM vision to read coding questions

import { callLLM, type LLMConfig, type Message } from './llmService';

export interface ScreenCapture {
  base64: string;
  timestamp: number;
}

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

  // Take a single screenshot via Electron's desktopCapturer
  async takeScreenshot(): Promise<ScreenCapture | null> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.takeScreenshot) {
        console.error('electronAPI.takeScreenshot not available');
        return null;
      }

      const base64 = await electronAPI.takeScreenshot();
      if (!base64) return null;

      this.lastCapture = {
        base64,
        timestamp: Date.now(),
      };

      return this.lastCapture;
    } catch (error) {
      console.error('Screenshot failed:', error);
      return null;
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
  async captureWindow(sourceId: string): Promise<ScreenCapture | null> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.captureWindow) {
        console.error('electronAPI.captureWindow not available');
        return null;
      }
      const base64 = await electronAPI.captureWindow(sourceId);
      if (!base64) return null;
      this.pickedWindowId = sourceId;
      this.lastCapture = { base64, timestamp: Date.now() };
      return this.lastCapture;
    } catch (error) {
      console.error('captureWindow failed:', error);
      return null;
    }
  }

  // Convenience: re-capture the previously picked window (or full screen
  // if nothing was picked yet).
  async recapturePickedOrScreen(): Promise<ScreenCapture | null> {
    if (this.pickedWindowId) {
      const result = await this.captureWindow(this.pickedWindowId);
      if (result) return result;
      // Window might have closed — fall back to full screen.
      this.pickedWindowId = null;
    }
    return this.takeScreenshot();
  }

  // Use LLM vision to analyze the screenshot for coding questions
  async analyzeScreenForCode(
    screenshot: ScreenCapture,
    config: LLMConfig,
    context?: { jobDescription?: string; programmingLanguage?: string }
  ): Promise<string> {
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

Return a clear summary of what you see on screen related to the coding interview.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What coding question or problem is visible on my screen? Extract all details.' },
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

  // Solve a coding problem extracted from the screen
  async solveCodingProblem(
    problemDescription: string,
    config: LLMConfig,
    context?: {
      programmingLanguage?: string;
      resumeContext?: string;
      additionalNotes?: string;
    }
  ): Promise<string> {
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
${context?.additionalNotes ? `\nAdditional context: ${context.additionalNotes}` : ''}`,
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
      const capture = await this.takeScreenshot();
      if (capture) onCapture(capture);
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
