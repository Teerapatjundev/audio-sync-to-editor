"use client";

import { mathjax } from "mathjax-full/js/mathjax";
import { TeX } from "mathjax-full/js/input/tex";
import { MathML } from "mathjax-full/js/input/mathml";
import { SVG } from "mathjax-full/js/output/svg";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import html2canvas from "html2canvas";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const mathjax_document = mathjax.document("", {
  // InputJax: new TeX({ packages: AllPackages }),
  InputJax: new MathML({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "local" }),
});

const mathjax_options = {
  em: 16,
  ex: 8,
  containerWidth: 1280,
};

function get_mathjax_svg(math: string): string {
  const node = mathjax_document.convert(math, mathjax_options);
  return adaptor.innerHTML(node);
}

async function MathMLToSvg(htmlWithMathML: string) {
  // console.log(htmlWithMathML);
  return new Promise<string>((resolve, reject) => {
    const container = document.getElementById("imgFromMathMl2");

    let myImg,
      imgStr,
      width = 0,
      height = 0;
    if (container) {
      container.innerHTML = "";
      container.insertAdjacentHTML(
        "beforeend",
        get_mathjax_svg(htmlWithMathML)
      );
      // console.log(container.innerHTML);
      const getSvg = container.querySelector("svg");

      if (getSvg) {
        var rect = getSvg.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        // console.log(rect.width, rect.height);
      }
      //container.appendChild(imgElement)
      html2canvas(container, { scale: 1 })
        .then((canvas) => {
          // console.log(canvas);
          const img = new Image();
          img.width = width;
          img.height = height;
          // console.log(canvas.width, canvas.height);
          img.src = canvas.toDataURL("image/png");
          myImg = img;

          imgStr = " " + img.outerHTML;
          // console.log("This is img string: ", imgStr);

          var el = document.getElementById("imgFromMathMl2"); // or other selector like querySelector()
          // if (el) {
          //   var rect = el.getBoundingClientRect();
          //   console.log(rect.width);
          //   console.log(rect.height);
          // }
          container.innerHTML = "";
          container.appendChild(img);
          resolve(imgStr);
        })
        .catch((error) => {
          reject(error);
        });
    }
  });
}

export default MathMLToSvg;
