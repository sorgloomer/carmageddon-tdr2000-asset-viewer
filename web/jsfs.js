const nodePath = require("path");

const FsPath = require("./jsfs-path.js");
exports.path = FsPath;


class AbstractFs {
  async list(path) {
    throw new NotImplementedError();
  }
  async readBytes(path) {
    throw new NotImplementedError();
  }
}
exports.AbstractFs = AbstractFs;


class NodeWrappingFs {
  constructor(nodefs) {
    this.nodefs = nodefs;
  }
  
  _readFile(path) {
    return this._nodeForward("readFile", path);
  }

  _readdir(path) {
    return this._nodeForward("readdir", path);
  }
  
  _nodeForward(name, path) {
    return new Promise((resolve, reject) => {
      this.nodefs[name](path, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  readBytes(path) {
    return this._readFile(path);
  }
  
  async list(path) {
    const children = await this._readdir(path);
    return children.map(name => ({name}));
  }
}
exports.NodeWrappingFs = NodeWrappingFs;


function nodeSubpath(parent, path) {
  path = nodePath.resolve("/", path);
  path = nodePath.relative("/", path);
  return nodePath.resolve(parent, path);
}

class OsFs extends NodeWrappingFs {
  constructor(rootPath = "/") {
    super(require("fs"));
    this.rootPath = nodePath.resolve(rootPath);
  }
  async list(path) {
    return await this._superForward("list", path);
  }
  async readBytes(path) {
    return await this._superForward("readBytes", path);
  }
  _superForward(name, path) {
    return super[name](this._mapPath(path));
  }
  _mapPath(path) {
    return nodeSubpath(this.rootPath, path);
  }
}

exports.OsFs = OsFs;


class SubtreeFs extends AbstractFs {
  constructor(provider, pathRoot) {
    this.provider = provider;
    this.pathRoot = pathRoot;
    super();
  }
  async list(path) {
    return await this._forward("list", path);
  }
  async readBytes(path) {
    return await this._forward("readBytes", path);
  }
  _forward(name, path) {
    return this.provider[name](FsPath.subpath(this.pathRoot, path));
  }
}
exports.SubtreeFs = SubtreeFs;

