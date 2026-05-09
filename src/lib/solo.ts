export type SoloStyle =
  | "melodic-pentatonic"
  | "minor-pentatonic"
  | "major-pentatonic"
  | "blues-pentatonic"
  | "country-pentatonic"
  | "soul-pentatonic"
  | "bebop"
  | "blues-rock"
  | "country"
  | "fusion"
  | "modern-jazz"
  | "neo-soul";

export type SoloFeel = "straight" | "swing";
export type SoloRange = "low" | "mid" | "high";

export interface UploadedLeadSheet {
  name: string;
  type: string;
  dataUrl?: string;
}

export interface SoloOptions {
  key?: string;
  tempo?: number;
  choruses: number;
  style: SoloStyle;
  feel: SoloFeel;
  range: SoloRange;
}

export interface GenerateSoloRequest {
  leadSheetText?: string;
  file?: UploadedLeadSheet;
  options: SoloOptions;
}

export interface NoteEvent {
  beat: string;
  chord: string;
  note: string;
  midi: number;
  string: number;
  fret: number;
  duration: string;
  technique?: string;
}

export interface SoloPhrase {
  chorus: number;
  bar: number;
  chord: string;
  target: string;
  tab: string;
  notes: NoteEvent[];
  line: string;
}

export interface SoloResult {
  title: string;
  detectedKey: string;
  feel: SoloFeel;
  tempo: number;
  style: SoloStyle;
  chords: string[];
  form: string;
  phrases: SoloPhrase[];
  fullTab: string;
  practiceNotes: string[];
  warnings: string[];
  source: "local" | "aws";
}

type ChordQuality =
  | "major"
  | "minor"
  | "dominant"
  | "diminished"
  | "half-diminished"
  | "suspended";

interface ChordDescriptor {
  symbol: string;
  root: string;
  rootPc: number;
  quality: ChordQuality;
  chordTones: number[];
  scale: number[];
}

interface FretPosition {
  string: number;
  fret: number;
}

const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

const PC_TO_NOTE_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
];

const CHORD_RE =
  /^[A-G](?:#|b)?(?:(?:maj|min|m|dim|aug|sus|add|alt|no)?[0-9#b+\-]*(?:maj|min|dim|aug|sus|add|alt)?[0-9#b+\-]*)?(?:\/[A-G](?:#|b)?)?$/i;

const STRING_TUNINGS = [64, 59, 55, 50, 45, 40];
const STRING_NAMES = ["e", "B", "G", "D", "A", "E"];
const DEFAULT_TEMPO = 132;

export const DEFAULT_OPTIONS: SoloOptions = {
  choruses: 1,
  style: "melodic-pentatonic",
  feel: "swing",
  range: "mid",
  tempo: DEFAULT_TEMPO
};

export function generateSolo(request: GenerateSoloRequest): SoloResult {
  const options = normalizeOptions(request.options);
  const warnings: string[] = [];
  const sourceText = request.leadSheetText?.trim() ?? "";

  if (!sourceText && request.file?.dataUrl) {
    warnings.push(
      "Binary lead sheets need the optional AWS parser endpoint. Paste chord text or upload a text-based lead sheet for local generation."
    );
  }

  const chords = extractChordProgression(sourceText);
  const progression = chords.length > 0 ? chords : ["Cmaj7", "Am7", "Dm7", "G7"];

  if (chords.length === 0) {
    warnings.push("No chord symbols were detected, so a C major turnaround was used.");
  }

  const detectedKey = normalizeKey(options.key) ?? inferKey(progression);
  const keyPc = keyToPitchClass(detectedKey) ?? describeChord(progression[0]).rootPc;
  const seed = hashString(`${sourceText}|${progression.join("|")}|${JSON.stringify(options)}`);
  const random = mulberry32(seed);

  const phrases: SoloPhrase[] = [];
  const chorusCount = clamp(Math.round(options.choruses), 1, 4);
  const described = progression.map(describeChord);

  for (let chorus = 1; chorus <= chorusCount; chorus += 1) {
    described.forEach((chord, index) => {
      const nextChord = described[(index + 1) % described.length];
      phrases.push(createPhrase(chord, nextChord, keyPc, index + 1, chorus, options, random));
    });
  }

  const fullTab = phrases
    .map((phrase) => `Chorus ${phrase.chorus}, change ${phrase.bar} - ${phrase.chord}\n${phrase.tab}`)
    .join("\n\n");

  return {
    title: createTitle(detectedKey, options.style),
    detectedKey,
    feel: options.feel,
    tempo: options.tempo ?? DEFAULT_TEMPO,
    style: options.style,
    chords: progression,
    form: formatForm(progression),
    phrases,
    fullTab,
    practiceNotes: buildPracticeNotes(options, progression),
    warnings,
    source: "local"
  };
}

export function extractChordProgression(text: string): string[] {
  if (!text.trim()) return [];

  const chords: string[] = [];
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const tokens = line
      .replace(/[|:]/g, " ")
      .split(/\s+/)
      .map(cleanChordToken)
      .filter(Boolean);

    const candidates = tokens.filter(isChordSymbol);
    const chordDensity = tokens.length === 0 ? 0 : candidates.length / tokens.length;

    if (line.includes("|") || candidates.length >= 2 || chordDensity >= 0.45) {
      chords.push(...candidates.map(canonicalizeChord));
    }
  }

  return chords.slice(0, 64);
}

