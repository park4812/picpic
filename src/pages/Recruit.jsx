import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

const DEFAULT = {
  concept: '',
  date: '',
  location: '',
  headcount: '',
  pay: '',
  requirements: '',
  contact: '',
  notes: '',
  author: '',
};

const FIELD_META = [
  { key: 'concept', label: '촬영 컨셉', placeholder: '예: 봄 감성 야외 인물 촬영', icon: '🎨' },
  { key: 'date', label: '촬영 일시', placeholder: '예: 5월 24일 (토) 오후 2시', icon: '📅' },
  { key: 'location', label: '촬영 장소', placeholder: '예: 서울 성수동 카페', icon: '📍' },
  { key: 'headcount', label: '모집 인원', placeholder: '예: 1~2명', icon: '👤' },
  { key: 'pay', label: '보수/조건', placeholder: '예: TFP (보정본 10장 제공)', icon: '💰' },
  { key: 'requirements', label: '지원 조건', placeholder: '예: 성별 무관, 20~30대', icon: '✅' },
  { key: 'contact', label: '연락 방법', placeholder: '예: DM 또는 카카오톡 open.kakao.com/...', icon: '💬' },
  { key: 'notes', label: '추가 안내', placeholder: '예: 우천 시 일정 변경 가능', icon: '📝', multiline: true },
  { key: 'author', label: '작성자', placeholder: '예: @walk.and.look', icon: '📸' },
];

function buildText(form) {
  const lines = ['📷 촬영 모델 모집', ''];
  FIELD_META.forEach(({ key, label, icon }) => {
    if (form[key]?.trim()) lines.push(`${icon} ${label}: ${form[key].trim()}`);
  });
  return lines.join('\n');
}

function drawCard(canvas, form) {
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a0a');
  grad.addColorStop(0.5, '#111118');
  grad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent line top
  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, '#3b82f6');
  accentGrad.addColorStop(0.5, '#8b5cf6');
  accentGrad.addColorStop(1, '#ec4899');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, W, 6);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📷 촬영 모델 모집', W / 2, 140);

  // Divider
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 190);
  ctx.lineTo(W - 80, 190);
  ctx.stroke();

  // Fields
  let y = 280;
  const LX = 100; // left margin
  const MAX_W = W - 200; // text wrap width

  FIELD_META.forEach(({ key, label, icon }) => {
    const value = form[key]?.trim();
    if (!value) return;

    // Label
    ctx.fillStyle = '#888';
    ctx.font = '500 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${icon}  ${label}`, LX, y);
    y += 52;

    // Value (word wrap)
    ctx.fillStyle = '#fff';
    ctx.font = '400 38px -apple-system, BlinkMacSystemFont, sans-serif';
    const words = value.split('');
    let line = '';
    for (const char of words) {
      const test = line + char;
      if (ctx.measureText(test).width > MAX_W) {
        ctx.fillText(line, LX, y);
        y += 52;
        line = char;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, LX, y); y += 52; }

    y += 28; // gap between fields
  });

  // Bottom accent line
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, H - 6, W, 6);

  // Watermark
  ctx.fillStyle = '#444';
  ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PicPic', W / 2, H - 40);
}

export default function Recruit() {
  const [form, setForm] = useState(DEFAULT);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  const hasContent = Object.values(form).some((v) => v.trim());

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleCopyText = () => {
    const text = buildText(form);
    navigator.clipboard.writeText(text).then(() => showToast('텍스트 복사됨'));
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    drawCard(canvas, form);
    const link = document.createElement('a');
    link.download = '모집_팜플렛.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('이미지 저장됨');
  };

  const handlePreview = () => {
    if (!hasContent) return;
    const canvas = canvasRef.current;
    drawCard(canvas, form);
    setPreviewUrl(canvas.toDataURL('image/png'));
  };

  const filled = FIELD_META.filter(({ key }) => form[key]?.trim()).length;

  return (
    <div className="recruit-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="post-title">모집 팜플렛</div>
        <div style={{ width: 36 }} />
      </header>

      <div className="recruit-form">
        {FIELD_META.map(({ key, label, placeholder, icon, multiline }) => (
          <div key={key} className="recruit-field">
            <label className="recruit-label">{icon} {label}</label>
            {multiline ? (
              <textarea
                className="recruit-input recruit-textarea"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                rows={3}
              />
            ) : (
              <input
                className="recruit-input"
                type="text"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="recruit-actions">
        <div className="recruit-filled">{filled}/{FIELD_META.length} 입력됨</div>
        <button className="btn-primary recruit-preview-btn" onClick={handlePreview} disabled={!hasContent}>미리보기</button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {previewUrl && (
        <div className="modal-overlay" onClick={() => setPreviewUrl(null)}>
          <div className="recruit-preview" onClick={(e) => e.stopPropagation()}>
            <div className="recruit-preview-card">
              <img src={previewUrl} alt="미리보기" className="recruit-canvas" />
            </div>
            <div className="recruit-export-bar">
              <button className="recruit-export-btn" onClick={handleCopyText}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                텍스트 복사
              </button>
              <button className="recruit-export-btn accent" onClick={handleDownloadImage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                이미지 저장
              </button>
            </div>
            <button className="recruit-close-btn" onClick={() => setPreviewUrl(null)}>닫기</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
