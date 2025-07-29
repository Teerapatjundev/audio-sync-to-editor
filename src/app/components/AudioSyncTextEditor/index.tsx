"use client";

import React, { Fragment, useRef, useState } from "react";
import { EditorTinyAudioSync } from "./EditorTinyAudioSync";
import { observer } from "mobx-react-lite";
import { CloseCircleOutlined, RedoOutlined } from "@ant-design/icons";
import { Select } from "antd";
import { set } from "mobx";

interface AudioSyncTextEditorProps {
  params: {
    variables?: any;
    heightEditor: number;
    contentEditor: string;
    setContentEditor: (content: string) => void;
    plainText: string;
    setPlainText: (content: string) => void;
    highlightedRanges: { start: number; end: number }[];
    setHighlightedRanges: React.Dispatch<
      React.SetStateAction<{ start: number; end: number }[]>
    >;
    textColor: string;
    textHighlight: string;
  };
}

interface StyledWord {
  word: string;
  style: string;
  offset: number;
}

type AudioRange = {
  start: number;
  end: number;
  audio: string;
  type: string;
};

const { Option } = Select;

const rateOptions = [
  { label: "0.5", value: 0.5 },
  { label: "0.75", value: 0.75 },
  { label: "ปกติ", value: 1 },
  { label: "1.25", value: 1.25 },
  { label: "1.5", value: 1.5 },
  { label: "1.75", value: 1.75 },
  { label: "2", value: 2 },
];

const rangeAudio = [
  {
    start: 0,
    end: 5,
    audio: "/assets/audio/h1.mp3",
    type: "audio",
  },
  {
    start: 6,
    end: 10,
    audio: "/assets/audio/h2.mp3",
    type: "audio",
  },
];

