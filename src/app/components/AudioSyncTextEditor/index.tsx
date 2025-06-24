"use client";

import React, { Fragment, useState } from "react";
import { EditorTinyAudioSync } from "./EditorTinyAudioSync";
import { observer } from "mobx-react-lite";
import { CloseCircleOutlined, RedoOutlined } from "@ant-design/icons";

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

const AudioSyncTextEditor = (props: AudioSyncTextEditorProps) => {
  const [currentSpeakingIndex, setCurrentSpeakingIndex] = useState<
    number | null
  >(null);
  const [isSpeakingAllWord, setIsSpeakingAllWord] = useState(false);

  const detectLanguage = (word: string): string => {
    if (/[\u0E00-\u0E7F]/.test(word)) return "th-TH"; // Thai
    if (/[\u4E00-\u9FFF]/.test(word)) return "zh-CN"; // Chinese
    return "en-US"; // Default to English
  };

  const cleanedPlainText = props.params.plainText.replace(/\r\n/g, "\n");

  const removeRange = (targetRange: { start: number; end: number }) => {
    props.params.setHighlightedRanges((prev) =>
      prev.filter(
        (r) => !(r.start === targetRange.start && r.end === targetRange.end)
      )
    );
  };

  const speakTextOnly = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = detectLanguage(text);

    const charRanges = getWordCharRanges(text);

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const charIndex = event.charIndex;
        const wordIndex = charRanges.findIndex(
          ({ start, end }) => charIndex >= start && charIndex < end
        );
        if (wordIndex !== -1) {
          setCurrentSpeakingIndex(wordIndex);
        }
      }
    };

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  const speakWithHighlight = (
    ranges: { start: number; end: number }[],
    text: string
  ) => {
    const slicedParts = ranges.map(({ start, end }) => text.slice(start, end));
    const highlightedText = slicedParts.join(" ");

    const utterance = new SpeechSynthesisUtterance(highlightedText);
    utterance.lang = detectLanguage(highlightedText);

    const charRanges = getWordCharRanges(highlightedText);

    let rangeWordMap: number[] = [];
    slicedParts.forEach((part, rangeIndex) => {
      const wordCount = part.trim().split(/\s+/).length;
      for (let i = 0; i < wordCount; i++) {
        rangeWordMap.push(rangeIndex);
      }
    });

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        const charIndex = event.charIndex;
        const wordIndex = charRanges.findIndex(
          ({ start, end }) => charIndex >= start && charIndex < end
        );

        if (wordIndex !== -1 && wordIndex < rangeWordMap.length) {
          const rangeIndex = rangeWordMap[wordIndex];
          setCurrentSpeakingIndex(rangeIndex);
        }
      }
    };

    utterance.onend = () => {
      setIsSpeakingAllWord(false);
      setCurrentSpeakingIndex(null);
    };

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  function getWordCharRanges(text: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    return ranges;
  }

  function getComputedInlineStyleFromAncestors(node: Node): string {
    let current: HTMLElement | null = node.parentElement;
    const styleParts: string[] = [];

    while (current) {
      // inline style
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

    const plainWords = plainText.split(/\b/).filter((w) => w.trim() !== "");
    let usedPlainWordIndices = new Set<number>();
    let searchOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.textContent?.trim()) continue;

      const nodeWords = node.textContent
        .split(/\b/)
        .filter((w) => w.trim() !== "");

      for (const word of nodeWords) {
        const matchIndex = plainWords.findIndex(
          (pw, i) => pw === word && !usedPlainWordIndices.has(i)
        );

        if (matchIndex !== -1) {
          usedPlainWordIndices.add(matchIndex);

          const style = getComputedInlineStyleFromAncestors(node);

          const offset = plainText.indexOf(word, searchOffset);
          styledWords.push({ word, style, offset });

          searchOffset = offset + word.length;
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

      {
        isSpeakingAllWord
          ? parts.push(
              <span
                key={`highlight-${range.start}`}
                onClick={() => {
                  if (isSpeakingAllWord) return;
                  speakTextOnly(highlightText);
                }}
                style={{
                  backgroundColor: isSpeakingCurrentWord
                    ? textHighlight
                    : "transparent",
                  color: textColor,
                  cursor: isSpeakingAllWord ? "not-allowed" : "pointer",
                  padding: "2px",
                  borderRadius: "3px",
                  ...style,
                }}
              >
                {highlightText}🔊
              </span>
            )
          : parts.push(
              <Fragment key={`highlight-${range.start}`}>
                <span
                  onClick={() => {
                    if (isSpeakingAllWord) return;
                    speakTextOnly(highlightText);
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
                  {highlightText}🔊
                </span>
                <span
                  style={{
                    backgroundColor: textHighlight,
                    color: textColor,
                    cursor: isSpeakingAllWord ? "not-allowed" : "pointer",
                    padding: "2px",
                    borderTopRightRadius: "3px",
                    borderBottomRightRadius: "3px",
                  }}
                  onClick={() => {
                    removeRange(range);
                  }}
                >
                  <CloseCircleOutlined />
                </span>
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
