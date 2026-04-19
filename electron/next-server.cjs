/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const net = require("node:net");

const next = require("next");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function startEmbeddedNext(appDir) {
  const port = await getFreePort();
  const nextApp = next({
    dev: false,
    dir: appDir,
    hostname: "127.0.0.1",
    port,
  });

  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const server = http.createServer((request, response) => {
    void handle(request, response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

module.exports = { startEmbeddedNext };