function normalizeOptions(options: Partial<SoloOptions> | undefined): SoloOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    tempo: clamp(Math.round(options?.tempo ?? DEFAULT_TEMPO), 50, 260),
    choruses: clamp(Math.round(options?.choruses ?? DEFAULT_OPTIONS.choruses), 1, 4)
  };
}

function cleanChordToken(token: string): string {
  return token
    .trim()
    .replace(/^[([{]+/, "")
    .replace(/[)\]},.;]+$/, "")
    .replace(/x\d+$/i, "");
}

function isChordSymbol(token: string): boolean {
  if (!CHORD_RE.test(token)) return false;
  const root = token.match(/^[A-G](?:#|b)?/i)?.[0];
  return Boolean(root && NOTE_TO_PC[capitalizeNote(root)] !== undefined);
}

function canonicalizeChord(token: string): string {
  const root = token.match(/^[A-G](?:#|b)?/i)?.[0] ?? "C";
  return `${capitalizeNote(root)}${token.slice(root.length)}`;
}

function capitalizeNote(note: string): string {
  return `${note.charAt(0).toUpperCase()}${note.slice(1)}`;
}

function normalizeKey(key: string | undefined): string | undefined {
  if (!key?.trim()) return undefined;
  const cleaned = cleanChordToken(key.trim());
  const root = cleaned.match(/^[A-G](?:#|b)?/i)?.[0];
  if (!root) return undefined;
  return capitalizeNote(root);
}

function keyToPitchClass(key: string): number | undefined {
  const root = key.match(/^[A-G](?:#|b)?/i)?.[0];
  return root ? NOTE_TO_PC[capitalizeNote(root)] : undefined;
}

function inferKey(chords: string[]): string {
  const last = describeChord(chords[chords.length - 1]);
  if (last.quality === "major" || last.quality === "minor") {
    return last.root;
  }

  const first = describeChord(chords[0]);
  if (first.quality === "major" || first.quality === "minor") {
    return first.root;
  }

  return PC_TO_NOTE_SHARP[(last.rootPc + 5) % 12];
}

function describeChord(symbol: string): ChordDescriptor {
  const root = symbol.match(/^[A-G](?:#|b)?/i)?.[0] ?? "C";
  const rootName = capitalizeNote(root);
  const rootPc = NOTE_TO_PC[rootName] ?? 0;
  const quality = getChordQuality(symbol.slice(root.length));
  const intervals = getIntervals(quality);

  return {
    symbol,
    root: rootName,
    rootPc,
    quality,
    chordTones: intervals.chordTones.map((interval) => (rootPc + interval) % 12),
    scale: intervals.scale.map((interval) => (rootPc + interval) % 12)
  };
}

function getChordQuality(suffix: string): ChordQuality {
  const lower = suffix.toLowerCase();
  if (lower.includes("m7b5") || lower.includes("min7b5")) return "half-diminished";
  if (lower.includes("dim")) return "diminished";
  if (lower.includes("sus")) return "suspended";
  if (lower.includes("maj")) return "major";
  if ((lower.includes("m") || lower.includes("min")) && !lower.includes("maj")) return "minor";
  if (lower.includes("7") || lower.includes("9") || lower.includes("13") || lower.includes("alt")) {
    return "dominant";
  }
  return "major";
}

function getIntervals(quality: ChordQuality): { chordTones: number[]; scale: number[] } {
  switch (quality) {
    case "minor":
      return { chordTones: [0, 3, 7, 10], scale: [0, 2, 3, 5, 7, 9, 10] };
    case "dominant":
      return { chordTones: [0, 4, 7, 10], scale: [0, 2, 4, 5, 7, 9, 10] };
    case "diminished":
      return { chordTones: [0, 3, 6, 9], scale: [0, 2, 3, 5, 6, 8, 9, 11] };
    case "half-diminished":
      return { chordTones: [0, 3, 6, 10], scale: [0, 1, 3, 5, 6, 8, 10] };
    case "suspended":
      return { chordTones: [0, 5, 7, 10], scale: [0, 2, 5, 7, 9, 10] };
    case "major":
    default:
      return { chordTones: [0, 4, 7, 11], scale: [0, 2, 4, 5, 7, 9, 11] };
  }
}

function createPhrase(
  chord: ChordDescriptor,
  nextChord: ChordDescriptor,
  keyPc: number,
  bar: number,
  chorus: number,
  options: SoloOptions,
  random: () => number
): SoloPhrase {
  const minMax = rangeBounds(options.range);
  const phraseMidi = buildMelodicLine(chord, nextChord, keyPc, bar, chorus, options, minMax, random);

  const notes = phraseMidi.map((midi, index) => {
    const fretPosition = findFretPosition(midi, options.range);
    const technique = techniqueFor(options.style, index, phraseMidi.length - 1, random);

    return {
      beat: eighthBeatLabel(index),
      chord: chord.symbol,
      note: midiToName(midi),
      midi,
      string: fretPosition.string,
      fret: fretPosition.fret,
      duration: durationFor(index, phraseMidi.length, options.feel),
      ...(technique ? { technique } : {})
    };
  });

  return {
    chorus,
    bar,
    chord: chord.symbol,
    target: describeTarget(chord, nextChord, notes[notes.length - 1]?.midi ?? minMax.target, options.style),
    notes,
    tab: renderTab(notes),
    line: notes.map((note) => `${note.note}${note.technique ? ` ${note.technique}` : ""}`).join(" - ")
  };
}

function buildMelodicLine(
  chord: ChordDescriptor,
  nextChord: ChordDescriptor,
  keyPc: number,
  bar: number,
  chorus: number,
  options: SoloOptions,
  bounds: { min: number; max: number; target: number },
  random: () => number
): number[] {
  const currentPcs = styleScale(chord, options.style, keyPc);
  const nextPcs = styleScale(nextChord, options.style, keyPc);
  const pool = midiPool(currentPcs, bounds.min, bounds.max);
  const targetPc = targetPitchClass(chord, currentPcs);
  const resolutionPc = resolutionPitchClass(nextChord, currentPcs, nextPcs);
  const rangeBias = chorus > 1 ? Math.min(5, chorus * 2) : 0;
  const anchorMidi = nearestMidiForPitchClass(targetPc, bounds.target + rangeBias, bounds.min, bounds.max);
  const anchorIndex = nearestPoolIndex(pool, anchorMidi);
  const shape = motifShape(options.style, bar, chorus, random);
  const phrase = shape.map((offset) => pool[clamp(anchorIndex + offset, 0, pool.length - 1)] ?? anchorMidi);
  const landingReference = phrase[phrase.length - 2] ?? anchorMidi;

  phrase[phrase.length - 1] = nearestMidiForPitchClass(
    resolutionPc,
    landingReference,
    bounds.min,
    bounds.max
  );

  if (chorus > 1 && phrase.length > 5 && random() > 0.48) {
    const liftIndex = Math.floor(phrase.length / 2);
    phrase[liftIndex] = pool[clamp(nearestPoolIndex(pool, phrase[liftIndex]) + 1, 0, pool.length - 1)] ?? phrase[liftIndex];
  }

  return smoothLargeLeaps(phrase, pool);
}

function styleScale(chord: ChordDescriptor, style: SoloStyle, keyPc = chord.rootPc): number[] {
  if (style === "melodic-pentatonic") {
    return chordAwarePentatonic(chord);
  }

  if (style === "minor-pentatonic") {
    return intervalsFrom(keyPc, [0, 3, 5, 7, 10]);
  }

  if (style === "major-pentatonic") {
    return intervalsFrom(keyPc, [0, 2, 4, 7, 9]);
  }

  if (style === "blues-pentatonic") {
    return intervalsFrom(keyPc, [0, 3, 5, 6, 7, 10]);
  }

  if (style === "country-pentatonic") {
    return intervalsFrom(keyPc, [0, 2, 3, 4, 7, 9]);
  }

  if (style === "soul-pentatonic") {
    return chord.quality === "minor" || chord.quality === "half-diminished"
      ? intervalsFrom(keyPc, [0, 3, 5, 7, 10])
      : intervalsFrom(keyPc, [0, 2, 4, 7, 9]);
  }

  if (style === "blues-rock") {
    const blues = [0, 3, 5, 6, 7, 10].map((interval) => (chord.rootPc + interval) % 12);
    return uniquePitchClasses([...chord.chordTones, ...blues]);
  }

  if (style === "country") {
    const majorPentatonic = [0, 2, 4, 7, 9].map((interval) => (chord.rootPc + interval) % 12);
    return uniquePitchClasses([...chord.chordTones, ...majorPentatonic]);
  }

  if (style === "bebop" && chord.quality === "dominant") {
    return uniquePitchClasses([...chord.scale, (chord.rootPc + 11) % 12]);
  }

  if (style === "neo-soul") {
    return uniquePitchClasses([...chord.scale, (chord.rootPc + 1) % 12, (chord.rootPc + 6) % 12]);
  }

  return chord.scale;
}

function chordAwarePentatonic(chord: ChordDescriptor): number[] {
  switch (chord.quality) {
    case "major":
      return intervalsFrom(chord.rootPc, [0, 2, 4, 7, 9]);
    case "dominant":
      return intervalsFrom(chord.rootPc, [0, 2, 4, 7, 10]);
    case "suspended":
      return intervalsFrom(chord.rootPc, [0, 2, 5, 7, 10]);
    case "half-diminished":
      return intervalsFrom(chord.rootPc + 3, [0, 3, 5, 7, 10]);
    case "diminished":
      return intervalsFrom(chord.rootPc, [0, 3, 5, 6, 10]);
    case "minor":
    default:
      return intervalsFrom(chord.rootPc, [0, 3, 5, 7, 10]);
  }
}

function intervalsFrom(rootPc: number, intervals: number[]): number[] {
  return uniquePitchClasses(intervals.map((interval) => rootPc + interval));
}

function midiPool(pitchClasses: number[], min: number, max: number): number[] {
  const allowed = new Set(pitchClasses.map(normalizePc));
  const pool: number[] = [];

  for (let midi = min; midi <= max; midi += 1) {
    if (allowed.has(normalizePc(midi))) {
      pool.push(midi);
    }
  }

  return pool.length > 0 ? pool : [min];
}

function targetPitchClass(chord: ChordDescriptor, allowedPcs: number[]): number {
  const allowed = new Set(allowedPcs.map(normalizePc));
  const priority = chordTargetPriority(chord);
  return priority.find((pc) => allowed.has(pc)) ?? allowedPcs[0] ?? chord.rootPc;
}

function resolutionPitchClass(nextChord: ChordDescriptor, currentPcs: number[], nextPcs: number[]): number {
  const current = new Set(currentPcs.map(normalizePc));
  const nextTargets = chordTargetPriority(nextChord);
  const chordToneOverlap = nextTargets.find((pc) => current.has(pc));
  if (chordToneOverlap !== undefined) return chordToneOverlap;

  const pentatonicOverlap = nextPcs.find((pc) => current.has(pc));
  if (pentatonicOverlap !== undefined) return pentatonicOverlap;

  return currentPcs
    .slice()
    .sort((a, b) => pitchClassDistance(a, nextChord.rootPc) - pitchClassDistance(b, nextChord.rootPc))[0] ?? nextChord.rootPc;
}

function chordTargetPriority(chord: ChordDescriptor): number[] {
  switch (chord.quality) {
    case "major":
      return intervalsFrom(chord.rootPc, [4, 7, 9, 0]);
    case "minor":
      return intervalsFrom(chord.rootPc, [3, 7, 10, 0]);
    case "dominant":
      return intervalsFrom(chord.rootPc, [10, 4, 7, 0]);
    case "half-diminished":
      return intervalsFrom(chord.rootPc, [6, 3, 10, 0]);
    case "diminished":
      return intervalsFrom(chord.rootPc, [3, 6, 9, 0]);
    case "suspended":
      return intervalsFrom(chord.rootPc, [5, 10, 7, 0]);
  }

  return [chord.rootPc];
}

function nearestMidiForPitchClass(pc: number, referenceMidi: number, min: number, max: number): number {
  const candidates: number[] = [];

  for (let midi = min; midi <= max; midi += 1) {
    if (normalizePc(midi) === normalizePc(pc)) {
      candidates.push(midi);
    }
  }

  return candidates.sort((a, b) => Math.abs(a - referenceMidi) - Math.abs(b - referenceMidi))[0] ?? min;
}

function nearestPoolIndex(pool: number[], midi: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  pool.forEach((candidate, index) => {
    const distance = Math.abs(candidate - midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function motifShape(style: SoloStyle, bar: number, chorus: number, random: () => number): number[] {
  const isAnswer = bar % 2 === 0;
  const variation = chorus > 1 && random() > 0.5;

  if (style === "minor-pentatonic" || style === "blues-pentatonic" || style === "blues-rock") {
    return isAnswer
      ? [2, 1, 0, -1, -2, -1, 0]
      : variation
        ? [0, 2, 1, 0, -1, 0]
        : [0, 1, 2, 1, 0, -1, 0];
  }

  if (style === "major-pentatonic" || style === "country-pentatonic" || style === "country") {
    return isAnswer
      ? [1, 2, 3, 2, 1, 0, -1, 0]
      : variation
        ? [-1, 0, 1, 2, 1, 0]
        : [0, 1, 2, 3, 2, 1, 0];
  }

  if (style === "soul-pentatonic" || style === "neo-soul") {
    return isAnswer ? [1, 0, -1, 0, 1, 0] : [0, 0, 1, 2, 1, -1, 0];
  }

  return isAnswer
    ? [2, 1, 0, -1, -2, -1, 0]
    : variation
      ? [-1, 0, 1, 2, 1, 0]
      : [0, 1, 2, 1, 0, -1, 0];
}

function smoothLargeLeaps(phrase: number[], pool: number[]): number[] {
  return phrase.map((midi, index) => {
    if (index === 0) return midi;

    const previous = phrase[index - 1] ?? midi;
    if (Math.abs(midi - previous) <= 7) return midi;

    const direction = midi > previous ? 1 : -1;
    const previousIndex = nearestPoolIndex(pool, previous);
    return pool[clamp(previousIndex + direction, 0, pool.length - 1)] ?? midi;
  });
}

function pitchClassDistance(a: number, b: number): number {
  const distance = Math.abs(normalizePc(a) - normalizePc(b));
  return Math.min(distance, 12 - distance);
}

function uniquePitchClasses(pitchClasses: number[]): number[] {
  return [...new Set(pitchClasses.map((pc) => normalizePc(pc)))];
}

function choose<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function neighbor(pc: number, scale: number[], random: () => number): number {
  const direction = random() > 0.5 ? 1 : -1;
  const next = normalizePc(pc + direction);
  if (scale.includes(next)) return next;
  return choose(scale, random);
}

function approach(targetPc: number, random: () => number): number {
  return normalizePc(targetPc + (random() > 0.5 ? 1 : -1));
}

function midiForPitchClass(pc: number, previousMidi: number, min: number, max: number): number {
  const candidates: number[] = [];
  for (let midi = min; midi <= max; midi += 1) {
    if (midi % 12 === pc) candidates.push(midi);
  }

  return candidates.sort((a, b) => Math.abs(a - previousMidi) - Math.abs(b - previousMidi))[0] ?? min;
}

function findFretPosition(midi: number, range: SoloRange): FretPosition {
  const targetFret = range === "low" ? 4 : range === "mid" ? 7 : 10;
  const candidates: FretPosition[] = [];

  STRING_TUNINGS.forEach((openMidi, stringIndex) => {
    const fret = midi - openMidi;
    if (fret >= 0 && fret <= 17) {
      candidates.push({ string: stringIndex + 1, fret });
    }
  });

  return (
    candidates.sort((a, b) => Math.abs(a.fret - targetFret) - Math.abs(b.fret - targetFret))[0] ?? {
      string: 1,
      fret: Math.max(0, midi - STRING_TUNINGS[0])
    }
  );
}

function renderTab(notes: NoteEvent[]): string {
  const rows = STRING_NAMES.map((name) => `${name}|`);

  for (const note of notes) {
    const fret = String(note.fret);
    const width = Math.max(3, fret.length + 2);

    rows.forEach((_, rowIndex) => {
      if (rowIndex + 1 === note.string) {
        const left = "-";
        const right = "-".repeat(width - fret.length - 1);
        rows[rowIndex] += `${left}${fret}${right}`;
      } else {
        rows[rowIndex] += "-".repeat(width);
      }
    });
  }

  return rows.join("\n");
}

function rangeBounds(range: SoloRange): { min: number; max: number; target: number } {
  switch (range) {
    case "low":
      return { min: 47, max: 67, target: 55 };
    case "high":
      return { min: 60, max: 83, target: 72 };
    case "mid":
    default:
      return { min: 55, max: 76, target: 64 };
  }
}

function techniqueFor(style: SoloStyle, index: number, lastIndex: number, random: () => number): string | undefined {
  if (index === lastIndex && isPentatonicStyle(style) && random() > 0.2) return "vibrato";
  if (index === 0 || random() < 0.62) return undefined;

  const techniquesByStyle: Record<SoloStyle, string[]> = {
    "melodic-pentatonic": ["slide", "hammer-on", "vibrato"],
    "minor-pentatonic": ["bend", "pull-off", "vibrato"],
    "major-pentatonic": ["slide", "hammer-on", "sweet bend"],
    "blues-pentatonic": ["bend", "vibrato", "rake"],
    "country-pentatonic": ["pre-bend", "snap", "slide"],
    "soul-pentatonic": ["slide", "grace", "vibrato"],
    bebop: ["accent", "slide"],
    "blues-rock": ["bend", "vibrato", "slide"],
    country: ["slide", "pre-bend", "snap"],
    fusion: ["legato", "slide", "wide vibrato"],
    "modern-jazz": ["accent", "slide", "ghost"],
    "neo-soul": ["hammer-on", "slide", "grace"]
  };

  return choose(techniquesByStyle[style], random);
}

function isPentatonicStyle(style: SoloStyle): boolean {
  return style.endsWith("pentatonic");
}

function durationFor(index: number, total: number, feel: SoloFeel): string {
  if (index === total - 1 || index === Math.floor(total / 2)) return "quarter";
  return feel === "swing" ? "swung eighth" : "eighth";
}

function eighthBeatLabel(index: number): string {
  const labels = ["1", "and", "2", "and", "3", "and", "4", "and"];
  return labels[index] ?? "and";
}

function describeTarget(chord: ChordDescriptor, nextChord: ChordDescriptor, landingMidi: number, style: SoloStyle): string {
  const color = isPentatonicStyle(style) ? "pentatonic motif" : "phrase";
  return `${color} from ${chord.symbol}, lands on ${midiToName(landingMidi)} before ${nextChord.symbol}`;
}

function midiToName(midi: number): string {
  const pc = normalizePc(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${PC_TO_NOTE_SHARP[pc]}${octave}`;
}

function normalizePc(pc: number): number {
  return ((pc % 12) + 12) % 12;
}

function formatForm(chords: string[]): string {
  return chords.map((chord, index) => `${index + 1}. ${chord}`).join(" | ");
}

function createTitle(key: string, style: SoloStyle): string {
  const styleName = style
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${styleName} solo builder in ${key}`;
}

function buildPracticeNotes(options: SoloOptions, progression: string[]): string[] {
  const feelText = options.feel === "swing" ? "Keep the offbeats light and late." : "Keep eighth notes even.";
  return [
    `${feelText} Let the long notes ring at ${options.tempo ?? DEFAULT_OPTIONS.tempo} BPM before adding speed.`,
    `Loop the ${progression.length}-change form as call and response, not one continuous scale run.`,
    "Keep bends and slides on the landing notes; the short notes are there to point at the melody."
  ];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
