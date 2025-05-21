"use client";

// DOM model
import "tinymce/models/dom/model.min.js";
// Theme
import "tinymce/themes/silver";
// Toolbar icons
import "tinymce/icons/default";
// Editor styles
import "tinymce/skins/ui/oxide/skin.min.css";
// importing the plugin js.
// if you use a plugin that is not listed here the editor will fail to load
import "tinymce/plugins/advlist";
import "tinymce/plugins/anchor";
import "tinymce/plugins/autolink";
import "tinymce/plugins/autoresize";
import "tinymce/plugins/autosave";
import "tinymce/plugins/charmap";
import "tinymce/plugins/code";
import "tinymce/plugins/codesample";
import "tinymce/plugins/directionality";
import "tinymce/plugins/emoticons";
import "tinymce/plugins/fullscreen";
import "tinymce/plugins/help";
import "tinymce/plugins/image";
import "tinymce/plugins/importcss";
import "tinymce/plugins/insertdatetime";
import "tinymce/plugins/link";
import "tinymce/plugins/lists";
import "tinymce/plugins/media";
import "tinymce/plugins/nonbreaking";
import "tinymce/plugins/pagebreak";
import "tinymce/plugins/preview";
import "tinymce/plugins/quickbars";
import "tinymce/plugins/save";
import "tinymce/plugins/searchreplace";
import "tinymce/plugins/table";
// import "tinymce/plugins/template";
import "tinymce/plugins/visualblocks";
import "tinymce/plugins/visualchars";
import "tinymce/plugins/wordcount";
// importing plugin resources
import "tinymce/plugins/emoticons/js/emojis";

// ** https://www.tiny.cloud/docs/tinymce/6/react-pm-bundle/ **//
import React, { useEffect, useRef, useState } from "react";

import $ from "jquery";
import { Editor } from "@tinymce/tinymce-react";
import contentCss from "!!raw-loader!tinymce/skins/content/default/content.min.css";
import contentUiCss from "!!raw-loader!tinymce/skins/ui/oxide/content.min.css";
// TinyMCE so the global var exists
// eslint-disable-next-line no-unused-vars

// remove ssr, otherwise will cause ReferenceError: navigator is not defined

// Content styles, including inline UI like fake cursors
/* eslint import/no-webpack-loader-syntax: off */
// import contentCss from 'tinymce/skins/content/dark/content.css'

export default function BundledEditor(props) {
  const { init, ...rest } = props;

  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (window?.navigator) {
      setShouldRender(true);

      const jsDemoImagesTransform = document.createElement("script");
      jsDemoImagesTransform.type = "text/javascript";
      jsDemoImagesTransform.src =
        "https://www.wiris.net/demo/plugins/app/WIRISplugins.js?viewer=image";

      window.$ = $;
      window.tinymce = require("tinymce"); // Expose TinyMCE to the window.
      require("@wiris/mathtype-tinymce6");

      const scriptPromise = new Promise((resolve, reject) => {
        jsDemoImagesTransform.onload = resolve;
        jsDemoImagesTransform.onerror = reject;
      });

      document.head.appendChild(jsDemoImagesTransform);

      scriptPromise
        .then(() => {
          const removeElements = () => {
            const elements = document.querySelectorAll(".wrs_tickContainer");
            elements.forEach((element) => {
              element.remove();
            });
          };

          // Initial removal if elements are already in the DOM
          removeElements();

          // Observe the DOM for added nodes
          const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (
                  node.nodeType === 1 &&
                  node.classList.contains("wrs_tickContainer")
                ) {
                  node.remove();
                }
              });
            });
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
          });

          // Cleanup observer on component unmount
          return () => observer.disconnect();
        })
        .catch((error) => {
          console.error("Error loading the script:", error);
        });
    }
  }, []);

  if (!shouldRender) {
    return null;
  }

  // note that skin and content_css is disabled to avoid the normal
  // loading process and is instead loaded as a string via content_style
  return (
    <React.Fragment>
      <Editor
        init={{
          ...init,
          skin: false,
          content_css: false,
          external_plugins: {
            tiny_mce_wiris: `${window.location.href}/node_modules/@wiris/mathtype-tinymce6/plugin.min.js`,
          },
          htmlAllowedTags: [".*"],
          htmlAllowedAttrs: [".*"],
          extended_valid_elements: "*[.*]",
          content_style: [
            contentCss,
            contentUiCss,
            init.content_style || "",
          ].join("\n"),
        }}
        {...rest}
      />
    </React.Fragment>
  );
}
