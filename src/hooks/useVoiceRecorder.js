import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for browser microphone audio recording with MediaRecorder and codec negotiation.
 * @param {{ maxDurationSeconds?: number, onRecordComplete?: (blob: Blob) => void }} options
 */
export function useVoiceRecorder({
  maxDurationSeconds = 60,
  onRecordComplete,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const isCancelledRef = useRef(false);

  // Determine best supported browser audio mimeType
  const getSupportedMimeType = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }, []);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = false;
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Safe ignore if already stopped
      }
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Safe ignore
      }
    }
    setIsRecording(false);
    setDuration(0);
    cleanupStream();
  }, [isRecording, cleanupStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    setDuration(0);
    isCancelledRef.current = false;
    chunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Audio recording is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (!isCancelledRef.current && chunksRef.current.length > 0) {
          const finalMime = recorder.mimeType || mimeType || 'audio/webm';
          const audioBlob = new Blob(chunksRef.current, { type: finalMime });
          if (onRecordComplete) {
            onRecordComplete(audioBlob);
          }
        }
        cleanupStream();
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder Error:', e);
        setError('An error occurred during audio recording.');
        cancelRecording();
      };

      recorder.start(250); // Collect chunk every 250ms
      setIsRecording(true);

      // Start elapsed duration timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setDuration(elapsed);

        // Auto-stop on reaching max duration ceiling
        if (elapsed >= maxDurationSeconds) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      console.warn('Microphone Access Error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access was denied. Please allow microphone permissions in browser settings.');
      } else {
        setError('Could not access microphone. Please check your audio input device.');
      }
      cleanupStream();
    }
  }, [maxDurationSeconds, onRecordComplete, getSupportedMimeType, cleanupStream, stopRecording, cancelRecording]);

  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    isRecording,
    duration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

export default useVoiceRecorder;
