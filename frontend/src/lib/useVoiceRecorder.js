/* MediaRecorder helper hook for voice answers. */
import { useCallback, useEffect, useRef, useState } from "react";

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const resolverRef = useRef(null);
  const mimeRef = useRef("audio/webm");

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const killStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => { stopTimer(); killStream(); }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setError("Voice recording is not supported in this browser.");
      throw new Error("MediaRecorder unsupported");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
      mimeRef.current = mime || "audio/webm";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        stopTimer();
        killStream();
        setRecording(false);
        if (resolverRef.current) { resolverRef.current(blob); resolverRef.current = null; }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    } catch (e) {
      setError(e?.message || "Microphone permission denied");
      throw e;
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      if (!mediaRef.current || mediaRef.current.state === "inactive") {
        resolve(null); return;
      }
      resolverRef.current = resolve;
      mediaRef.current.stop();
    });
  }, []);

  return { recording, elapsed, error, start, stop };
}
