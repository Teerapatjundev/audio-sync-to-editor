"use client";

import { useRef } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";

import { Sarabun } from "next/font/google";
const sarabun = Sarabun({
  style: "normal", // Adjust style as needed
  subsets: ["latin", "thai"], // Adjust subsets as needed
  weight: ["400", "700"], // Include the required weights
  variable: "--font-sarabun", // CSS variable for advanced usage
});

import { Skeleton } from "antd";

import MathMLToSvg from "./MathMLToSvg";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import { observer } from "mobx-react-lite";

const DynamicBundledEditor = dynamic(() => import("./BundledEditor"), {
  ssr: false,
  loading: () => <Skeleton />,
});

interface AudioSyncTextEditorProps {
  params: {
    variables?: any;
    heightEditor: number;
    setContentEditor: (content: string) => void;
    contentEditor: string;
    plainText: string;
    setPlainText: (content: string) => void;
    highlightedRanges: { start: number; end: number }[];
    setHighlightedRanges: React.Dispatch<
      React.SetStateAction<{ start: number; end: number }[]>
    >;
  };
}

const mergeHighlightRanges = (
  ranges: { start: number; end: number }[],
  start: number,
  end: number
): { start: number; end: number }[] => {
  const newRanges: { start: number; end: number }[] = [];

  for (const range of ranges) {
    if (start >= range.start && end <= range.end) return ranges;
    else if (range.start >= start && range.end <= end) continue;
    else if (start <= range.end && end >= range.start) {
      start = Math.min(start, range.start);
      end = Math.max(end, range.end);
    } else {
      newRanges.push(range);
    }
  }

  newRanges.push({ start, end });
  return newRanges.sort((a, b) => a.start - b.start);
};

const getTextOffsets = (
  editor: any,
  range: Range
): { start: number; end: number; fullText: string } => {
  const body = editor.getBody();
  const blocks = Array.from(body.querySelectorAll("p, div"));

  let offset = 0;
  let fullText = "";
  const offsetMap = new Map<Text, number>();

  // ✅ เดินหา TextNode ที่แท้จริง จาก startContainer/endContainer
  const resolveTextNode = (node: Node): Text | null => {
    if (node.nodeType === Node.TEXT_NODE) return node as Text;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return walker.nextNode() as Text | null;
  };

  const startTextNode = resolveTextNode(range.startContainer);
  const endTextNode = resolveTextNode(range.endContainer);

  // ✅ เดิน TextNode ทั้งหมด และเก็บ offset + fullText
  for (const block of blocks) {
    const walker = document.createTreeWalker(
      block as Node,
      NodeFilter.SHOW_ALL
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent || "";

        // ✅ Normalize spacing
        text = text.replace(/\u00A0/g, " ").replace(/\u200B/g, "");

        offsetMap.set(node as Text, offset);
        fullText += text;
        offset += text.length;
      }
    }

    // ✅ เว้นบรรทัดระหว่าง block
    fullText += "\n\n";
    offset += 2;
  }

  // ✅ ตัด \n\n ส่วนสุดท้าย
  if (fullText.endsWith("\n\n")) {
    fullText = fullText.slice(0, -2);
    offset -= 2;
  }

  // ✅ คำนวณ offset
  const start =
    (startTextNode && offsetMap.has(startTextNode)
      ? offsetMap.get(startTextNode)!
      : 0) + range.startOffset;

  const end =
    (endTextNode && offsetMap.has(endTextNode)
      ? offsetMap.get(endTextNode)!
      : 0) + range.endOffset;

  const selected = range.toString();
  const adjusted = adjustOffsetsByContent(fullText, start, end, selected);

  return {
    start: adjusted.start,
    end: adjusted.end,
    fullText,
  };
};

