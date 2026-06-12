import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fal } from '@fal-ai/client';

const CANVAS_SIZE = 512;
const FAL_KEY_STORAGE = 'picpic_fal_key';
const MAX_UNDO = 30;

const PRESETS = [
  {
    id: 'headshot',
    label: '스튜디오 헤드샷',
    prompt:
      'professional studio portrait photograph, headshot, soft key lighting, seamless gray backdrop, 85mm lens, shallow depth of field, photorealistic, high detail skin',
  },
  {
    id: 'outdoor',
    label: '야외 자연광',
    prompt:
      'outdoor portrait photograph, golden hour natural light, soft bokeh background, candid mood, photorealistic, 50mm lens',
  },
  {
    id: 'bw',
    label: '흑백 프로필',
    prompt:
      'black and white portrait photograph, dramatic side lighting, dark background, film grain, photorealistic, fine art',
  },
  {
    id: 'fashion',
    label: '전신 화보',
    prompt:
      'full body fashion editorial photograph, studio strobe lighting, clean background, magazine style, photorealistic',
  },
  {
    id: 'snap',
    label: '거리 스냅',
    prompt:
      'street snap portrait photograph, urban background, natural daylight, candid pose, photorealistic, 35mm lens',
  },
];

const NEGATIVE_PROMPT =
  'cartoon, illustration, anime, drawing, painting, sketch, deformed, distorted face, extra limbs, low quality, blurry, watermark, text';

const COLORS = ['#000000', '#7a7a7a', '#ffffff', '#c93c3c', '#3c6dc9', '#3cc95f', '#e0c04a', '#8a5a32', '#e8b89a'];
const BRUSH_SIZES = [4, 9, 18, 32];

