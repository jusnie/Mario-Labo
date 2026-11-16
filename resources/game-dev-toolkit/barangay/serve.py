#!/usr/bin/env python3
"""Static server for the Barangay Kabudoy prototype.

Serves the game-dev-toolkit root so that /vendor, /assets and /barangay all
resolve. Binds 0.0.0.0 so the Arena preview proxy can reach it, sends no-cache
headers, and sets a MIME type for .mjs (Python's mimetypes can be stale).

Usage:
    python3 barangay/serve.py [--port PORT] [--root DIR]
"""

import argparse
import functools
import http.server
import os
import socketserver
import sys

# realpath, not abspath: the toolkit root is a symlink to this file, and
# abspath would leave us one directory short when it is run through the link.
TOOLKIT_ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

EXTRA_MIME = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTRA_MIME:
            return EXTRA_MIME[ext]
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        # "/" is the game; everything else is served from the toolkit root.
        if self.path in ("/", "/index.html"):
            self.path = "/barangay/index.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 4188)))
    ap.add_argument("--root", default=TOOLKIT_ROOT)
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(os.path.join(root, "barangay")):
        sys.exit("no barangay/ directory under %s" % root)

    handler = functools.partial(Handler, directory=root)
    with Server(("0.0.0.0", args.port), handler) as httpd:
        print("Barangay Kabudoy -> http://0.0.0.0:%d/  (root %s)" % (args.port, root), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
