#!/usr/bin/env python3
"""
Local Whisper transcription server (faster-whisper).

OpenAI-compatible: POST /v1/audio/transcriptions  ->  {"text": "..."}
Runs entirely on this machine — no API key, no network call to OpenAI.

The model is loaded ONCE at startup and kept warm so each ~5s interview
audio chunk transcribes in a few hundred ms instead of reloading the model.

Env overrides:
  WHISPER_HOST   (default 127.0.0.1)
  WHISPER_PORT   (default 18799)
  WHISPER_MODEL  (default "medium"  — already cached locally)
  WHISPER_DEVICE (default "auto")
  WHISPER_COMPUTE(default "int8")   — fast CPU inference on Apple Silicon
  WHISPER_VAD    (default "false")  — Silero VAD filter on/off. Disable for
                                       quiet system-audio (Zoom, Meet) where
                                       the loopback level is often below the
                                       VAD threshold and gets dropped as
                                       silence. Set to "true" to re-enable.
  WHISPER_CHUNK_SECONDS (default "8")  — audio chunk length per request
  WHISPER_LOG_LEVEL (default "INFO")
"""
import io
import os
import sys
import json
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHISPER_PORT", "18799"))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
# Default OFF: VAD was eating real system-audio (Zoom/Meet loopback is often
# too quiet to clear Silero's threshold). Re-enable with WHISPER_VAD=true if
# you'd rather aggressively drop silence and accept some speech loss.
VAD_FILTER = os.environ.get("WHISPER_VAD", "false").strip().lower() in ("1", "true", "yes", "on")
LOG_LEVEL = os.environ.get("WHISPER_LOG_LEVEL", "INFO").upper()

def log(*a):
    print("[whisper_server]", *a, file=sys.stderr, flush=True)

log(
    f"loading faster-whisper model={MODEL_NAME} device={DEVICE} compute={COMPUTE} "
    f"vad={VAD_FILTER} log_level={LOG_LEVEL} ..."
)
MODEL = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
log("model loaded — ready")


def extract_audio_bytes(headers, body: bytes) -> bytes:
    """Pull the audio out of either a multipart/form-data body (the shape the
    Electron main process sends) or a raw audio body."""
    ctype = headers.get("Content-Type", "")
    if "multipart/form-data" in ctype and "boundary=" in ctype:
        boundary = ctype.split("boundary=", 1)[1].strip().strip('"')
        delim = b"--" + boundary.encode()
        for part in body.split(delim):
            head, sep, rest = part.partition(b"\r\n\r\n")
            if not sep:
                continue
            if b"filename=" in head:  # the file field
                content = rest
                if content.endswith(b"\r\n"):
                    content = content[:-2]
                return content
        return b""
    # Not multipart — treat the whole body as the audio payload.
    return body


def transcribe(audio: bytes) -> str:
    if not audio:
        return ""
    # faster-whisper decodes webm/opus via its bundled PyAV/ffmpeg, so we can
    # hand it the raw chunk written to a temp file.
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tf:
        tf.write(audio)
        tf.flush()
        # Capture the per-chunk audio level so we can log silence vs. speech.
        # (Uses RMS over the raw 16-bit PCM that PyAV decodes.)
        try:
            import av  # type: ignore
            container = av.open(tf.name)
            stream = container.streams.audio[0]
            samples = []
            for frame in container.decode(stream):
                arr = frame.to_ndarray()
                if arr.size:
                    samples.append(arr.astype("float32") / 32768.0)
            if samples:
                import numpy as np  # type: ignore
                pcm = np.concatenate(samples, axis=1).reshape(-1)
                rms = float(np.sqrt(np.mean(pcm ** 2)))
                peak = float(np.max(np.abs(pcm)))
                log(f"chunk audio level: rms={rms:.4f} peak={peak:.4f}")
        except Exception as e:  # noqa: BLE001
            log("level probe failed:", repr(e))

        # Reset file pointer — the probe may have advanced state in some decoders.
        tf.seek(0)
        tf.flush()
        segments, _info = MODEL.transcribe(
            tf.name,
            language="en",
            beam_size=1,
            vad_filter=VAD_FILTER,           # default OFF — see top-of-file
            condition_on_previous_text=False,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        log(f"transcribed {len(text)} chars: {text[:120]!r}")
        return text


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        # health check
        self._send(200, {"status": "ok", "model": MODEL_NAME})

    def do_POST(self):
        if not self.path.startswith("/v1/audio/transcriptions"):
            self._send(404, {"error": {"message": "not found"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b""
            audio = extract_audio_bytes(self.headers, body)
            text = transcribe(audio)
            self._send(200, {"text": text})
        except Exception as e:  # noqa: BLE001
            log("transcription error:", repr(e))
            self._send(500, {"error": {"message": str(e)}})

    def log_message(self, *args):  # silence default access logging
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on http://{HOST}:{PORT}/v1/audio/transcriptions")
    print("WHISPER_SERVER_READY", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