function adjustOffsetsByContent(
  fullText: string,
  start: number,
  end: number,
  expected: string
): { start: number; end: number } {
  let slice = fullText.slice(start, end);

  // ลบ invisible char สำหรับเทียบ
  const normalize = (s: string) =>
    s.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, "");

  const normalizedSlice = normalize(slice);
  const normalizedExpected = normalize(expected);

  if (normalizedSlice.includes(normalizedExpected)) {
    const leading = normalizedSlice.indexOf(normalizedExpected);
    return {
      start: start + leading,
      end: start + leading + expected.length,
    };
  }

  return { start, end }; // fallback
}

export const EditorTinyAudioSync = observer(
  (props: AudioSyncTextEditorProps) => {
    const {
      variables,
      heightEditor,
      contentEditor,
      setContentEditor,
      plainText,
      setPlainText,
      highlightedRanges,
      setHighlightedRanges,
    } = props.params;
    const editorRef = useRef<any>(null);

    const handleEditorChange = (content: any, editor: any) => {
      const contents = editor.getContent({ format: "html" });
      const newPlainText = editor.getContent({ format: "text" });
      console.log("contents:", contents);

      const oldText = plainText;
      const newText = newPlainText;

      // หา index แรกที่ต่างกัน
      let diffStart = 0;
      while (
        diffStart < oldText.length &&
        diffStart < newText.length &&
        oldText[diffStart] === newText[diffStart]
      ) {
        diffStart++;
      }

      // หา index จากท้ายที่ต่างกัน
      let oldEnd = oldText.length - 1;
      let newEnd = newText.length - 1;
      while (
        oldEnd >= diffStart &&
        newEnd >= diffStart &&
        oldText[oldEnd] === newText[newEnd]
      ) {
        oldEnd--;
        newEnd--;
      }

      const changeLength = newText.length - oldText.length;

      // 2. อัปเดต highlightedRanges
      const updatedRanges = highlightedRanges
        .map((range) => {
          // ถ้าถูกลบหรือแก้ตรงช่วงที่ไฮไลต์ไว้
          if (
            (diffStart <= range.start && range.start <= oldEnd) ||
            (diffStart <= range.end && range.end <= oldEnd) ||
            (range.start < diffStart && range.end > oldEnd)
          ) {
            return null; // ถูกแก้กลางช่วงไฮไลต์ ให้ลบทิ้ง
          }

          // ถ้าอยู่หลังตำแหน่งที่แก้ ให้เลื่อนตำแหน่ง
          if (range.start > oldEnd) {
            return {
              start: range.start + changeLength,
              end: range.end + changeLength,
            };
          }

          // ไม่ได้รับผลกระทบ
          return range;
        })
        .filter((range) => range !== null) as { start: number; end: number }[];

      setHighlightedRanges(updatedRanges);
      setPlainText(newPlainText);
      setContentEditor(content);
    };

    const handleConfirmHighlight = () => {
      const editor = editorRef.current;
      if (!editor) return;

      const range = editor.selection.getRng();

      const fullPlainText = editor.getContent({ format: "text" });

      const selectedText = editor.selection.getContent({ format: "text" });

      if (!selectedText.trim()) return;

      const { start, end } = getTextOffsets(editor, range);

      // ครอบทั้ง editor (เช่น Ctrl + A)
      const isSelectAll = selectedText.trim() === fullPlainText.trim();

      if (isSelectAll) {
        // ถ้าเลือกทั้งหมด ให้ set range ตั้งแต่ 0 ถึงความยาว plainText
        setHighlightedRanges((prev) =>
          mergeHighlightRanges(prev, 0, fullPlainText.length)
        );
      } else if (start >= 0 && end > start) {
        // กรณีทั่วไป
        setHighlightedRanges((prev) => mergeHighlightRanges(prev, start, end));
      }
    };

    return (
      <>
        <Head>
          <title>Create Editor</title>
          <meta name="description" content="Generated by create next app" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <script src="https://cdn.tiny.cloud/1/no-api-key/tinymce/6/tinymce.min.js"></script>
        </Head>
        <>
          <div key={variables?.map((variable: any) => variable.tags)}>
            <DynamicBundledEditor
              onInit={(evt: any, editor: any) => (editorRef.current = editor)}
              onEditorChange={handleEditorChange}
              value={contentEditor}
              init={{
                toolbar_mode: "wrap",
                statusbar: false,
                promotion: false,
                height: heightEditor,
                // apiKey: "qgxf4qmr3wicqwg911b9xgan0awe0lw8a4127s91rpzemlou",
                menubar: false,
                mentions_selector: ".mentions",
                mentions_item_type: "name",
                mentions_min_chars: 1,
                mentions_menu_complete: (editor: any, variableInfo: any) => {
                  const span = editor.getDoc().createElement("span");
                  span.className = "mentions";
                  span.setAttribute("data-mention-id", variableInfo.id);
                  span.appendChild(
                    editor.getDoc().createTextNode(`@${variableInfo.name}`)
                  );
                  return span;
                },
                mentions_fetch: async (query: any, success: any) => {
                  const matchedVariables = variables
                    .filter((variable: any) =>
                      variable.nameVariable
                        .toLowerCase()
                        .includes(query.term.toLowerCase())
                    )
                    .slice(0, 10);

                  success(matchedVariables);
                },

                plugins: [
                  "advlist",
                  "autolink",
                  "lists",
                  "link",
                  "image",
                  "charmap",
                  "preview",
                  "anchor",
                  "searchreplace",
                  "visualblocks",
                  "code",
                  "fullscreen",
                  "insertdatetime",
                  "media",
                  "table",
                  "code",
                  "help",
                  "wordcount",
                ],
                font_size_formats:
                  "8px 9px 10px 11px 12px 14px 16px 18px 20px 22px 24px 26px 28px 36px 48px 72px",
                toolbar:
                  "confirmHighlight fontsize bold italic underline forecolor backcolor |\
                 alignleft aligncenter alignright bullist numlist removeformat | table uploadImage |\
                 tiny_mce_wiris_formulaEditor tiny_mce_wiris_formulaEditorChemistry |\
                 fullscreen" +
                  //  "testBTN pdfBTN wordBTN addButton| "+
                  "",
                content_style:
                  // ".mentions{ color: blue; }" +
                  // "body { font-family:Helvetica,Arial,sans-serif; font-size:14px }",
                  // "body { font-family: var(--font-sarabun); font-size:14px }",
                  `
                 @import url("/_next/static/css/app/layout.css");
                  body {
                    font-family: ${sarabun.style.fontFamily};
                  }
                  .mentions{ color: blue; }
                `,
                automatic_uploads: true,
                file_picker_types: "image",
                setup: function (editor: any) {
                  const getMatchedChars = (pattern: any) => {
                    return variables.filter(
                      (varia: any) => varia.nameVariable.indexOf(pattern) !== -1
                    );
                  };

                  editor.ui.registry.addAutocompleter("Mentions-trigger", {
                    trigger: "@",
                    minChars: 0,
                    columns: 1,
                    onAction: (
                      autocompleteApi: any,
                      rng: any,
                      varItem: any
                    ) => {
                      const matchedVariable = variables.find(
                        (item: any) => item.nameVariable === varItem
                      );
                      if (matchedVariable) {
                        const span = editor.getDoc().createElement("span");
                        span.className = "mentions";
                        span.setAttribute(
                          "data-name-variable",
                          matchedVariable.nameVariable
                        );
                        span.setAttribute(
                          "data-mention-id",
                          matchedVariable.keyVariable
                        );
                        span.appendChild(
                          editor
                            .getDoc()
                            .createTextNode(`@${matchedVariable.nameVariable}`)
                        );
                        editor.insertContent(
                          `<span class="mentions" data-mention-id=${matchedVariable.keyVariable}>
                        @${matchedVariable.nameVariable}
                      </span> `
                        );
                        const content = editor.getContent();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(
                          content,
                          "text/html"
                        );

                        const paragraphs = doc.querySelectorAll("p");
                        paragraphs.forEach((paragraph) => {
                          const children = Array.from(paragraph.childNodes);
                          let match = "@";
                          children.forEach((child) => {
                            if (child?.nodeType === Node.TEXT_NODE) {
                              let text: any = child.textContent;
                              // Remove @ from the last position of the text
                              if (text.lastIndexOf(match) < -1) {
                                let myNameChars = text.split("");
                                myNameChars[text.lastIndexOf(match)] = "";
                                const replacedText = myNameChars.join("");
                                text = replacedText;
                              } else {
                                const lastIndex = text.lastIndexOf("@");
                                if (
                                  lastIndex > -1 &&
                                  lastIndex === text.length - 1
                                ) {
                                  text = text.substring(0, lastIndex);
                                }
                              }

                              variables.forEach((variable: any) => {
                                const nameVariable = variable.nameVariable;
                                // Loop through each character in nameVariable
                                for (let i = 0; i < nameVariable.length; i++) {
                                  const char = nameVariable[i];
                                  if (
                                    text.includes(char) &&
                                    text.lastIndexOf(char) < -1
                                  ) {
                                    // Remove the character from text
                                    text = text.replace(char, "");
                                  } else {
                                    const lastIndexVariable =
                                      text.lastIndexOf(char);
                                    const lastIndex = text.lastIndexOf("@");

                                    if (
                                      lastIndexVariable > -1 &&
                                      lastIndexVariable === text.length - 1
                                    ) {
                                      text = text.substring(
                                        0,
                                        lastIndexVariable
                                      );
                                    }
                                    if (
                                      lastIndex !== -1 &&
                                      lastIndex === text.length - 1
                                    ) {
                                      text = text.substring(0, lastIndex);
                                    }
                                  }
                                }
                              });

                              child.textContent = text;
                            }
                          });
                        });

                        const updatedContent = doc.body.innerHTML;
                        editor.setContent(updatedContent);
                        editor.focus();
                        editor.selection.setRng(rng);
                        autocompleteApi.hide();
                      }
                    },
                    fetch: (pattern: any) => {
                      return new Promise((resolve) => {
                        const results = getMatchedChars(pattern).map(
                          (varia: any) => ({
                            type: "autocompleteitem",
                            value: varia.nameVariable,
                            text: varia.nameVariable,
                            icon: "@",
                          })
                        );
                        resolve(results);
                      });
                    },
                  });

                  editor.ui.registry.addButton("testBTN", {
                    text: "My Button",
                    onAction: function (_: any) {
                      editor.insertContent(
                        "&nbsp;<strong>It's my button!</strong>&nbsp;"
                      );
                    },
                  });

                  editor.ui.registry.addButton("pdfBTN", {
                    text: "Export pdf",
                    onAction: function (_: any) {
                      var mylist = document.getElementById("imgFromMathMl2");
                      if (mylist) {
                        mylist.insertAdjacentHTML(
                          "beforeend",
                          editor.getContent()
                        );
                        mylist.insertAdjacentHTML(
                          "beforeend",
                          "<br/><br/><br/>"
                        );
                      }
                      exportToPdf();
                    },
                  });
                  editor.ui.registry.addButton("wordBTN", {
                    text: "Export word",
                    onAction: async function (_: any) {
                      var test = document.createElement("div");
                      test.insertAdjacentHTML("beforeend", editor.getContent());
                      const tableElements = Array.from(
                        test.querySelectorAll("table")
                      );
                      const tdElements = Array.from(
                        test.querySelectorAll("td")
                      );
                      const hrElements = Array.from(
                        test.querySelectorAll("hr")
                      );
                      await Promise.all(
                        tableElements.map(async (node) => {
                          node.style.width = "";
                        })
                      );
                      await Promise.all(
                        tdElements.map(async (node) => {
                          node.style.width = "";
                        })
                      );

                      await Promise.all(
                        hrElements.map(async (node) => {
                          const pElement = document.createElement("p");
                          pElement.innerHTML = "<p>---</p>";
                          if (node.parentNode)
                            node.parentNode.replaceChild(pElement, node);
                        })
                      );
                      const imgElements = Array.from(
                        test.querySelectorAll("img")
                      );

                      const mathElements = Array.from(
                        test.querySelectorAll("math")
                      );
                      await Promise.all(
                        mathElements.map(async (element) => {
                          const mathContent = element.outerHTML.toString();
                          const imgElement = document.createElement("img");

                          // Render MathMl content
                          try {
                            if (mathContent) {
                              await MathMLToSvg(mathContent).then(
                                (result: string) => {
                                  const divEle = document
                                    .getElementById("imgFromMathMl2")
                                    ?.querySelector("img");
                                  const container4 =
                                    document.createElement("div");
                                  if (
                                    element.parentNode &&
                                    imgElement &&
                                    result &&
                                    divEle
                                  ) {
                                    container4.innerHTML = result.trim();

                                    element.parentNode.replaceChild(
                                      divEle,
                                      element
                                    );
                                  }
                                }
                              );
                            }
                          } catch (error) {
                            console.error(
                              "MathMlToImg rendering error:",
                              error
                            );
                          } finally {
                            console.log(test);
                          }
                        })
                      );
                      var finalHtml =
                        '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>';
                      finalHtml += test.innerHTML;
                      finalHtml += "</body></html>";
                      exportToWord(finalHtml);
                    },
                  });
                  {
                    variables
                      ? editor.ui.registry.addMenuButton("addButton", {
                          text: "Variables",
                          fetch: async function (callback: any) {
                            var items: any[] = [];
                            // variablesFlat
                            variables
                              .flat()
                              ?.forEach(function (varItem: any, index: number) {
                                varItem?.tags.length > 0 &&
                                  items.push({
                                    type: "menuitem",
                                    text: varItem.nameVariable,
                                    onAction: function () {
                                      const span = editor
                                        .getDoc()
                                        .createElement("span");
                                      span.className = "mentions";

                                      span.setAttribute(
                                        "data-name-variable",
                                        varItem.nameVariable
                                      );
                                      span.setAttribute(
                                        "data-mention-id",
                                        varItem.keyVariable
                                      );
                                      span.appendChild(
                                        editor
                                          .getDoc()
                                          .createTextNode(
                                            `@${varItem.nameVariable}`
                                          )
                                      );
                                      editor.insertContent(
                                        `<span class="mentions" data-mention-id=${varItem.keyVariable}>
                                @${varItem.nameVariable}
                              </span> `
                                      );
                                      editor.focus();
                                    },
                                  });
                              });

                            callback(items);
                          },
                        })
                      : null;
                  }

                  editor.ui.registry.addIcon(
                    "audioSync",
                    '<img src="/assets/autoSync-icon.png" style="height:24px;" />'
                  );

                  editor.ui.registry.addButton("confirmHighlight", {
                    text: "Audio Sync",
                    icon: "audioSync",
                    tooltip: "audioSync",
                    onAction: handleConfirmHighlight,
                  });
                },
              }}
            />
          </div>
        </>
      </>
    );
  }
);

export async function exportToPdf() {
  var mylist = document.getElementById("imgFromMathMl2");
  if (mylist) {
    try {
      html2canvas(mylist, { scale: 1 }).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        var pdf = new jsPDF("p", "pt", "a4");
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        let heightLeft = pdfHeight;
        let position = 0;
        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
        position = heightLeft - pdfHeight;
        heightLeft -= 841.89;
        while (heightLeft >= 0) {
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
          heightLeft -= 841.89;
        }
        pdf.save("download.pdf");
      });
    } catch (error) {
      console.error("Export pdf rendering error:", error);
    } finally {
      mylist.innerHTML = "";
    }
  }
}

export async function exportToWord(finalHtml: string) {
  // const fileBuffer = await HTMLtoDOCX(finalHtml, null, {
  //   table: { row: { cantSplit: true } },
  //   footer: true,
  //   pageNumber: true,
  // });
  // var docName = "document.docx";
  // saveAs(fileBuffer, docName);
}
