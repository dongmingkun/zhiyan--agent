FROM python:3.11-slim
# v=20260911 引擎可视化图（Matplotlib）需要中文字体，否则中文标题渲染成方块。
# 与 engine.py 的 _CJK_FONT_CANDIDATES 中 Linux 路径 /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc 对应。
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000
EXPOSE 8000
CMD ["python", "run.py"]
