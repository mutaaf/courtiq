// chalk-talk ships plain ES modules (github:mutaaf/chalk-talk); this is the slice CourtIQ uses.
declare module 'chalk-talk' {
  export interface ChalkTalkOptions {
    /** Names are stored per team, on this device only. */
    team?: string;
    /** Free open-model API base (defaults to digitalcraftai.com). */
    api?: string;
    sport?: string;
    sports?: string[];
    play?: string;
    narrate?: boolean;
    fullscreen?: boolean;
    title?: boolean;
    glossary?: string;
    onLoad?: (play: unknown, sport: unknown) => void;
    onSport?: (id: string) => void;
    /** Set false to skip the first-run tour and first-sketch walkthrough. */
    tour?: boolean;
    /** Anonymous, cookieless usage counts to Chalk Talk's API (default on); false turns them off. */
    analytics?: boolean;
    /** The host's AI subscription, offered when the AI isn't connected. */
    upgrade?: { label?: string; note?: string; href?: string; onClick?: () => void } | null;
  }
  export interface ChalkTalkBoard {
    destroy(): void;
    setSport(id: string): void;
    heard(text: string): void;
    teach(key: string): void;
    /** The positions guide, the film room (optionally on one player), the IQ game, stats, presenter mode. */
    guide(start?: { tab?: 'positions' | 'play' | 'sideline'; pos?: number }): void;
    film(id?: string): void;
    iq(): void;
    stats(): void;
    present(on?: boolean): void;
    readonly sport: string;
  }
  export function mount(el: HTMLElement, options?: ChalkTalkOptions): ChalkTalkBoard;
}

// The server side: the same requests the free API runs, for CourtIQ's own AI route.
declare module 'chalk-talk/server' {
  export interface ChalkTalkRequest {
    sys: string;
    schema: object;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    check: (raw: unknown) => { ok: boolean; errors: string[] };
  }
  export const TASKS: string[];
  export const LITE: { play: boolean; smart: boolean; brain: boolean; tutor: boolean; analyst: boolean };
  export function requestFor(task: string, body: unknown): ChalkTalkRequest;
  export function solve(
    req: ChalkTalkRequest,
    ask: (sys: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, schema: object) => Promise<string>
  ): Promise<any>;
}

declare module 'chalk-talk/sports' {
  export function getSport(id: string): { id: string; name: string; plays: Array<{ key: string; title: string; [k: string]: unknown }>; [k: string]: unknown };
  export function sports(): Array<{ id: string; name: string }>;
}
