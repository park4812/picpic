# PicPic 로컬 AI 시안 서버

fal.ai 대신 **맥의 GPU로 직접 생성**하는 서버입니다. 비용이 들지 않습니다.
M3 Max 기준 512px 시안 한 장에 약 0.3~0.6초가 걸립니다.

## 1. 설치 (최초 1회)

Python 3.10 이상이 필요합니다 (`python3 --version`으로 확인,
없으면 `brew install python`).

```bash
cd local-ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 2. 서버 실행

```bash
cd local-ai
source venv/bin/activate
python server.py
```

- 첫 실행은 모델 다운로드(약 4GB) 때문에 몇 분 걸립니다.
- `http://localhost:5959/health` 가 열리면 준비 완료.
- 첫 생성 요청 한 번은 워밍업으로 느리고, 이후부터 빨라집니다.

## 3. 앱에서 사용

### 맥에서

1. 다른 터미널에서 앱 실행: `npm run dev`
2. `http://localhost:5173/sketch` 접속
3. 우측 상단 **AI 엔진 설정** → **로컬 서버(맥)** 선택 → 주소 `http://localhost:5959` 확인 후 저장

### 아이폰 / 아이패드에서 (같은 와이파이)

1. 맥 IP 확인: `ipconfig getifaddr en0` (예: `192.168.0.10`)
2. 맥에서 앱을 LAN 모드로 실행: `npm run dev:lan`
3. 아이폰에서 `http://192.168.0.10:5173/sketch` 접속
4. AI 엔진 설정 → 로컬 서버 → 주소를 `http://192.168.0.10:5959` 로 입력

> **주의**: 배포된 https 사이트(vercel)에서는 브라우저가 http 로컬 서버 호출을
> 차단합니다(mixed content). 로컬 모드는 위처럼 dev 서버로 접속해서 쓰고,
> 배포 사이트에서는 fal.ai 모드를 쓰세요. 보관함(시안 공유)은 어느 모드에서나
> 동일하게 동작합니다.

## 참고

- 구도 추종: [ControlNet scribble](https://huggingface.co/lllyasviel/control_v11p_sd15_scribble)
  — 스케치의 선과 구도를 그대로 따라가면서 사진풍으로 변환
- 베이스 모델: [Lykon/dreamshaper-8](https://huggingface.co/Lykon/dreamshaper-8)
  + [LCM-LoRA](https://huggingface.co/latent-consistency/lcm-lora-sdv1-5) (고속 생성)
- 앱의 "스케치 유지 ↔ AI 자유도" 슬라이더가 ControlNet 강도를 조절합니다
- 서버를 끄려면 터미널에서 `Ctrl+C`
