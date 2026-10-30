// chalk-talk ships plain ES modules (github:mutaaf/chalk-talk); this is the slice CourtIQ uses.
declare module 'chalk-talk' {
  export interface ChalkTalkOptions {
    sport?: string;
    sports?: string[];
    play?: string;
    narrate?: boolean;
    fullscreen?: boolean;
    title?: boolean;
    glossary?: string;
    onLoad?: (play: unknown, sport: unknown) => void;
    onSport?: (id: string) => void;
  }
  export interface ChalkTalkBoard {
    destroy(): void;
    setSport(id: string): void;
    heard(text: string): void;
    teach(key: string): void;
    readonly sport: string;
  }
  export function mount(el: HTMLElement, options?: ChalkTalkOptions): ChalkTalkBoard;
}
