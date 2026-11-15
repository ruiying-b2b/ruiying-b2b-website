"""本地预览服务器：模拟 Netlify 的改写规则。

Netlify 把 /products 映射到 products.html（_redirects 的 200 改写），
而 python 的 http.server 要求真实文件名。这里补上同样的映射，
避免用 /products.html 访问时前端路由认不出路径、误报 404。

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
        # 无扩展名且对应 .html 存在 → 指向 .html
        if not os.path.exists(full) and not os.path.splitext(candidate)[1]:
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
