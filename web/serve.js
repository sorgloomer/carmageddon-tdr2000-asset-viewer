const Koa = require("koa");
const koa_static = require("koa-static");
const path = require("path");
const r = require("koa-route");
const fs = require("./jsfs.js");
PORT = 8001;

function respondJson(ctx, data) {
  ctx.body = JSON.stringify(data);
}

function main() {
  const app = new Koa();
  //app.use(httpfs(new fs.OsFs("static")));
  app.use(koa_static("static"));

  app.listen(PORT);
  console.log(`app listening on ${PORT}`)
}

function httpfs(fsroot) {
  return new FsMiddleware(fsroot).middleware();
}

class FsMiddleware {
  constructor(fsroot) {
    this.fsroot = fsroot;
  }
  middleware() {
    return this.handler.bind(this);
  }
  async handler(ctx, next) {
    const reqPath = ctx.path;
    const fileName = fs.path.filename(reqPath);
    const parentPath = fs.path.parent(reqPath);
    
    if (fileName === "$list") {
      await this.serveList(ctx, parentPath);
      return;
    }
    await this.serveFile(ctx, reqPath);
  }
  async serveFile(ctx, path) {
    ctx.body = await this.fsroot.readBytes(path);
  }
  async serveList(ctx, parentPath) {
    const data = await this.fsroot.list(parentPath);
    return respondJson(ctx, data);
  }
}

main();
