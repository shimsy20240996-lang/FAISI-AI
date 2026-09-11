import { useState, useRef, useEffect, useCallback } from 'react';
import { apiSynthesizeSpeech } from '../services/api';

/**
 * Custom hook for managing speech playback (Gemini TTS + Web Speech API fallback)
 */
export function useAudioPlayer() {
  const [playbackState, setPlaybackState] = useState('idle'); // 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const currentBlobUrlRef = useRef(null);

  const stop = useCallback(() => {
    // Stop HTML Audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // Stop Web Speech synthesis fallback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Revoke object URL
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    setPlaybackState('idle');
    setActiveMessageId(null);
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current && playbackState === 'playing') {
      audioRef.current.pause();
      setPlaybackState('paused');
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setPlaybackState('paused');
    }
  }, [playbackState]);

  const resume = useCallback(() => {
    if (audioRef.current && playbackState === 'paused') {
      audioRef.current.play().then(() => {
        setPlaybackState('playing');
      }).catch((e) => {
        console.error('Audio resume error:', e);
        setPlaybackState('error');
      });
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPlaybackState('playing');
    }
  }, [playbackState]);

  const play = useCallback(async (messageId, text, voice = 'Aoede') => {
    // If currently playing the same message, toggle pause/resume
    if (activeMessageId === messageId) {
      if (playbackState === 'playing') {
        pause();
        return;
      }
      if (playbackState === 'paused') {
        resume();
        return;
      }
    }

    // Stop any active playback
    stop();

    if (!text || !text.trim()) return;

    setActiveMessageId(messageId);
    setPlaybackState('loading');
    setError(null);

    // Strip markdown formatting for cleaner audio reading
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[\d+\]/g, '') // strip citation numbers [1], [2]
      .replace(/[#*_~]/g, '')
      .slice(0, 2000)
      .trim();

    try {
      // 1. Attempt Server Gemini TTS
      const audioBlob = await apiSynthesizeSpeech(cleanText, voice);
      const blobUrl = URL.createObjectURL(audioBlob);
      currentBlobUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.onended = () => {
        stop();
      };

      audio.onerror = () => {
        console.warn('Audio playback error, falling back to Web Speech API');
        fallbackToWebSpeech(cleanText, messageId);
      };

      await audio.play();
      setPlaybackState('playing');
    } catch (err) {
      console.warn('Server TTS unavailable, using Web Speech API fallback:', err.message);
      fallbackToWebSpeech(cleanText, messageId);
    }
  }, [activeMessageId, playbackState, pause, resume, stop]);

  const fallbackToWebSpeech = useCallback((text, messageId) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Speech synthesis is not supported in this browser.');
      setPlaybackState('error');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setPlaybackState('playing');
      setActiveMessageId(messageId);
    };

    utterance.onend = () => {
      stop();
    };

    utterance.onerror = (e) => {
      console.error('SpeechSynthesis error:', e);
      stop();
      setError('Speech synthesis playback error.');
    };

    window.speechSynthesis.speak(utterance);
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    playbackState,
    activeMessageId,
    error,
    play,
    pause,
    resume,
    stop,
  };
}

export default useAudioPlayer;
