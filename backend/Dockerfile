FROM python:3.11-slim

# System deps: ffmpeg (video/audio), ImageMagick (TextClip), font for PIL
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    libmagic1 \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# ImageMagick policy fix — allow reads/writes needed by moviepy TextClip
RUN sed -i 's|<policy domain="path" rights="none" pattern="@\*"/>||' /etc/ImageMagick-6/policy.xml 2>/dev/null || true && \
    sed -i 's|rights="none" pattern="\*"|rights="read|write" pattern="@*"|' /etc/ImageMagick-6/policy.xml 2>/dev/null || true

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/workspace

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
