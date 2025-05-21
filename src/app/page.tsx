"use client";
import { useState } from "react";
import AudioSyncTextEditor from "./components/AudioSyncTextEditor";

export default function Home() {
  const [contentEditor, setContentEditor] = useState("");
  const [plainText, setPlainText] = useState("");
  const [highlightedRanges, setHighlightedRanges] = useState<
    { start: number; end: number }[]
  >([]);
  const [textColor, setTextColor] = useState("#000000");
  const [textHighlight, setTextHighlight] = useState("#ecf00a");

  return (
    <main className="bg-white flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex flex-col z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-black">ทดสอบ 10</h1>
        <AudioSyncTextEditor
          params={{
            heightEditor: 524,
            contentEditor: contentEditor,
            setContentEditor: setContentEditor,
            plainText: plainText,
            setPlainText: setPlainText,
            highlightedRanges: highlightedRanges,
            setHighlightedRanges: setHighlightedRanges,
            textColor: textColor,
            textHighlight: textHighlight,
          }}
        />
      </div>
    </main>
  );
}
