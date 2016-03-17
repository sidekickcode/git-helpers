/*
 * Parses a [unified diff](http://www.gnu.org/software/diffutils/manual/html_node/Unified-Format.html) into a 1 index list of lines in the 'after' file that were either added or modified
 *
 * DEBUG help - console.log() inside parseLine and then the counts before/after parsing it is useful
 *
 * @return { modified: [] }
 */
module.exports = exports = parseDiff;

exports._parseHeaderStr = parseHeaderStr;


function parseDiff(str) {
  var pos = 0;

  var mappings = {
    modified: [],
  }

  var inHeaderBlock = false;

  // drop header
  var lineIndex;
  try {
    var lines = str.split("\n");
    for(lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      parseLine(lines[lineIndex]);
    }
  } catch(e) {
    throw new Error("parsing failed :" + e.stack + "\n\nline: " + lines[lineIndex] + "\n\nparsed:\n" + lines.slice(0, lineIndex).join("\n") + "\n\nunparsed:\n" + lines.slice(lineIndex).join("\n"));
  }

  return mappings

  function newLine() {
    pos += 1;
  }

  function add() {
    markModified();
    newLine()
  }

  function remove() {
  }

  function markModified() {
    mappings.modified.push(pos);
  }

  function hunk(line) {
    var header = parseHeaderStr(line);
    pos = header.newer.start;
  }

  function context() {
    newLine();
  }

  function missingNewline(line) {
    if(line !== "\\ No newline at end of file") {
      throw new Error("only expecting no newline messages, got: '" + line + "'");
    }
  }

  function stillInHeaderBlock(line) {
    var prefix = line.slice(0, 4);
    switch(prefix) {
    case "new ":
    case "dele":
    case "inde":
    case "--- ":
      return true;
    case "+++ ":
      // end of header
      return false;
    }
  }

  function parseLine(line) {
    if(line.length === 0) {
      return; // EOF
    }

    if(inHeaderBlock) {
      inHeaderBlock = stillInHeaderBlock(line);
      return;
    }

    if(line.slice(0, 7) === "diff --") {
      inHeaderBlock = true;
      return;
    }

    switch(line[0]) {
      case " ": return context()
      case "@": return hunk(line)
      case "+": return add()
      case "-": return remove()
      case "\\": return missingNewline(line)
      default: throw new Error("Illegal prefix '" + line[0] + "', for line '" + line + "'")
    }
  }
}

function parseHeaderStr(header) {
  // after start line, lines;  before start line, lines  - all positions 1 indexed
  var match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)?/.exec(header)
  return {
    newer: {
      start: parseInt(match[1]),
    }
  }
}





