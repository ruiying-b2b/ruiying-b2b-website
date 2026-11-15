"""本地预览服务器：模拟线上（GitHub Pages）的路径行为。

线上路径是目录形式：/products/ → products/index.html。
python 的 http.server 不会自动找目录下的 index.html，所以这里补上两层映射：
  1) 目录 → 目录下的 index.html（/products/ 和 /products 都能打开）
  2) 无扩展名且存在同名 .html → 指向 .html（兼容平铺布局）
否则用 /products.html 访问时前端路由认不出路径、误报 404。

用法： python serve.py [端口] [目录]
例如： python serve.py 8089 dist
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        raw = path.split("?")[0].split("#")[0]
        candidate = raw.strip("/")
        if candidate == "":
            candidate = "index.html"
        full = os.path.join(ROOT, candidate)
        # 目录形式： /products/ 或 /products → products/index.html
        if os.path.isdir(full) and os.path.exists(os.path.join(full, "index.html")):
            path = "/" + candidate.rstrip("/") + "/index.html"
        # 无扩展名且对应 .html 存在 → 指向 .html
        elif not os.path.exists(full) and not os.path.splitext(candidate)[1]:
            html = full + ".html"
            if os.path.exists(html):
                path = "/" + candidate + ".html"
        return super().translate_path(path)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    os.chdir(ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {ROOT} on http://127.0.0.1:{port}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
