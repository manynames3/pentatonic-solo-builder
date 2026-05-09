import { describe, expect, it } from "vitest";
import { extractChordProgression, generateSolo } from "./solo";

describe("extractChordProgression", () => {
  it("extracts common lead sheet chord symbols in order", () => {
    expect(extractChordProgression("| Cmaj7 | Am7 D7 | Gm7 C7 | Fmaj7 |")).toEqual([
      "Cmaj7",
      "Am7",
      "D7",
      "Gm7",
      "C7",
      "Fmaj7"
    ]);
  });

  it("ignores prose-heavy lines without chord density", () => {
    expect(extractChordProgression("A melody starts softly\n| Dm7 | G7 | Cmaj7 |")).toEqual([
      "Dm7",
      "G7",
      "Cmaj7"
    ]);
  });
});

describe("generateSolo", () => {
  it("returns deterministic playable phrases and tab", () => {
    const result = generateSolo({
      leadSheetText: "| Dm7 | G7 | Cmaj7 | A7alt |",
      options: {
        style: "melodic-pentatonic",
        feel: "swing",
        range: "mid",
        choruses: 1,
        tempo: 144
      }
    });

    expect(result.chords).toEqual(["Dm7", "G7", "Cmaj7", "A7alt"]);
    expect(result.phrases).toHaveLength(4);
    expect(result.fullTab).toContain("Chorus 1, change 1");
    expect(result.phrases[0].notes.every((note) => note.fret >= 0 && note.fret <= 17)).toBe(true);
  });

  it("keeps selected minor pentatonic phrases inside the key box with singable motion", () => {
    const result = generateSolo({
      leadSheetText: "| Am7 | D7 | G | E7 |",
      options: {
        key: "A",
        style: "minor-pentatonic",
        feel: "straight",
        range: "mid",
        choruses: 1,
        tempo: 116
      }
    });
    const aMinorPentatonic = new Set([9, 0, 2, 4, 7]);
    const midiLine = result.phrases.flatMap((phrase) => phrase.notes.map((note) => note.midi));
    const largestLeap = Math.max(...midiLine.slice(1).map((midi, index) => Math.abs(midi - midiLine[index])));

    expect(midiLine.every((midi) => aMinorPentatonic.has(midi % 12))).toBe(true);
    expect(largestLeap).toBeLessThanOrEqual(7);
    expect(result.title).toContain("Minor Pentatonic");
  });
});
