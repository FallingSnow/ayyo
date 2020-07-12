import assert from "assert";

import {set} from "./util/index.mjs";

const GROUPS_REGEX = new RegExp(
  "name=\"(?<name>.*?)\"(; filename=\"(?<filename>.*?)\")?"
);
const DOUBLE_NEWLINE_REGEX = /(\r?\n){2}/;

export function parse(boundary, buffer, encoding = "binary") {
  let fieldCounter = 0;
  boundary = `--${boundary}`;
  let segments = buffer.toString(encoding).split(boundary);
  // console.debug({boundary, segments}, '\n\n')
  assert(segments[0] === "");
  assert(segments[segments.length - 1].trim() === "--");

  // Remove first and last segment
  segments = segments.splice(1, segments.length - 2);

  return segments.reduce((fields, segment) => {
    segment = segment.trim();

    // Split headers from content
    const seperatorIndex = segment.search(DOUBLE_NEWLINE_REGEX);

    // Field is empty; skip it
    if (seperatorIndex === -1) {
      return fields;
    }

    const doubleNewlineLength = segment.match(DOUBLE_NEWLINE_REGEX)[0]
      .length;
    let [headersArray, content] = [
      segment.substring(0, seperatorIndex).split(/\r?\n/),
      segment.substring(seperatorIndex + doubleNewlineLength)
    ];

    // Convert header array to an object
    let headers = {};
    for (const header of headersArray) {
      const seperatorIndex = header.indexOf(": ");
      const [key, value] = [
        header.substring(0, seperatorIndex),
        header.substring(seperatorIndex + 2)
      ];
      headers[key] = value;
    }

    // Get regex groups such as name and filename
    const matches = GROUPS_REGEX.exec(headers["Content-Disposition"] || "")
      .groups;

    if (matches.filename) {
      content = {
        filename: matches.filename,
        content: Buffer.from(content, encoding)
      };
    }

    set(fields, matches.name || fieldCounter++, content);

    return fields;
  }, {});
}
