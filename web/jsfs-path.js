
const UP = "..";
const CURRENT = ".";

exports.UP = UP;
exports.CURRENT = CURRENT;

function parts(path) {
  return path.split("/").filter(x => x);
}
exports.parts = parts;

function filename(path) {
  const match = /^(?:[\s\S]*\/)?([^/]+)\/*$/.exec(path);
  return match ? match[1] : "";
}
exports.filename = filename;

function extname(path) {  
  const fname = filename(path);
  const match = /^.*?((?:\.[^.]*)?)$/.exec(fname);
  return match ? match[1] : "";
}
exports.extname = extname;

function basename(path) {  
  const fname = filename(path);
  const match = /^(.*?)(?:\.[^.]*)?$/.exec(fname);
  return match ? match[1] : "";
}
exports.basename = basename;

function isSpecialPart(part) {
  part = "" + part;
  return !part || part == UP || part == CURRENT;
}
exports.isSpecialPart = isSpecialPart;

function join(base, ...args) {
  base = "" + base;
  var baseEndsWithSep = base.endsWith("/");
  for (const _arg of args) {
    const arg = "" + _arg;
    const argStartsWithSep = arg.startsWith("/");
    if (!baseEndsWithSep && !argStartsWithSep) {
      base += "/";
    }
    base += arg;
    baseEndsWithSep = !arg || arg.endsWith("/");
  }
}
exports.join = join;
  
function parent(path) {
  path = "" + path;
  const match = /^(?:([\s\S]*[^/])\/+)?([^/]+)\/*$/.exec(path);
  if (!match) {
    return UP;
  }
  const [truncatedOpt, filename] = match;
  if (isSpecialPart(filename)) {
    return join(path, UP);
  }
  return truncatedOpt || "";
}
exports.parent = parent;
  
function normalize(path) {
  path = "" + path;
  throw new NotImplementedError();
}
exports.normalize = normalize;
  
function isAbsolute(path) {
  path = "" + path;
  return path.startsWith("/");
}
exports.isAbsolute = isAbsolute;

function restrict(path) {
  path = "" + path;
  return normalize("/" + path).substr(1);
}
exports.restrict = restrict;
