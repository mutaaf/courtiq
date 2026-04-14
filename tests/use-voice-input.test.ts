/**
 * Tests for the useVoiceInput hook's core logic.
 *
 * Covers:
 *  - isSupported: false when SpeechRecognition is absent
 *  - isSupported: true when SpeechRecognition is present
 *  - start() sets isRecording to true and clears transcript
 *  - onerror (non-no-speech) sets isRecording to false
 *  - onend sets isRecording to false
 *  - onresult accumulates final segments
 *  - onresult exposes interim transcript live
 *  - Multiple final segments are concatenated correctly
 *  - stop() returns the trimmed final transcript
 *  - stop() clears interimTranscript
 *  - reset() clears all state
 *  - Calling stop() with nothing recorded returns empty string
 *  - Transcript combined display (final + interim)
 *  - 'no-speech' errors are silently ignored
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Extracted core logic mirroring useVoiceInput's state machine.
// This lets us test all transitions without a DOM / JSDOM speech API.
// ---------------------------------------------------------------------------

interface VoiceState {
  isRecording: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
}

function makeVoiceLogic(hasSpeechRecognition: boolean) {
  let state: VoiceState = {
    isRecording: false,
    isSupported: hasSpeechRecognition,
    transcript: '',
    interimTranscript: '',
  };

  let finalAccum = '';

  /** Simulate calling start() */
  function start() {
    if (!state.isSupported) return;
    finalAccum = '';
    state = { ...state, isRecording: true, transcript: '', interimTranscript: '' };
  }

  /**
   * Simulate the SpeechRecognition `result` event.
   * `results` is an array of { transcript, isFinal } objects (one per result item).
   */
  function fireResult(results: Array<{ transcript: string; isFinal: boolean }>) {
    let interim = '';
    for (const r of results) {
      if (r.isFinal) {
        finalAccum += r.transcript;
      } else {
        interim += r.transcript;
      }
    }
    state = { ...state, transcript: finalAccum, interimTranscript: interim };
  }

  /** Simulate the SpeechRecognition `end` event */
  function fireEnd() {
    state = { ...state, isRecording: false, interimTranscript: '' };
  }

  /** Simulate the SpeechRecognition `error` event */
  function fireError(errorCode: string) {
    // 'no-speech' is silently ignored (but still sets isRecording false in this logic)
    state = { ...state, isRecording: false, interimTranscript: '' };
    return errorCode === 'no-speech'; // returns true if it was silently handled
  }

  /** Simulate calling stop() — returns trimmed final transcript */
  function stop(): string {
    const result = finalAccum.trim();
    state = { ...state, isRecording: false, interimTranscript: '' };
    return result;
  }

  /** Simulate calling reset() */
  function reset() {
    finalAccum = '';
    state = {
      ...state,
      isRecording: false,
      transcript: '',
      interimTranscript: '',
    };
  }

  /** Combined display value (what the textarea shows while recording) */
  function displayValue(inputValue: string): string {
    if (!state.isRecording) return inputValue;
    const sep = inputValue && state.interimTranscript ? ' ' : '';
    return inputValue + sep + state.interimTranscript;
  }

  return {
    getState: () => ({ ...state }),
    start,
    fireResult,
    fireEnd,
    fireError,
    stop,
    reset,
    displayValue,
  };
}

// ---------------------------------------------------------------------------

describe('useVoiceInput — support detection', () => {
  it('isSupported is false when SpeechRecognition is absent', () => {
    const { getState } = makeVoiceLogic(false);
    expect(getState().isSupported).toBe(false);
  });

  it('isSupported is true when SpeechRecognition is present', () => {
    const { getState } = makeVoiceLogic(true);
    expect(getState().isSupported).toBe(true);
  });
});

describe('useVoiceInput — initial state', () => {
  it('starts in non-recording state', () => {
    const { getState } = makeVoiceLogic(true);
    expect(getState().isRecording).toBe(false);
  });

  it('starts with empty transcript', () => {
    const { getState } = makeVoiceLogic(true);
    expect(getState().transcript).toBe('');
  });

  it('starts with empty interimTranscript', () => {
    const { getState } = makeVoiceLogic(true);
    expect(getState().interimTranscript).toBe('');
  });
});

describe('useVoiceInput — start()', () => {
  it('sets isRecording to true', () => {
    const { start, getState } = makeVoiceLogic(true);
    start();
    expect(getState().isRecording).toBe(true);
  });

  it('clears transcript on start', () => {
    const { start, fireResult, fireEnd, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'old text', isFinal: true }]);
    fireEnd();
    // start again
    start();
    expect(getState().transcript).toBe('');
  });

  it('clears interimTranscript on start', () => {
    const { start, getState } = makeVoiceLogic(true);
    start();
    expect(getState().interimTranscript).toBe('');
  });

  it('does nothing when isSupported is false', () => {
    const { start, getState } = makeVoiceLogic(false);
    start();
    expect(getState().isRecording).toBe(false);
  });
});

