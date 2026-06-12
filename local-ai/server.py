"""PicPic 로컬 AI 시안 서버 (Apple Silicon 전용)

스케치의 선·구도를 ControlNet(scribble)으로 따라가면서 LCM으로 빠르게
인물사진풍 시안을 생성합니다. fal.ai 대신 맥의 GPU(MPS)를 사용합니다.

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
from diffusers import (
    ControlNetModel,
    LCMScheduler,
    StableDiffusionControlNetImg2ImgPipeline,
)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps
from pydantic import BaseModel

MODEL_ID = "emilianJR/epiCRealism"  # 실사(포토리얼) 특화 모델
CONTROLNET_ID = "lllyasviel/control_v11p_sd15_scribble"
LCM_LORA_ID = "latent-consistency/lcm-lora-sdv1-5"
SIZE = 512
HD_SIZE = 768
PORT = 5959

# 스케치 색상 힌트를 살리기 위한 img2img 강도 (구도는 ControlNet이 담당)
INIT_STRENGTH = 0.9

device = "mps" if torch.backends.mps.is_available() else "cpu"
dtype = torch.float16 if device == "mps" else torch.float32

print(f"모델 로딩 중... ({MODEL_ID} + ControlNet scribble, device={device})")
print("첫 실행은 모델 다운로드(약 3~4GB) 때문에 몇 분 걸릴 수 있습니다.")
controlnet = ControlNetModel.from_pretrained(CONTROLNET_ID, torch_dtype=dtype)
pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
    MODEL_ID,
    controlnet=controlnet,
    torch_dtype=dtype,
    safety_checker=None,
    requires_safety_checker=False,
)
pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
pipe.load_lora_weights(LCM_LORA_ID)
pipe.fuse_lora()
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
    negative_prompt: Optional[str] = None
    strength: float = 0.8  # 앱의 "스케치 유지 ↔ AI 자유도" 슬라이더 값
    seed: Optional[int] = None
    num_inference_steps: int = 5
    guidance_scale: float = 1.5
    hd: bool = False  # 고품질 렌더 (768px, 8스텝)


def decode_image(data: str, size: int) -> Image.Image:
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
    return img.resize((size, size), Image.LANCZOS)


def to_scribble(img: Image.Image) -> Image.Image:
    """캔버스(흰 배경, 어두운 선) → ControlNet scribble 입력(검은 배경, 흰 선)"""
    return ImageOps.invert(img.convert("L")).convert("RGB")


@app.get("/health")
def health():
    return {"ok": True, "device": device, "model": MODEL_ID, "controlnet": CONTROLNET_ID}


@app.post("/generate")
def generate(req: GenRequest):
    size = HD_SIZE if req.hd else SIZE
    try:
        init = decode_image(req.image, size)
    except Exception:
        raise HTTPException(status_code=400, detail="이미지 디코딩 실패")

    generator = (
        torch.Generator("cpu").manual_seed(req.seed) if req.seed is not None else None
    )
    # 슬라이더 값(0.4=스케치 유지 ~ 0.95=AI 자유도)을 ControlNet 강도로 변환
    control_scale = max(0.35, min(1.1, 1.35 - req.strength))
    steps = max(req.num_inference_steps, 8 if req.hd else 4)

    with lock:
        out = pipe(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            image=init,
            control_image=to_scribble(init),
            strength=INIT_STRENGTH,
            num_inference_steps=steps,
            guidance_scale=max(req.guidance_scale, 1.0),
            controlnet_conditioning_scale=control_scale,
            generator=generator,
        ).images[0]

    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/jpeg;base64,{b64}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
