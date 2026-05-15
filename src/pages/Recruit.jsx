import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

const DEFAULT = {
  concept: '',
  date: '',
  location: '',
  headcount: '',
  photographers: '',
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
  { key: 'photographers', label: '촬영 작가 수', placeholder: '예: 1명', icon: '📷' },
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

function drawCard(canvas, form, coverImg, showWatermark = true) {
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, '#3b82f6');
  accentGrad.addColorStop(0.5, '#8b5cf6');
  accentGrad.addColorStop(1, '#ec4899');

  const IMG_H = 780;
  let contentY;

  if (coverImg) {
    const iw = coverImg.naturalWidth || coverImg.width;
    const ih = coverImg.naturalHeight || coverImg.height;
    const scale = Math.max(W / iw, IMG_H / ih);
    const sw = iw * scale, sh = ih * scale;
    const sx = (W - sw) / 2, sy = (IMG_H - sh) / 2;
    ctx.drawImage(coverImg, sx, sy, sw, sh);

    const fadeGrad = ctx.createLinearGradient(0, IMG_H * 0.4, 0, IMG_H);
    fadeGrad.addColorStop(0, 'rgba(10,10,10,0)');
    fadeGrad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, 0, W, IMG_H);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, IMG_H, W, H - IMG_H);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillText('📷 촬영 모델 모집', W / 2, IMG_H - 40);
    ctx.shadowBlur = 0;

    ctx.fillStyle = accentGrad;
    ctx.fillRect(80, IMG_H + 10, W - 160, 3);
    contentY = IMG_H + 60;
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0a0a');
    grad.addColorStop(0.5, '#111118');
    grad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, W, 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📷 촬영 모델 모집', W / 2, 140);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 190);
    ctx.lineTo(W - 80, 190);
    ctx.stroke();
    contentY = 280;
  }

  let y = contentY;
  const LX = 100;
  const MAX_W = W - 200;

  FIELD_META.forEach(({ key, label, icon }) => {
    const value = form[key]?.trim();
    if (!value) return;

    ctx.fillStyle = '#888';
    ctx.font = '500 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${icon}  ${label}`, LX, y);
    y += 52;

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
    y += 28;
  });

  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, H - 6, W, 6);

  if (showWatermark) {
    ctx.fillStyle = '#444';
    ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PicPic', W / 2, H - 40);
  }
}

/* ─── Component ─── */