describe('useVoiceInput — onresult', () => {
  it('accumulates final transcript segments', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'Hello ', isFinal: true }]);
    fireResult([{ transcript: 'world', isFinal: true }]);
    expect(getState().transcript).toBe('Hello world');
  });

  it('exposes interim transcript live', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'testing', isFinal: false }]);
    expect(getState().interimTranscript).toBe('testing');
  });

  it('replaces interim with each new onresult call', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'first', isFinal: false }]);
    fireResult([{ transcript: 'second', isFinal: false }]);
    expect(getState().interimTranscript).toBe('second');
  });

  it('clears interim when a final result arrives', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'hello ', isFinal: true }]);
    // interim should be cleared since no non-final in that event
    expect(getState().interimTranscript).toBe('');
  });

  it('handles mixed final + interim in one event', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([
      { transcript: 'final part ', isFinal: true },
      { transcript: 'interim part', isFinal: false },
    ]);
    expect(getState().transcript).toBe('final part ');
    expect(getState().interimTranscript).toBe('interim part');
  });

  it('concatenates multiple final segments from separate events', () => {
    const { start, fireResult, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'one ', isFinal: true }]);
    fireResult([{ transcript: 'two ', isFinal: true }]);
    fireResult([{ transcript: 'three', isFinal: true }]);
    expect(getState().transcript).toBe('one two three');
  });
});

describe('useVoiceInput — onend', () => {
  it('sets isRecording to false', () => {
    const { start, fireEnd, getState } = makeVoiceLogic(true);
    start();
    fireEnd();
    expect(getState().isRecording).toBe(false);
  });

  it('clears interimTranscript on end', () => {
    const { start, fireResult, fireEnd, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'partial', isFinal: false }]);
    fireEnd();
    expect(getState().interimTranscript).toBe('');
  });

  it('preserves final transcript on end', () => {
    const { start, fireResult, fireEnd, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'keep this', isFinal: true }]);
    fireEnd();
    expect(getState().transcript).toBe('keep this');
  });
});

describe('useVoiceInput — onerror', () => {
  it('sets isRecording to false on error', () => {
    const { start, fireError, getState } = makeVoiceLogic(true);
    start();
    fireError('aborted');
    expect(getState().isRecording).toBe(false);
  });

  it('clears interimTranscript on error', () => {
    const { start, fireResult, fireError, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'partial', isFinal: false }]);
    fireError('network');
    expect(getState().interimTranscript).toBe('');
  });

  it('signals that no-speech errors are silently handled', () => {
    const { start, fireError } = makeVoiceLogic(true);
    start();
    const silent = fireError('no-speech');
    expect(silent).toBe(true);
  });

  it('signals that other errors are not silently handled', () => {
    const { start, fireError } = makeVoiceLogic(true);
    start();
    const silent = fireError('aborted');
    expect(silent).toBe(false);
  });
});

describe('useVoiceInput — stop()', () => {
  it('sets isRecording to false', () => {
    const { start, stop, getState } = makeVoiceLogic(true);
    start();
    stop();
    expect(getState().isRecording).toBe(false);
  });

  it('returns the accumulated final transcript trimmed', () => {
    const { start, fireResult, stop } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: '  run drill   ', isFinal: true }]);
    const result = stop();
    expect(result).toBe('run drill');
  });

  it('clears interimTranscript on stop', () => {
    const { start, fireResult, stop, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'partial', isFinal: false }]);
    stop();
    expect(getState().interimTranscript).toBe('');
  });

  it('returns empty string when nothing was recorded', () => {
    const { start, stop } = makeVoiceLogic(true);
    start();
    const result = stop();
    expect(result).toBe('');
  });

  it('returns full multi-segment transcript', () => {
    const { start, fireResult, stop } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'show ', isFinal: true }]);
    fireResult([{ transcript: 'me ', isFinal: true }]);
    fireResult([{ transcript: 'the drills', isFinal: true }]);
    const result = stop();
    expect(result).toBe('show me the drills');
  });
});

describe('useVoiceInput — reset()', () => {
  it('clears transcript', () => {
    const { start, fireResult, reset, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'some text', isFinal: true }]);
    reset();
    expect(getState().transcript).toBe('');
  });

  it('clears interimTranscript', () => {
    const { start, fireResult, reset, getState } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'partial', isFinal: false }]);
    reset();
    expect(getState().interimTranscript).toBe('');
  });

  it('sets isRecording to false', () => {
    const { start, reset, getState } = makeVoiceLogic(true);
    start();
    reset();
    expect(getState().isRecording).toBe(false);
  });

  it('allows a fresh start after reset', () => {
    const { start, fireResult, stop, reset } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'old session', isFinal: true }]);
    stop();
    reset();
    start();
    const result = stop();
    expect(result).toBe('');
  });
});

describe('useVoiceInput — displayValue (textarea content)', () => {
  it('shows existing input value when not recording', () => {
    const { getState, displayValue } = makeVoiceLogic(true);
    expect(getState().isRecording).toBe(false);
    expect(displayValue('my typed text')).toBe('my typed text');
  });

  it('shows interim transcript when recording and input is empty', () => {
    const { start, fireResult, displayValue } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'hello coach', isFinal: false }]);
    expect(displayValue('')).toBe('hello coach');
  });

  it('appends interim transcript with space when input is non-empty', () => {
    const { start, fireResult, displayValue } = makeVoiceLogic(true);
    start();
    fireResult([{ transcript: 'focus on defense', isFinal: false }]);
    expect(displayValue('existing text')).toBe('existing text focus on defense');
  });

  it('shows only input value when recording but no interim yet', () => {
    const { start, displayValue } = makeVoiceLogic(true);
    start();
    expect(displayValue('what I typed')).toBe('what I typed');
  });
});
