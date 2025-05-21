"use client";

import React, { useState } from "react";
import { EditorTinyAudioSync } from "./EditorTinyAudioSync";
import { observer } from "mobx-react-lite";

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

  const detectLanguage = (_text: string): string => {
    return "en-US";
  };

  const speakContent = (textToSpeak: string) => {
    if (!textToSpeak) return;

    const lang = detectLanguage(textToSpeak);
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = lang;

    const getBestVoice = (voices: SpeechSynthesisVoice[], lang: string) => {
      return (
        voices.find(
          (voice) => voice.lang === lang && voice.name.includes("Google")
        ) ||
        voices.find((voice) => voice.lang === lang) ||
        voices.find((voice) => voice.lang.startsWith(lang.split("-")[0])) ||
        voices[0]
      );
    };

    const speakWithVoices = () => {
      const voices = synth.getVoices();
      const bestVoice = getBestVoice(voices, lang);
      if (bestVoice) utterance.voice = bestVoice;
      synth.speak(utterance);
    };

    // Safari fallback: use timeout if voices not yet available
    if (synth.getVoices().length === 0) {
      // Try both onvoiceschanged AND timeout fallback
      let tried = false;

      const tryOnce = () => {
        if (tried) return;
        tried = true;
        speakWithVoices();
      };

      synth.onvoiceschanged = tryOnce;
      setTimeout(tryOnce, 300);
    } else {
      speakWithVoices();
    }
  };

  const speakHighlighted = (
    ranges: { start: number; end: number }[],
    text: string
  ) => {
    if (!ranges.length) return;

    let index = 0;

    const speakNext = () => {
      if (index >= ranges.length) {
        setCurrentSpeakingIndex(null);
        setIsSpeakingAllWord(false);
        return;
      }

      const { start, end } = ranges[index];
      setCurrentSpeakingIndex(index);
      const chunk = text.slice(start, end).trim();
      if (!chunk) {
        index++;
        speakNext();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = detectLanguage(chunk);

      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find(
          (v) => v.lang === utterance.lang && v.name.includes("Google")
        ) ||
        voices.find((v) => v.lang === utterance.lang) ||
        voices[0];
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        index++;
        speakNext();
      };

      window.speechSynthesis.speak(utterance);
    };

    window.speechSynthesis.cancel(); // เคลียร์คำพูดก่อนหน้า
    speakNext(); // เริ่มพูด
  };

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
    speakContent,
    currentSpeakingIndex,
  }: {
    plainText: string;
    highlightedRanges: { start: number; end: number }[];
    styledWords: { word: string; offset: number; style: string }[];
    textHighlight: string;
    textColor: string;
    speakContent: (text: string) => void;
    currentSpeakingIndex: number | null;
  }): React.ReactNode[] {
    const parts: React.ReactNode[] = [];

    const styledMap = new Map<number, string>();
    styledWords.forEach((w) => styledMap.set(w.offset, w.style));

    const ranges = [...highlightedRanges].sort((a, b) => a.start - b.start);
    let current = 0;

    ranges.forEach((range, index) => {
      if (current < range.start) {
        const normalText = plainText.slice(current, range.start);
        parts.push(
          <span key={`text-${current}`}>
            {renderStyledSegment(normalText, current, styledMap)}
          </span>
        );
      }

      const highlightText = plainText.slice(range.start, range.end);
      const style = parseInlineStyle(styledMap.get(range.start));
      const isSpeakingCurrentWord = index === currentSpeakingIndex;

      {
        isSpeakingAllWord
          ? parts.push(
              <span
                key={`highlight-${range.start}`}
                onClick={() => speakContent(highlightText)}
                style={{
                  backgroundColor: isSpeakingCurrentWord
                    ? textHighlight
                    : "transparent",
                  color: textColor,
                  cursor: "pointer",
                  padding: "2px",
                  borderRadius: "3px",
                  ...style,
                }}
              >
                {highlightText} 🔊
              </span>
            )
          : parts.push(
              <span
                key={`highlight-${range.start}`}
                onClick={() => speakContent(highlightText)}
                style={{
                  backgroundColor: textHighlight,
                  color: textColor,
                  cursor: "pointer",
                  padding: "2px",
                  borderRadius: "3px",
                  ...style,
                }}
              >
                {highlightText} 🔊
              </span>
            );
      }

      current = range.end;
    });

    if (current < plainText.length) {
      const tail = plainText.slice(current);
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
    props.params.plainText
  );

  const styledParts = renderFullyStyledText({
    plainText: props.params.plainText,
    highlightedRanges: props.params.highlightedRanges,
    styledWords,
    textHighlight: props.params.textHighlight,
    textColor: props.params.textColor,
    speakContent,
    currentSpeakingIndex,
  });

  return (
    <React.Fragment>
      <div className="flex flex-col gap-2">
        <EditorTinyAudioSync
          params={{
            heightEditor: props.params.heightEditor,
            setContentEditor: props.params.setContentEditor,
            contentEditor: props.params.contentEditor,
            plainText: props.params.plainText,
            setPlainText: props.params.setPlainText,
            highlightedRanges: props.params.highlightedRanges,
            setHighlightedRanges: props.params.setHighlightedRanges,
          }}
        />
        <button
          onClick={() => {
            setIsSpeakingAllWord(true);
            speakHighlighted(
              props.params.highlightedRanges,
              props.params.plainText
            );
          }}
          disabled={props.params.highlightedRanges.length <= 0}
          style={{
            marginTop: "15px",
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