export default function Recruit() {
  const { pamId } = useParams(); // undefined = new
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState(DEFAULT);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const [coverSrc, setCoverSrc] = useState(null);
  const [coverImg, setCoverImg] = useState(null);
  const [coverFile, setCoverFile] = useState(null); // File object for upload
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(pamId || null);
  const [isDraft, setIsDraft] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [loaded, setLoaded] = useState(!pamId); // true if new
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (user === null) navigate(`/login?redirect=${pamId ? `/recruit/${pamId}` : '/recruit'}`, { replace: true });
  }, [user]);

  // Load existing pamphlet
  useEffect(() => {
    if (!pamId || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from('pamphlets')
        .select('*')
        .eq('id', pamId)
        .eq('user_id', user.id)
        .single();
      if (error || !data) { navigate('/recruit'); return; }
      setForm({ ...DEFAULT, ...(data.form_data || {}) });
      setIsDraft(data.is_draft);
      setSavedId(data.id);
      // Load cover image
      if (data.cover_url) {
        setCoverSrc(data.cover_url);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setCoverImg(img);
        img.src = data.cover_url;
      }
      setLoaded(true);
    })();
  }, [pamId, user]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  const hasContent = Object.values(form).some((v) => v.trim());

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // Auto-save draft (debounced 2s after last edit)
  useEffect(() => {
    if (!loaded || !user || !hasContent) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      savePamphlet(true);
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [form, loaded, user]);

  /* ── Save ── */
  const uploadCover = async (id) => {
    if (!coverFile) return coverSrc; // keep existing URL or null
    const path = `${user.id}/${id}`;
    // Remove old if exists
    await supabase.storage.from('pamphlet-covers').remove([path]);
    const { error } = await supabase.storage.from('pamphlet-covers').upload(path, coverFile, { upsert: true });
    if (error) { console.error('cover upload error', error); return coverSrc; }
    const { data } = supabase.storage.from('pamphlet-covers').getPublicUrl(path);
    return data.publicUrl;
  };

  const savePamphlet = async (asDraft = true) => {
    if (saving || !user) return;
    setSaving(true);
    try {
      let id = savedId;
      let coverUrl = coverSrc;

      if (!id) {
        // Create new
        const { data, error } = await supabase
          .from('pamphlets')
          .insert({ user_id: user.id, form_data: form, is_draft: asDraft })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
        setSavedId(id);
      }

      // Upload cover if new file
      if (coverFile) {
        coverUrl = await uploadCover(id);
        setCoverFile(null);
        setCoverSrc(coverUrl);
      }

      // Update
      const { error } = await supabase
        .from('pamphlets')
        .update({
          form_data: form,
          cover_url: coverUrl || null,
          is_draft: asDraft,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setIsDraft(asDraft);

      if (!asDraft) showToast('저장 완료');
      // Update URL if new pamphlet
      if (!pamId && id) {
        window.history.replaceState(null, '', `/recruit/${id}`);
      }
    } catch (err) {
      console.error('save error', err);
      if (!asDraft) showToast('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  /* ── Cover ── */
  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      setCoverSrc(url);
      const img = new Image();
      img.onload = () => setCoverImg(img);
      img.src = url;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeCover = () => {
    setCoverSrc(null);
    setCoverImg(null);
    setCoverFile(null);
  };

  /* ── Export ── */
  const handleCopyText = () => {
    const text = buildText(form);
    navigator.clipboard.writeText(text).then(() => showToast('텍스트 복사됨'));
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    drawCard(canvas, form, coverImg, showWatermark);
    const link = document.createElement('a');
    link.download = '모집_팜플렛.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('이미지 저장됨');
  };

  const handlePreview = () => {
    if (!hasContent) return;
    const canvas = canvasRef.current;
    drawCard(canvas, form, coverImg, showWatermark);
    setPreviewUrl(canvas.toDataURL('image/png'));
  };

  const filled = FIELD_META.filter(({ key }) => form[key]?.trim()).length;

  if (user === undefined || (!loaded && pamId)) {
    return <div className="login-page"><div style={{ color: 'var(--text-dim)' }}>불러오는 중...</div></div>;
  }

  return (
    <div className="recruit-page">
      <header className="post-header">
        <Link to="/my-pamphlets" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="내 팜플렛">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="post-title">모집 팜플렛</div>
        <div className="recruit-save-status">
          {saving ? '저장 중...' : savedId ? (isDraft ? '임시저장됨' : '저장됨') : ''}
        </div>
      </header>

      <div className="recruit-form">
        {/* Cover image upload */}
        <div className="recruit-field">
          <label className="recruit-label">🖼️ 시안 이미지 (선택)</label>
          {coverSrc ? (
            <div className="recruit-cover-preview">
              <img src={coverSrc} alt="시안" className="recruit-cover-img" />
              <button className="recruit-cover-remove" onClick={removeCover} aria-label="이미지 제거">✕</button>
            </div>
          ) : (
            <button className="recruit-cover-upload" onClick={() => fileRef.current?.click()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              <span>사진 추가</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
        </div>

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
        <div className="recruit-actions-top">
          <div className="recruit-filled">{filled}/{FIELD_META.length} 입력됨</div>
          <label className="recruit-watermark-check">
            <input type="checkbox" checked={showWatermark} onChange={(e) => setShowWatermark(e.target.checked)} />
            <span>PicPic 워터마크</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="recruit-save-btn" onClick={() => savePamphlet(false)} disabled={!hasContent || saving}>
            저장
          </button>
          <button className="btn-primary recruit-preview-btn" onClick={handlePreview} disabled={!hasContent}>미리보기</button>
        </div>
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
