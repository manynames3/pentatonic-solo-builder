import {
  Clipboard,
  Download,
  FileText,
  Guitar,
  Music2,
  Settings2,
  Upload,
  Wand2
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import {
  DEFAULT_OPTIONS,
  type GenerateSoloRequest,
  type NoteEvent,
  type SoloFeel,
  type SoloOptions,
  type SoloRange,
  type SoloResult,
  type SoloStyle,
  type UploadedLeadSheet
} from "./lib/solo";

const SAMPLE_LEAD_SHEET = `A minor melodic rock
| Am7 | D7 | Am7 | Am7 |
| Dm7 | G7 | Cmaj7 | E7 |
| Am7 | G | Fmaj7 | E7 |`;

const styles: Array<{ value: SoloStyle; label: string }> = [
  { value: "melodic-pentatonic", label: "Melodic" },
  { value: "minor-pentatonic", label: "Minor" },
  { value: "major-pentatonic", label: "Major" },
  { value: "blues-pentatonic", label: "Blues" },
  { value: "country-pentatonic", label: "Country" },
  { value: "soul-pentatonic", label: "Soul" }
];

const ranges: Array<{ value: SoloRange; label: string }> = [
  { value: "low", label: "Low" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" }
];

const feels: Array<{ value: SoloFeel; label: string }> = [
  { value: "swing", label: "Swing" },
  { value: "straight", label: "Straight" }
];

export function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leadSheetText, setLeadSheetText] = useState(SAMPLE_LEAD_SHEET);
  const [file, setFile] = useState<UploadedLeadSheet | undefined>();
  const [options, setOptions] = useState<SoloOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<SoloResult | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const visibleNotes = useMemo(() => result?.phrases.flatMap((phrase) => phrase.notes).slice(0, 20) ?? [], [result]);

  async function handleFile(fileToRead: File) {
    setError(undefined);
    const isTextLike =
      fileToRead.type.startsWith("text/") ||
      fileToRead.name.endsWith(".xml") ||
      fileToRead.name.endsWith(".musicxml") ||
      fileToRead.name.endsWith(".pro") ||
      fileToRead.name.endsWith(".cho") ||
      fileToRead.name.endsWith(".chordpro");

    if (isTextLike) {
      const text = await fileToRead.text();
      setLeadSheetText(text);
      setFile({ name: fileToRead.name, type: fileToRead.type || "text/plain" });
      return;
    }

    const dataUrl = await readAsDataUrl(fileToRead);
    setFile({ name: fileToRead.name, type: fileToRead.type || "application/octet-stream", dataUrl });
    setLeadSheetText("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setError(undefined);
    setCopied(false);

    const payload: GenerateSoloRequest = {
      leadSheetText,
      file,
      options
    };

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as SoloResult | { error?: string };

      if (!response.ok) {
        const errorBody = body as { error?: string };
        throw new Error(errorBody.error ?? "Generation failed.");
      }

      setResult(body as SoloResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyTab() {
    if (!result) return;
    await navigator.clipboard.writeText(result.fullTab);
    setCopied(true);
  }

  function downloadTab() {
    if (!result) return;
    const blob = new Blob([`${result.title}\n\n${result.fullTab}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Guitar size={22} />
          </span>
          <div>
            <h1>Pentatonic Solo Builder</h1>
            <p>Melodic guitar phrases from a lead sheet</p>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={() => setLeadSheetText(SAMPLE_LEAD_SHEET)}>
          <FileText size={18} />
          Sample
        </button>
      </header>

      <form className="workspace" onSubmit={handleSubmit}>
        <section className="input-panel" aria-label="Lead sheet input">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Input</span>
              <h2>Changes or lead sheet</h2>
            </div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".txt,.pro,.cho,.chordpro,.xml,.musicxml,.pdf,image/*"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];
                if (selectedFile) void handleFile(selectedFile);
              }}
            />
            <button className="icon-button" type="button" title="Upload" onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} />
            </button>
          </div>

          <textarea
            value={leadSheetText}
            onChange={(event) => setLeadSheetText(event.target.value)}
            spellCheck={false}
            placeholder="| Am7 | D7 | Am7 | E7 |"
          />

          <div className="file-row">
            <Music2 size={16} />
            <span>{file?.name ?? "Text lead sheet"}</span>
          </div>
        </section>

        <section className="control-panel" aria-label="Phrase settings">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Output</span>
              <h2>Phrase settings</h2>
            </div>
            <Settings2 size={19} />
          </div>

          <label className="field">
            <span>Pentatonic sound</span>
            <select
              value={options.style}
              onChange={(event) => setOptions((current) => ({ ...current, style: event.target.value as SoloStyle }))}
            >
              {styles.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Feel</span>
            <div className="segmented">
              {feels.map((feel) => (
                <button
                  key={feel.value}
                  type="button"
                  className={options.feel === feel.value ? "active" : ""}
                  onClick={() => setOptions((current) => ({ ...current, feel: feel.value }))}
                >
                  {feel.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Range</span>
            <div className="segmented">
              {ranges.map((range) => (
                <button
                  key={range.value}
                  type="button"
                  className={options.range === range.value ? "active" : ""}
                  onClick={() => setOptions((current) => ({ ...current, range: range.value }))}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="split-fields">
            <label className="field">
              <span>Key</span>
              <input
                value={options.key ?? ""}
                placeholder="Auto"
                onChange={(event) => setOptions((current) => ({ ...current, key: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>BPM</span>
              <input
                type="number"
                min={50}
                max={260}
                value={options.tempo ?? DEFAULT_OPTIONS.tempo}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, tempo: Number.parseInt(event.target.value, 10) || 120 }))
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Choruses</span>
            <input
              type="range"
              min={1}
              max={4}
              value={options.choruses}
              onChange={(event) =>
                setOptions((current) => ({ ...current, choruses: Number.parseInt(event.target.value, 10) }))
              }
            />
            <strong>{options.choruses}</strong>
          </label>

          <button className="primary-button" type="submit" disabled={isGenerating}>
            <Wand2 size={18} />
            {isGenerating ? "Building" : "Build solo"}
          </button>

          {error ? <p className="status error">{error}</p> : null}
        </section>
      </form>

      <section className="result-panel" aria-label="Generated solo">
        {result ? (
          <>
            <div className="result-heading">
              <div>
                <span className="eyebrow">{result.source === "aws" ? "AWS" : "Local"}</span>
                <h2>{result.title}</h2>
                <p>
                  {result.tempo} BPM, {result.feel}, {result.phrases.length} changes
                </p>
              </div>
              <div className="result-actions">
                <button className="icon-button text-button" type="button" onClick={copyTab} title="Copy tab">
                  <Clipboard size={18} />
                  {copied ? "Copied" : "Copy"}
                </button>
                <button className="icon-button text-button" type="button" onClick={downloadTab} title="Download tab">
                  <Download size={18} />
                  TXT
                </button>
              </div>
            </div>

            <div className="chord-strip">
              {result.chords.map((chord, index) => (
                <span key={`${chord}-${index}`}>{chord}</span>
              ))}
            </div>

            <Fretboard notes={visibleNotes} />

            <div className="phrase-grid">
              {result.phrases.slice(0, 8).map((phrase) => (
                <article className="phrase-card" key={`${phrase.chorus}-${phrase.bar}-${phrase.chord}`}>
                  <div>
                    <span>Chorus {phrase.chorus}</span>
                    <h3>
                      Change {phrase.bar}: {phrase.chord}
                    </h3>
                  </div>
                  <p>{phrase.line}</p>
                  <small>{phrase.target}</small>
                  <pre>{phrase.tab}</pre>
                </article>
              ))}
            </div>

            {result.warnings.length > 0 ? (
              <div className="warnings">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <Guitar size={42} />
            <h2>No solo yet</h2>
            <p>Upload or paste changes, then build a melodic phrase set.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function Fretboard({ notes }: { notes: NoteEvent[] }) {
  const markers = notes.map((note, index) => ({
    ...note,
    index,
    gridColumn: Math.min(note.fret + 1, 13),
    gridRow: note.string
  }));

  return (
    <div className="fretboard" aria-label="Fretboard map">
      <div className="nut" />
      {Array.from({ length: 6 }).map((_, stringIndex) => (
        <div className="string-line" style={{ gridRow: stringIndex + 1 }} key={`string-${stringIndex}`} />
      ))}
      {Array.from({ length: 13 }).map((_, fretIndex) => (
        <div className="fret-line" style={{ gridColumn: fretIndex + 1 }} key={`fret-${fretIndex}`} />
      ))}
      {markers.map((marker) => (
        <span
          className="note-marker"
          style={{ gridColumn: marker.gridColumn, gridRow: marker.gridRow }}
          key={`${marker.midi}-${marker.index}`}
          title={`${marker.note} string ${marker.string}, fret ${marker.fret}`}
        >
          {marker.note.replace(/\d/g, "")}
        </span>
      ))}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}