const AudioSyncTextEditor = (props: AudioSyncTextEditorProps) => {
  const [currentSpeakingIndex, setCurrentSpeakingIndex] = useState<
    number | null
  >(null);
  const [isSpeakingAllWord, setIsSpeakingAllWord] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const cleanedPlainText = props.params.plainText.replace(/\r\n/g, "\n");

  const handleChange = (value: number) => {
    setRate(value);
  };

  const detectLanguage = (word: string): string => {
    if (/[\u0E00-\u0E7F]/.test(word)) return "th-TH"; // Thai
    if (/[\u4E00-\u9FFF]/.test(word)) return "zh-CN"; // Chinese
    return "en-US"; // Default to English
  };

  const selectBestVoice = async (
    lang: string
  ): Promise<SpeechSynthesisVoice | null> => {
    const voices = await loadVoices();

    const filtered = voices.filter((v) => v.lang === lang);

    const knownFemaleNames = [
      "Google UK English Female",
      "Google US English Female",
      "Samantha",
      "Zira",
      "Eva",
      "Microsoft Eva Mobile",
    ];

    const priorityVoices = [
      (v: SpeechSynthesisVoice) => knownFemaleNames.includes(v.name),
      (v: SpeechSynthesisVoice) => /female/i.test(v.name),
      (v: SpeechSynthesisVoice) =>
        /(Samantha|Zira|Eva|Susan|Karen)/i.test(v.name),
      (v: SpeechSynthesisVoice) => /Google/.test(v.name),
      (v: SpeechSynthesisVoice) => true,
    ];

    for (const check of priorityVoices) {
      const match = filtered.find(check);
      if (match) return match;
    }

    return null;
  };

  const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
    return new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) {
        resolve(voices);
      } else {
        speechSynthesis.onvoiceschanged = () => {
          resolve(speechSynthesis.getVoices());
        };
      }
    });
  };

  const removeRange = (targetRange: { start: number; end: number }) => {
    props.params.setHighlightedRanges((prev) =>
      prev.filter(
        (r) => !(r.start === targetRange.start && r.end === targetRange.end)
      )
    );
  };

  const speakTextOnly = async (text: string) => {
    const lang = detectLanguage(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    const bestVoice = await selectBestVoice(lang);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    // const charRanges = getWordCharRanges(text);

    // utterance.onboundary = (event) => {
    //   if (event.name === "word") {
    //     const charIndex = event.charIndex;
    //     const wordIndex = charRanges.findIndex(
    //       ({ start, end }) => charIndex >= start && charIndex < end
    //     );
    //     if (wordIndex !== -1) {
    //       setCurrentSpeakingIndex(wordIndex);
    //     }
    //   }
    // };

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  console.log("t");

  const speakWithHighlight = async (
    ranges: { start: number; end: number }[],
    text: string
  ) => {
    const slicedParts = ranges.map(({ start, end }) => text.slice(start, end));
    const highlightedText = slicedParts.join(" ");

    const lang = detectLanguage(text);
    const utterance = new SpeechSynthesisUtterance(highlightedText);
    utterance.lang = lang;

    const bestVoice = await selectBestVoice(lang);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    setIsSpeakingAllWord(true);
    speechSynthesis.cancel();

    const isChinese = lang.startsWith("zh");

    const resetState = () => {
      setIsSpeakingAllWord(false);
      setCurrentSpeakingIndex(null);
    };

    utterance.onerror = resetState;
    utterance.onend = resetState;

    // CASE 1: Chinese (no onboundary support)
    if (isChinese) {
      const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
      const segments = Array.from(segmenter.segment(highlightedText));
      const totalWords = segments.length;

      // สร้าง map: แต่ละ segment อยู่ในช่วง range ไหน
      let rangeWordMap: number[] = [];
      slicedParts.forEach((part, rangeIndex) => {
        const len = Array.from(segmenter.segment(part)).length;
        for (let i = 0; i < len; i++) {
          rangeWordMap.push(rangeIndex);
        }
      });

      let wordIndex = 0;
      const interval = setInterval(() => {
        if (wordIndex >= totalWords) {
          clearInterval(interval);
          setCurrentSpeakingIndex(null);
          return;
        }
        const rangeIndex = rangeWordMap[wordIndex];
        if (rangeIndex !== undefined) {
          setCurrentSpeakingIndex(rangeIndex);
        }
        wordIndex++;
      }, 500);

      utterance.onend = () => {
        clearInterval(interval);
        resetState();
      };
      utterance.onerror = () => {
        clearInterval(interval);
        resetState();
      };

      speechSynthesis.speak(utterance);
      return;
    }

    // CASE 2: Non-Chinese — use onboundary
    let rangeCharMap: { start: number; end: number; index: number }[] = [];
    let runningIndex = 0;
    slicedParts.forEach((part, index) => {
      const start = runningIndex;
      const end = start + part.length;
      rangeCharMap.push({ start, end, index });
      runningIndex = end + 1; // space between
    });

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const charIndex = event.charIndex;
        const found = rangeCharMap.find(
          ({ start, end }) => charIndex >= start && charIndex < end
        );
        if (found) {
          setCurrentSpeakingIndex(found.index);
        }
      }
    };

    speechSynthesis.speak(utterance);
  };

  function getComputedInlineStyleFromAncestors(node: Node): string {
    const styleParts: string[] = [];

    let current: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;

    while (current) {
      // inline style from current node or ancestors
      if (current.hasAttribute("style")) {
        styleParts.push(current.getAttribute("style")!);
      }

      // tag-based styling
      const tag = current.tagName.toLowerCase();
      switch (tag) {
        case "b":
        case "strong":
          styleParts.push("font-weight: bold;");
          break;
        case "i":
        case "em":
          styleParts.push("font-style: italic;");
          break;
        case "u":
          styleParts.push("text-decoration: underline;");
          break;
      }

      current = current.parentElement;
    }

    return styleParts.reverse().join(" ");
  }

  function mapStyledWordsFromHtmlToPlainText(
    html: string,
    plainText: string
  ): StyledWord[] {
    if (typeof window === "undefined") return [];
    const container = document.createElement("div");
    container.innerHTML = html;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const styledWords: StyledWord[] = [];

    const plainChars = Array.from(plainText).filter((ch) => ch.trim() !== "");
    let usedIndices = new Set<number>();
    let searchOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.textContent?.trim()) continue;

      const nodeChars = Array.from(node.textContent).filter(
        (ch) => ch.trim() !== ""
      );

      for (const char of nodeChars) {
        const matchIndex = plainChars.findIndex(
          (c, i) => c === char && !usedIndices.has(i)
        );
        if (matchIndex !== -1) {
          usedIndices.add(matchIndex);

          const style = getComputedInlineStyleFromAncestors(node);

          const offset = plainText.indexOf(char, searchOffset);
          styledWords.push({ word: char, style, offset });

          searchOffset = offset + char.length;
        }
      }
    }

    return styledWords;
  }

  function renderFullyStyledText({
    plainText,
    highlightedRanges,
    styledWords,
    textHighlight,
    textColor,
    speakTextOnly,
    currentSpeakingIndex,
  }: {
    plainText: string;
    highlightedRanges: { start: number; end: number }[];
    styledWords: { word: string; offset: number; style: string }[];
    textHighlight: string;
    textColor: string;
    speakTextOnly: (text: string) => void;
    currentSpeakingIndex: number | null;
  }): React.ReactNode[] {
    const parts: React.ReactNode[] = [];

    const styledMap = new Map<number, string>();
    styledWords.forEach((w) => styledMap.set(w.offset, w.style));

    const ranges = [...highlightedRanges].sort((a, b) => a.start - b.start);
    let current = 0;

    ranges.forEach((range, index) => {
      if (current < range.start) {
        const normalText = plainText?.slice(current, range.start);
        parts.push(
          <span key={`text-${current}`}>
            {renderStyledSegment(normalText, current, styledMap)}
          </span>
        );
      }

      const highlightText = plainText?.slice(range.start, range.end);
      const style = parseInlineStyle(styledMap.get(range.start));
      const isSpeakingCurrentWord = index === currentSpeakingIndex;
      if (style && "color" in style) {
        delete style.color;
      }
      if (style && "backgroundColor" in style) {
        delete style.backgroundColor;
      }

      {
        isSpeakingAllWord
          ? parts.push(
              <span
                key={`highlight-${range.start}`}
                onClick={() => {
                  if (isSpeakingAllWord) return;
                  // speakTextOnly(highlightText);
                  // setIsSpeakingOnlyAudio(true);
                  speakOnlyAudio(index);
                }}
                style={{
                  backgroundColor: isSpeakingCurrentWord
                    ? textHighlight
                    : "transparent",
                  cursor: isSpeakingAllWord ? "not-allowed" : "pointer",
                  padding: "2px",
                  borderRadius: "3px",
                  ...style,
                  color: textColor,
                }}
              >
                {renderStyledSegment(highlightText, current, styledMap)}🔊5
              </span>
            )
          : parts.push(
              <Fragment key={`highlight-${range.start}`}>
                <span
                  onClick={() => {
                    if (isSpeakingAllWord) return;
                    speakTextOnly(highlightText);
                    // setIsSpeakingOnlyAudio(true);
                    // speakOnlyAudio(index);
                  }}
                  style={{
                    backgroundColor: textHighlight,
                    color: textColor,
                    cursor: isSpeakingAllWord ? "not-allowed" : "pointer",
                    padding: "2px",
                    borderTopLeftRadius: "3px",
                    borderBottomLeftRadius: "3px",
                    ...style,
                  }}
                >
                  {/* {highlightText}🔊 */}
                  {renderStyledSegment(highlightText, current, styledMap)}🔊
                </span>
                {highlightText.length > 0 && (
                  <span
                    style={{
                      backgroundColor: textHighlight,
                      color: textColor,
                      cursor: isSpeakingAllWord ? "not-allowed" : "pointer",
                      padding: "2px",
                      borderTopRightRadius: "3px",
                      borderBottomRightRadius: "3px",
                      ...style,
                    }}
                    onClick={() => {
                      stopSpeaking();
                      removeRange(range);
                    }}
                  >
                    <CloseCircleOutlined />
                  </span>
                )}
              </Fragment>
            );
      }

      current = range.end;
    });

    if (current < plainText.length) {
      const tail = plainText?.slice(current);
      parts.push(
        <span key={`tail-${current}`}>
          {renderStyledSegment(tail, current, styledMap)}
        </span>
      );
    }

    return parts;
  }

  function renderStyledSegment(
    text: string,
    offsetStart: number,
    styledMap: Map<number, string>
  ): React.ReactNode[] {
    const words = text.split(/(\s+)/);
    const result: React.ReactNode[] = [];
    let currentOffset = offsetStart;

    words.forEach((w, i) => {
      if (w.trim() === "") {
        result.push(<span key={`space-${i}`}>{w}</span>);
        currentOffset += w.length;
        return;
      }

      const style = parseInlineStyle(styledMap.get(currentOffset));

      result.push(
        <span key={`styled-${currentOffset}`} style={style}>
          {w}
        </span>
      );
      currentOffset += w.length;
    });

    return result;
  }

  function parseInlineStyle(styleString?: string): React.CSSProperties {
    if (!styleString) return {};

    const styleObj = styleString.split(";").reduce((acc, item) => {
      const [key, value] = item.split(":").map((s) => s?.trim());
      if (key && value) {
        const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        (acc as any)[camelKey] = value;
      }
      return acc;
    }, {} as Record<string, string>);
    return styleObj as React.CSSProperties;
  }

  const styledWords = mapStyledWordsFromHtmlToPlainText(
    props.params.contentEditor,
    cleanedPlainText
  );

  const styledParts = renderFullyStyledText({
    plainText: cleanedPlainText,
    highlightedRanges: props.params.highlightedRanges,
    styledWords,
    textHighlight: props.params.textHighlight,
    textColor: props.params.textColor,
    speakTextOnly,
    currentSpeakingIndex,
  });

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeakingAllWord(false);
    setCurrentSpeakingIndex(null);
  };

  const controller = useRef<HTMLAudioElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeakingOnlyAudio, setIsSpeakingOnlyAudio] = useState(false);

  const speakOnlyAudio = (index: number) => {
    const range = rangeAudio[index];
    if (!range || !range.audio) return;

    // 🔁 หยุดเสียงก่อนหน้า (ถ้ามี)
    if (controller.current) {
      controller.current.pause();
      controller.current.currentTime = 0;
      controller.current = null;
      setIsPlaying(false);
      setIsPaused(false);
    }

    const audio = new Audio(range.audio);
    audio.playbackRate = rate;
    controller.current = audio;

    setCurrentSpeakingIndex(index); // ✅ Highlight index

    audio.onended = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setIsSpeakingOnlyAudio(false);
      setCurrentSpeakingIndex(null);
    };

    audio.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setIsSpeakingOnlyAudio(false);
      setCurrentSpeakingIndex(null);
    };

    audio.onpause = () => {
      setIsPlaying(false);
      setIsPaused(true);
    };

    audio.onplay = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    audio.play();
  };

  const speakAudioRanges = (ranges: AudioRange[], onComplete?: () => void) => {
    if (!ranges || ranges.length === 0) return;

    let currentIndex = 0;

    const playNext = () => {
      if (currentIndex >= ranges.length) {
        setCurrentSpeakingIndex(null);
        setIsSpeakingAllWord(false);
        onComplete?.();
        return;
      }

      const range = ranges[currentIndex];
      setCurrentSpeakingIndex(currentIndex);

      const audio = new Audio(range.audio);
      audio.playbackRate = rate;

      controller.current = audio;
      setIsPlaying(true); // ✅ เริ่มเล่น

      audio.onended = () => {
        currentIndex++;
        playNext();
      };

      audio.onerror = () => {
        currentIndex++;
        playNext();
      };

      audio.onpause = () => {
        setIsPlaying(false); // ✅ หยุดชั่วคราว
        setIsPaused(true);
      };

      audio.onplay = () => {
        setIsPlaying(true); // ✅ เล่นต่อ
        setIsPaused(false);
      };

      audio.play();
    };

    playNext();
  };

  return (
    <React.Fragment>
      <div className="flex flex-col gap-2">
        <EditorTinyAudioSync
          params={{
            heightEditor: props.params.heightEditor,
            setContentEditor: props.params.setContentEditor,
            contentEditor: props.params.contentEditor,
            plainText: cleanedPlainText,
            setPlainText: props.params.setPlainText,
            highlightedRanges: props.params.highlightedRanges,
            setHighlightedRanges: props.params.setHighlightedRanges,
          }}
        />
        <div className="flex gap-2 items-center mt-[15px]">
          <button
            type="button"
            onClick={() => {
              setIsSpeakingAllWord(true);
              setCurrentSpeakingIndex(null);
              speakWithHighlight(
                props.params.highlightedRanges,
                cleanedPlainText
              );
            }}
            disabled={props.params.highlightedRanges.length <= 0}
            style={{
              width: "200px",
              padding: "10px 20px",
              color: "white",
              border: "none",
              borderRadius: "5px",
              backgroundColor:
                props.params.highlightedRanges.length > 0 ? "#ed1c24" : "#ccc",
              cursor:
                props.params.highlightedRanges.length > 0
                  ? "pointer"
                  : "not-allowed",
              opacity: props.params.highlightedRanges.length > 0 ? 1 : 0.6,
              transition: "all 0.2s ease-in-out",
            }}
          >
            🔊 พูดทุกคำที่ไฮไลต์
          </button>

          <div
            style={{ cursor: "pointer" }}
            onClick={() => {
              stopSpeaking();
            }}
          >
            <RedoOutlined style={{ fontSize: "34px" }} />
          </div>
          <span>ความเร็วในการเล่น:</span>
          <Select
            defaultValue={1}
            style={{ width: 120 }}
            onChange={handleChange}
            value={rate}
          >
            {rateOptions.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
          {!isPlaying ? (
            <button
              onClick={() => {
                if (!isSpeakingAllWord && !isSpeakingOnlyAudio) {
                  setIsSpeakingAllWord(true);
                  setCurrentSpeakingIndex(null);
                  speakAudioRanges(rangeAudio, () => console.log("พูดจบแล้ว"));
                }
                if (controller.current && isPaused) {
                  controller.current.play(); // ✅ เล่นต่อ
                }
              }}
            >
              ▶️ เล่นต่อ
            </button>
          ) : (
            <button
              onClick={() => {
                if (controller.current) {
                  controller.current.pause(); // ✅ แค่ pause
                }
              }}
            >
              ⏹ หยุด
            </button>
          )}

          <button
            onClick={() => {
              if (controller.current) {
                controller.current.pause();
                controller.current.currentTime = 0; // ✅ กลับไปต้นเสียง
                controller.current = null;
                setIsPaused(false);
                setIsSpeakingAllWord(false);
                setIsSpeakingOnlyAudio(false);
                setCurrentSpeakingIndex(null);
              }
            }}
          >
            🔁 รีเซต
          </button>
        </div>

        <h4>📌 ข้อความที่ถูก Highlight</h4>
        <div
          style={{
            overflowY: "auto",
            height: "200px",
            whiteSpace: "pre-wrap",
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "5px",
            fontSize: "16px",
          }}
        >
          {styledParts}
        </div>
      </div>
    </React.Fragment>
  );
};
export default observer(AudioSyncTextEditor);
