#!/bin/bash
# PicPic AI 스케치 — 원클릭 실행 스크립트 (맥 전용)
# 설치부터 실행까지 전부 처리합니다. 종료는 Ctrl+C 한 번.
set -e
cd "$(dirname "$0")"

echo "▶ PicPic AI 스케치 시작"

# 1. Node 의존성
if [ ! -d node_modules ]; then
  echo "▶ npm 패키지 설치 중..."
  npm install
fi

# 2. Python 가상환경 + AI 라이브러리
cd local-ai
if [ ! -d venv ]; then
  echo "▶ Python 가상환경 생성 중..."
  python3 -m venv venv
fi
source venv/bin/activate
if ! python -c "import torch, diffusers, fastapi, peft" 2>/dev/null; then
  echo "▶ AI 라이브러리 설치 중 (몇 분 걸립니다)..."
  pip install -q --upgrade pip
  pip install -q -r requirements.txt
fi

# 3. AI 서버 (백그라운드)
echo "▶ AI 서버 시작 — 첫 실행은 모델 다운로드(~4GB)로 오래 걸립니다"
python server.py &
AI_PID=$!
cd ..

cleanup() {
  echo
  echo "▶ 종료 중..."
  kill $AI_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "▶ AI 서버 준비 대기 중... (모델 다운로드 진행 상황은 위 로그 참고)"
until curl -s http://localhost:5959/health > /dev/null 2>&1; do
  if ! kill -0 $AI_PID 2>/dev/null; then
    echo "✗ AI 서버가 시작에 실패했습니다. 위 에러 로그를 확인하세요."
    exit 1
  fi
  sleep 2
done
echo "✓ AI 서버 준비 완료 (http://localhost:5959)"

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || true)
if [ -n "$MAC_IP" ]; then
  echo "✓ 아이폰/아이패드(같은 와이파이): http://$MAC_IP:5173/sketch 접속,"
  echo "  엔진 설정에서 로컬 서버 주소를 http://$MAC_IP:5959 로 입력"
fi

# 4. 잠시 후 브라우저 자동 열기
( sleep 4; open "http://localhost:5173/sketch" ) &

# 5. 웹앱 실행 (포그라운드 — Ctrl+C로 전체 종료)
npm run dev -- --host
