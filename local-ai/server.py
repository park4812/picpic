"""PicPic 로컬 AI 시안 서버 (Apple Silicon 전용)

스케치 이미지를 받아 LCM(Latent Consistency Model)으로 인물사진풍 시안을
생성해 돌려줍니다. fal.ai 대신 맥의 GPU(MPS)를 사용하므로 비용이 들지 않습니다.

실행:
    python server.py
    (또는 uvicorn server:app --host 0.0.0.0 --port 5959)

자세한 설치 방법은 README.md 참고.
"""
import base64
import io
import threading
from typing import Optional

import torch
from diffusers import AutoPipelineForImage2Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

MODEL_ID = "SimianLuo/LCM_Dreamshaper_v7"
SIZE = 512
PORT = 5959

device = "mps" if torch.backends.mps.is_available() else "cpu"
dtype = torch.float16 if device == "mps" else torch.float32

print(f"모델 로딩 중... ({MODEL_ID}, device={device})")
print("첫 실행은 모델 다운로드(약 4GB) 때문에 몇 분 걸릴 수 있습니다.")
pipe = AutoPipelineForImage2Image.from_pretrained(
    MODEL_ID, torch_dtype=dtype, safety_checker=None
)
pipe.to(device)
pipe.set_progress_bar_config(disable=True)
print("모델 로딩 완료. 첫 생성 요청은 워밍업 때문에 조금 느립니다.")

lock = threading.Lock()  # MPS는 동시 추론 불가 — 요청 직렬화

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class GenRequest(BaseModel):
    prompt: str
    image: str  # data URI 또는 base64
    strength: float = 0.8
    seed: Optional[int] = None
    num_inference_steps: int = 4
    guidance_scale: float = 1.0


def decode_image(data: str) -> Image.Image:
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
    return img.resize((SIZE, SIZE), Image.LANCZOS)


@app.get("/health")
def health():
    return {"ok": True, "device": device, "model": MODEL_ID}


@app.post("/generate")
def generate(req: GenRequest):
    try:
        init = decode_image(req.image)
    except Exception:
        raise HTTPException(status_code=400, detail="이미지 디코딩 실패")

    generator = (
        torch.Generator("cpu").manual_seed(req.seed) if req.seed is not None else None
    )
    # img2img 실제 스텝 수는 steps * strength 라서, 낮은 strength에서 0스텝이 되지 않게 보정
    steps = max(req.num_inference_steps, int(1 / max(req.strength, 0.05)) + 1)

    with lock:
        out = pipe(
            prompt=req.prompt,
            image=init,
            strength=req.strength,
            num_inference_steps=steps,
            guidance_scale=req.guidance_scale,
            generator=generator,
        ).images[0]

    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/jpeg;base64,{b64}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