export default function Sketch() {
  const [falKey, setFalKey] = useState(() => localStorage.getItem(FAL_KEY_STORAGE) || '');
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [presetId, setPresetId] = useState('headshot');
  const [prompt, setPrompt] = useState('');
  const [strength, setStrength] = useState(0.82);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef = useRef(null);
  const connRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef(null);
  const undoStackRef = useRef([]);

  // 캔버스 초기화 (흰 배경)
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  // fal 실시간 연결 (키 변경 시 재연결)
  useEffect(() => {
    if (!falKey) return;
    fal.config({ credentials: falKey });
    const conn = fal.realtime.connect('fal-ai/lcm-sd15-i2i', {
      connectionKey: 'picpic-sketch',
      throttleInterval: 128,
      onResult: (result) => {
        const img = result?.images?.[0];
        if (img?.url) {
          setResultUrl(img.url);
          setError(null);
        }
        setBusy(false);
      },
      onError: (err) => {
        console.error(err);
        setBusy(false);
        setError('생성 오류 — API 키와 크레딧을 확인해주세요');
      },
    });
    connRef.current = conn;
    return () => {
      try { conn.close(); } catch { /* already closed */ }
      connRef.current = null;
    };
  }, [falKey]);

  const buildPrompt = useCallback(() => {
    const preset = PRESETS.find((p) => p.id === presetId);
    return [preset?.prompt, prompt.trim()].filter(Boolean).join(', ');
  }, [presetId, prompt]);

  const generate = useCallback(() => {
    const conn = connRef.current;
    const canvas = canvasRef.current;
    if (!conn || !canvas) return;
    setBusy(true);
    conn.send({
      prompt: buildPrompt(),
      negative_prompt: NEGATIVE_PROMPT,
      image_url: canvas.toDataURL('image/jpeg', 0.75),
      strength,
      seed,
      num_inference_steps: 4,
      guidance_scale: 1,
      enable_safety_checks: false,
    });
  }, [buildPrompt, strength, seed]);

  // 프롬프트/옵션 변경 시 디바운스 재생성
  useEffect(() => {
    if (!falKey || !hasDrawn) return;
    const t = setTimeout(generate, 350);
    return () => clearTimeout(t);
  }, [generate, falKey, hasDrawn]);

  // --- 드로잉 ---
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const pushUndo = () => {
    const stack = undoStackRef.current;
    stack.push(canvasRef.current.getContext('2d').getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
    if (stack.length > MAX_UNDO) stack.shift();
  };

  const drawSegment = (from, to) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 2.5 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    drawingRef.current = true;
    const pos = getPos(e);
    lastPosRef.current = pos;
    drawSegment(pos, { x: pos.x + 0.01, y: pos.y + 0.01 });
    setHasDrawn(true);
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    const pos = getPos(e);
    drawSegment(lastPosRef.current, pos);
    lastPosRef.current = pos;
    if (falKey) generate(); // 전송은 throttleInterval로 자동 제한됨
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (falKey) generate();
  };

  const handleUndo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    canvasRef.current.getContext('2d').putImageData(prev, 0, 0);
    if (falKey) generate();
  };

  const handleClear = () => {
    pushUndo();
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (falKey) generate();
  };

  // --- 결과 저장 ---
  const handleDownload = async () => {
    if (!resultUrl) return;
    try {
      const blob = resultUrl.startsWith('data:')
        ? await (await fetch(resultUrl)).blob()
        : await (await fetch(resultUrl, { mode: 'cors' })).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `picpic-sian-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // CORS 차단 시 새 탭으로 열기
      window.open(resultUrl, '_blank');
    }
  };

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(FAL_KEY_STORAGE, k);
    setFalKey(k);
    setKeyModalOpen(false);
    setKeyInput('');
  };

  return (
    <div className="sketch-page">
      <header className="sketch-header">
        <Link to="/" className="sketch-back" aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="sketch-title">
          AI 촬영 시안 스케치
          <span className="sketch-title-sub">그리면 실시간으로 인물사진 시안이 생성됩니다</span>
        </div>
        <button className="sketch-key-btn" onClick={() => setKeyModalOpen(true)}>
          {falKey ? 'API 키 ✓' : 'API 키 설정'}
        </button>
      </header>

      {/* 스타일 프리셋 */}
      <div className="sketch-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`sketch-preset ${presetId === p.id ? 'active' : ''}`}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="sketch-panes">
        {/* 캔버스 패널 */}
        <div className="sketch-pane">
          <div className="sketch-pane-label">
            스케치
            <div className="sketch-tools">
              <button className={`sketch-tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="펜">✏️</button>
              <button className={`sketch-tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="지우개">🧽</button>
              <button className="sketch-tool" onClick={handleUndo} title="되돌리기">↩️</button>
              <button className="sketch-tool" onClick={handleClear} title="전체 지우기">🗑️</button>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="sketch-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div className="sketch-brush-row">
            <div className="sketch-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`sketch-color ${color === c && tool === 'pen' ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setColor(c); setTool('pen'); }}
                  aria-label={`색상 ${c}`}
                />
              ))}
            </div>
            <div className="sketch-sizes">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  className={`sketch-size ${brushSize === s ? 'active' : ''}`}
                  onClick={() => setBrushSize(s)}
                  aria-label={`굵기 ${s}`}
                >
                  <span style={{ width: Math.min(s, 20), height: Math.min(s, 20) }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 결과 패널 */}
        <div className="sketch-pane">
          <div className="sketch-pane-label">
            AI 시안
            <span className={`sketch-status ${busy ? 'busy' : ''}`}>
              {!falKey ? 'API 키 필요' : busy ? '생성 중…' : resultUrl ? '완료' : '대기 중'}
            </span>
          </div>
          <div className="sketch-result">
            {resultUrl ? (
              <img src={resultUrl} alt="AI 생성 시안" draggable={false} />
            ) : (
              <div className="sketch-result-empty">
                {falKey
                  ? '왼쪽 캔버스에 포즈와 구도를 그려보세요'
                  : 'fal.ai API 키를 등록하면 시작됩니다'}
              </div>
            )}
            {!falKey && (
              <button className="btn-primary sketch-result-cta" onClick={() => setKeyModalOpen(true)}>
                API 키 등록하기
              </button>
            )}
          </div>
          <div className="sketch-result-actions">
            <button className="sketch-action-btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} disabled={!falKey}>
              🎲 다른 느낌으로
            </button>
            <button className="sketch-action-btn" onClick={handleDownload} disabled={!resultUrl}>
              ⬇️ 저장
            </button>
          </div>
        </div>
      </div>

      {/* 프롬프트 + 옵션 */}
      <div className="sketch-controls">
        <input
          className="sketch-prompt"
          type="text"
          placeholder="추가 묘사 (영문 권장 — 예: woman in white dress, smiling)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <label className="sketch-strength">
          <span>스케치 유지</span>
          <input
            type="range"
            min="0.4"
            max="0.95"
            step="0.05"
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
          />
          <span>AI 자유도</span>
        </label>
      </div>

      {error && <div className="toast">{error}</div>}

      {/* API 키 모달 */}
      {keyModalOpen && (
        <div className="sketch-modal-backdrop" onClick={() => setKeyModalOpen(false)}>
          <div className="sketch-modal" onClick={(e) => e.stopPropagation()}>
            <h3>fal.ai API 키</h3>
            <p>
              실시간 생성에는{' '}
              <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener noreferrer">fal.ai</a>
              {' '}API 키가 필요합니다. 키는 이 브라우저에만 저장됩니다.
            </p>
            <input
              className="home-input"
              type="password"
              placeholder="key_id:key_secret"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              autoFocus
            />
            <div className="sketch-modal-actions">
              {falKey && (
                <button
                  className="sketch-action-btn danger"
                  onClick={() => {
                    localStorage.removeItem(FAL_KEY_STORAGE);
                    setFalKey('');
                    setKeyModalOpen(false);
                  }}
                >
                  키 삭제
                </button>
              )}
              <button className="sketch-action-btn" onClick={() => setKeyModalOpen(false)}>취소</button>
              <button className="btn-primary sketch-modal-save" onClick={saveKey} disabled={!keyInput.trim()}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
