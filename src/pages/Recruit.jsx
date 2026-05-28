import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

const DEFAULT = {
  title: '촬영 모델 모집',
  concept: '',
  purpose: '',
  date: '',
  duration: '',
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
  { key: 'purpose', label: '촬영 용도', placeholder: '예: 개인 포트폴리오 / 상업 (브랜드 룩북)', icon: '🎯' },
  { key: 'date', label: '촬영 일시', placeholder: '예: 5월 24일 (토) 오후 2시', icon: '📅' },
  { key: 'duration', label: '촬영 시간', placeholder: '예: 약 2~3시간', icon: '⏱️' },
  { key: 'location', label: '촬영 장소', placeholder: '예: 서울 성수동 카페', icon: '📍' },
  { key: 'headcount', label: '모집 인원', placeholder: '예: 1~2명', icon: '👤' },
  { key: 'photographers', label: '촬영 작가 수', placeholder: '예: 1명', icon: '📷' },
  { key: 'pay', label: '보수/조건', placeholder: '예: TFP (보정본 10장 제공)', icon: '💰' },
  { key: 'requirements', label: '지원 조건', placeholder: '예: 성별 무관, 20~30대', icon: '✅' },
  { key: 'contact', label: '연락 방법', placeholder: '예: DM 또는 카카오톡 open.kakao.com/...', icon: '💬' },
  { key: 'notes', label: '추가 안내', placeholder: '예: 우천 시 일정 변경 가능', icon: '📝', multiline: true },
  { key: 'author', label: '작성자', placeholder: '예: @walk.and.look', icon: '📸' },
];

const DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

function buildText(form) {
  const lines = [`📷 ${form.title || '촬영 모델 모집'}`, ''];
  FIELD_META.forEach(({ key, label, icon }) => {
    if (form[key]?.trim()) lines.push(`${icon} ${label}: ${form[key].trim()}`);
  });
  return lines.join('\n');
}

function drawCoverToCanvas(ctx, img, dx, dy, dw, dh, transform) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const rot = (transform.rotation || 0) % 360;
  const rad = (rot * Math.PI) / 180;
  const isRotated = rot === 90 || rot === 270;
  const ew = isRotated ? ih : iw;
  const eh = isRotated ? iw : ih;
  const baseScale = Math.max(dw / ew, dh / eh);
  const totalScale = baseScale * (transform.scale || 1);
  const worldW = ew * totalScale;
  const worldH = eh * totalScale;
  const ox = (dw - worldW) * transform.x;
  const oy = (dh - worldH) * transform.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.translate(dx + ox + worldW / 2, dy + oy + worldH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, (-iw * totalScale) / 2, (-ih * totalScale) / 2, iw * totalScale, ih * totalScale);
  ctx.restore();
}

function drawCard(canvas, form, covers, showWatermark = true, position = 'top', split = 1, dir = 'v') {
  const W = 1080, H = 1920;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, '#3b82f6');
  accentGrad.addColorStop(0.5, '#8b5cf6');
  accentGrad.addColorStop(1, '#ec4899');

  const title = `📷 ${form.title || '촬영 모델 모집'}`;
  const hasCovers = covers.some((c) => c.img);
  let contentY;

  if (hasCovers) {
    const isFull = position === 'fullbg';
    const imgH = isFull ? H : 780;

    // Draw cover images based on split direction
    if (dir === 'h' && split > 1) {
      const slotH = imgH / split;
      for (let i = 0; i < split; i++) {
        if (covers[i]?.img) drawCoverToCanvas(ctx, covers[i].img, 0, slotH * i, W, slotH, covers[i].transform);
      }
      ctx.fillStyle = isFull ? 'rgba(10,10,10,0.3)' : '#0a0a0a';
      for (let i = 1; i < split; i++) {
        ctx.fillRect(0, slotH * i - 2, W, 4);
      }
    } else {
      const slotW = W / split;
      for (let i = 0; i < split; i++) {
        if (covers[i]?.img) drawCoverToCanvas(ctx, covers[i].img, slotW * i, 0, slotW, imgH, covers[i].transform);
      }
      if (split >= 2) {
        ctx.fillStyle = isFull ? 'rgba(10,10,10,0.3)' : '#0a0a0a';
        for (let i = 1; i < split; i++) {
          ctx.fillRect(slotW * i - 2, 0, 4, imgH);
        }
      }
    }

    if (isFull) {
      // Full background: dark overlay + title at top
      const overlay = ctx.createLinearGradient(0, 0, 0, H);
      overlay.addColorStop(0, 'rgba(10,10,10,0.45)');
      overlay.addColorStop(0.25, 'rgba(10,10,10,0.55)');
      overlay.addColorStop(1, 'rgba(10,10,10,0.85)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 16;
      ctx.fillText(title, W / 2, 140);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accentGrad;
      ctx.fillRect(80, 180, W - 160, 3);
      contentY = 250;
    } else {
      // Top position: fade + background below + title
      const fadeGrad = ctx.createLinearGradient(0, imgH * 0.4, 0, imgH);
      fadeGrad.addColorStop(0, 'rgba(10,10,10,0)');
      fadeGrad.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, W, imgH);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, imgH, W, H - imgH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 12;
      ctx.fillText(title, W / 2, imgH - 40);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accentGrad;
      ctx.fillRect(80, imgH + 10, W - 160, 3);
      contentY = imgH + 60;
    }
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
    ctx.fillText(title, W / 2, 140);
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
    const isBg = position === 'fullbg' && hasCovers;
    ctx.fillStyle = isBg ? '#bbb' : '#888';
    ctx.font = '500 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    if (isBg) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; }
    ctx.fillText(`${icon}  ${label}`, LX, y);
    y += 52;
    ctx.fillStyle = '#fff';
    ctx.font = '400 38px -apple-system, BlinkMacSystemFont, sans-serif';
    if (isBg) { ctx.shadowBlur = 6; }
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
    ctx.shadowBlur = 0;
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
  const { pamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState(DEFAULT);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const [covers, setCovers] = useState([]); // [{src, img, file, transform}]
  const [cardPosition, setCardPosition] = useState('top'); // 'top' | 'fullbg'
  const [cardSplit, setCardSplit] = useState(1); // 1, 2, 3
  const [splitDir, setSplitDir] = useState('v'); // 'v' = 세로(좌우), 'h' = 가로(상하)
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [editingCoverIdx, setEditingCoverIdx] = useState(-1);
  const [editorTransform, setEditorTransform] = useState({ ...DEFAULT_TRANSFORM });
  const editorCanvasRef = useRef(null);
  const editorDragRef = useRef({ active: false, startX: 0, startY: 0, startT: null });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(pamId || null);
  const [isDraft, setIsDraft] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [loaded, setLoaded] = useState(!pamId);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const autoSaveTimer = useRef(null);

  const maxCovers = cardSplit;

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
      const { _coverTransform, _cardLayout, _cardPosition, _cardSplit, _splitDir, _coverTransforms, _coverUrls, ...formFields } = data.form_data || {};
      setForm({ ...DEFAULT, ...formFields });
      if (_cardPosition) {
        setCardPosition(_cardPosition);
        setCardSplit(_cardSplit || 1);
        setSplitDir(_splitDir || 'v');
      } else if (_cardLayout) {
        if (_cardLayout === 'fullbg') { setCardPosition('fullbg'); setCardSplit(1); }
        else if (_cardLayout === 'split2') { setCardPosition('top'); setCardSplit(2); }
        else if (_cardLayout === 'split3') { setCardPosition('top'); setCardSplit(3); }
      }

      // Backward-compatible cover loading
      const urls = _coverUrls || (data.cover_url ? [data.cover_url] : []);
      const transforms = _coverTransforms || (_coverTransform ? [_coverTransform] : []);
      if (urls.length > 0) {
        const items = urls.map((src, i) => ({
          src, img: null, file: null,
          transform: transforms[i] || { ...DEFAULT_TRANSFORM },
        }));
        setCovers(items);
        urls.forEach((url, i) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => setCovers((prev) => prev.map((c, j) => j === i ? { ...c, img } : c));
          img.src = url;
        });
      }
      setIsDraft(data.is_draft);
      setSavedId(data.id);
      setLoaded(true);
    })();
  }, [pamId, user]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  const hasContent = Object.entries(form).some(([k, v]) => k !== 'title' && v.trim());
  const hasAnything = hasContent || covers.length > 0 || (form.title.trim() && form.title.trim() !== DEFAULT.title);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // Auto-save (only when user has typed real content beyond defaults)
  useEffect(() => {
    if (!loaded || !user || !hasAnything) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { savePamphlet(true); }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [form, covers, cardPosition, cardSplit, splitDir, loaded, user]);

  // Truncate covers when layout changes to fewer slots
  useEffect(() => {
    setCovers((prev) => (prev.length > maxCovers ? prev.slice(0, maxCovers) : prev));
  }, [cardSplit, maxCovers]);

  /* ── Save ── */
  const uploadCovers = async (id) => {
    const urls = [];
    for (let i = 0; i < covers.length; i++) {
      const cover = covers[i];
      if (cover.file) {
        const path = `${user.id}/${id}_${i}`;
        await supabase.storage.from('pamphlet-covers').remove([path]);
        const { error } = await supabase.storage.from('pamphlet-covers').upload(path, cover.file, { upsert: true });
        if (error) { console.error('cover upload error', error); urls.push(cover.src); continue; }
        const { data } = supabase.storage.from('pamphlet-covers').getPublicUrl(path);
        urls.push(data.publicUrl);
      } else {
        urls.push(cover.src);
      }
    }
    return urls;
  };

  const savePamphlet = async (asDraft = true) => {
    if (saving || !user) return;
    setSaving(true);
    try {
      let id = savedId;
      const formData = {
        ...form,
        _cardPosition: cardPosition,
        _cardSplit: cardSplit,
        _splitDir: splitDir,
        _coverTransforms: covers.map((c) => c.transform),
      };

      if (!id) {
        const { data, error } = await supabase
          .from('pamphlets')
          .insert({ user_id: user.id, form_data: formData, is_draft: asDraft })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
        setSavedId(id);
      }

      const hasNewFiles = covers.some((c) => c.file);
      let coverUrls = covers.map((c) => c.src);
      if (hasNewFiles) {
        coverUrls = await uploadCovers(id);
        setCovers((prev) => prev.map((c, i) => ({ ...c, src: coverUrls[i] || c.src, file: null })));
      }

      const { error } = await supabase
        .from('pamphlets')
        .update({
          form_data: { ...formData, _coverUrls: coverUrls },
          cover_url: coverUrls[0] || null,
          is_draft: asDraft,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setIsDraft(asDraft);

      if (!asDraft) showToast('저장 완료');
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

  /* ── Cover management ── */
  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || covers.length >= maxCovers) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const img = new Image();
      img.onload = () => {
        setCovers((prev) => [...prev, { src, img, file, transform: { ...DEFAULT_TRANSFORM } }]);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeCover = (idx) => {
    setCovers((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ── Cover editor ── */
  const openCoverEditor = (idx) => {
    setEditingCoverIdx(idx);
    setEditorTransform({ ...covers[idx].transform });
    setShowCoverEditor(true);
  };

  const applyCoverEdit = () => {
    setCovers((prev) => prev.map((c, i) =>
      i === editingCoverIdx ? { ...c, transform: { ...editorTransform } } : c
    ));
    setShowCoverEditor(false);
    setEditingCoverIdx(-1);
  };

  const getEditorCanvasSize = () => {
    const imgH = cardPosition === 'fullbg' ? 1920 : 780;
    const aw = splitDir === 'h' ? 1080 : 1080 / cardSplit;
    const ah = splitDir === 'h' ? imgH / cardSplit : imgH;
    const s = Math.min(540 / aw, 600 / ah);
    return { w: Math.round(aw * s), h: Math.round(ah * s) };
  };

  useEffect(() => {
    if (!showCoverEditor || editingCoverIdx < 0) return;
    const cover = covers[editingCoverIdx];
    if (!cover?.img) return;
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    const { w, h } = getEditorCanvasSize();
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    drawCoverToCanvas(ctx, cover.img, 0, 0, w, h, editorTransform);
  }, [showCoverEditor, editingCoverIdx, covers, editorTransform, cardPosition, cardSplit, splitDir]);

  const handleEditorDragStart = (e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    editorDragRef.current = { active: true, startX: clientX, startY: clientY, startT: { ...editorTransform } };
  };

  const handleEditorDragMove = useCallback((e) => {
    if (!editorDragRef.current.active) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - editorDragRef.current.startX;
    const dy = clientY - editorDragRef.current.startY;
    const sensitivity = 0.003;
    const st = editorDragRef.current.startT;
    setEditorTransform((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(1, st.x - dx * sensitivity)),
      y: Math.max(0, Math.min(1, st.y - dy * sensitivity)),
    }));
  }, []);

  const handleEditorDragEnd = useCallback(() => {
    editorDragRef.current.active = false;
  }, []);

  useEffect(() => {
    if (!showCoverEditor) return;
    const onMove = (e) => handleEditorDragMove(e);
    const onEnd = () => handleEditorDragEnd();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [showCoverEditor, handleEditorDragMove, handleEditorDragEnd]);

  /* ── Export ── */
  const handleCopyText = () => {
    navigator.clipboard.writeText(buildText(form)).then(() => showToast('텍스트 복사됨'));
  };

  const handleDownloadImage = async () => {
    const canvas = canvasRef.current;
    drawCard(canvas, form, covers, showWatermark, cardPosition, cardSplit, splitDir);
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], '모집_팜플렛.png', { type: 'image/png' });
      if (navigator.share && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        await navigator.share({ files: [file] });
        showToast('이미지 저장됨');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = '모집_팜플렛.png';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        showToast('이미지 저장됨');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('저장 실패');
    }
  };

  const handlePreview = () => {
    if (!hasAnything) return;
    const canvas = canvasRef.current;
    drawCard(canvas, form, covers, showWatermark, cardPosition, cardSplit, splitDir);
    setPreviewUrl(canvas.toDataURL('image/png'));
  };

  const filled = FIELD_META.filter(({ key }) => form[key]?.trim()).length;

  if (user === undefined || (!loaded && pamId)) {
    return <div className="login-page"><div style={{ color: 'var(--text-dim)' }}>불러오는 중...</div></div>;
  }

  const editorCanvasSize = getEditorCanvasSize();

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
        {/* Title */}
        <div className="recruit-field">
          <label className="recruit-label">📷 제목</label>
          <input
            className="recruit-input recruit-title-input"
            type="text"
            placeholder="촬영 모델 모집"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        {/* Layout selector */}
        <div className="recruit-field">
          <label className="recruit-label">📐 레이아웃</label>
          <div className="recruit-layout-group">
            <div className="recruit-layout-row">
              <span className="recruit-layout-row-label">위치</span>
              <div className="recruit-layout-selector">
                <button className={`recruit-layout-opt${cardPosition === 'top' ? ' active' : ''}`} onClick={() => setCardPosition('top')}>
                  <span className="recruit-layout-icon">🖼</span><span>상단</span>
                </button>
                <button className={`recruit-layout-opt${cardPosition === 'fullbg' ? ' active' : ''}`} onClick={() => setCardPosition('fullbg')}>
                  <span className="recruit-layout-icon">🌅</span><span>전체</span>
                </button>
              </div>
            </div>
            <div className="recruit-layout-row">
              <span className="recruit-layout-row-label">분할</span>
              <div className="recruit-layout-selector">
                {[1, 2, 3].map((n) => (
                  <button key={n} className={`recruit-layout-opt${cardSplit === n ? ' active' : ''}`} onClick={() => setCardSplit(n)}>
                    <span className="recruit-layout-icon">{n === 1 ? '▮' : n === 2 ? '▮▮' : '▮▮▮'}</span><span>{n}분할</span>
                  </button>
                ))}
              </div>
            </div>
            {cardSplit > 1 && (
              <div className="recruit-layout-row">
                <span className="recruit-layout-row-label">방향</span>
                <div className="recruit-layout-selector">
                  <button className={`recruit-layout-opt${splitDir === 'v' ? ' active' : ''}`} onClick={() => setSplitDir('v')}>
                    <span className="recruit-layout-icon">▯▯</span><span>세로</span>
                  </button>
                  <button className={`recruit-layout-opt${splitDir === 'h' ? ' active' : ''}`} onClick={() => setSplitDir('h')}>
                    <span className="recruit-layout-icon">▬▬</span><span>가로</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cover images */}
        <div className="recruit-field">
          <label className="recruit-label">🖼️ 이미지 ({covers.length}/{maxCovers})</label>
          <div className="recruit-covers-grid">
            {covers.map((cover, i) => (
              <div key={i} className="recruit-cover-slot">
                <img src={cover.src} alt="" className="recruit-cover-img" onClick={() => openCoverEditor(i)} />
                <div className="recruit-cover-edit-hint" onClick={() => openCoverEditor(i)}>✏️</div>
                <button className="recruit-cover-remove" onClick={() => removeCover(i)}>✕</button>
              </div>
            ))}
            {covers.length < maxCovers && (
              <button className="recruit-cover-upload" onClick={() => fileRef.current?.click()}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                <span>추가</span>
              </button>
            )}
          </div>
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
          <button className="recruit-save-btn" onClick={() => savePamphlet(false)} disabled={!hasAnything || saving}>
            저장
          </button>
          <button className="btn-primary recruit-preview-btn" onClick={handlePreview} disabled={!hasAnything}>미리보기</button>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {showCoverEditor && editingCoverIdx >= 0 && covers[editingCoverIdx]?.img && (
        <div className="modal-overlay" onClick={() => { setShowCoverEditor(false); setEditingCoverIdx(-1); }}>
          <div className="cover-editor" onClick={(e) => e.stopPropagation()}>
            <div className="cover-editor-header">이미지 편집</div>
            <canvas
              ref={editorCanvasRef}
              className="cover-editor-canvas"
              style={{ aspectRatio: `${editorCanvasSize.w} / ${editorCanvasSize.h}` }}
              onMouseDown={handleEditorDragStart}
              onTouchStart={handleEditorDragStart}
            />
            <div className="cover-editor-hint">드래그하여 위치 조절</div>
            <div className="cover-editor-controls">
              <button
                className="cover-editor-ctrl-btn"
                onClick={() => setEditorTransform((p) => ({ ...p, rotation: (p.rotation + 90) % 360 }))}
              >
                🔄 회전
              </button>
              <button
                className="cover-editor-ctrl-btn"
                onClick={() => setEditorTransform({ ...DEFAULT_TRANSFORM })}
              >
                ↺ 초기화
              </button>
            </div>
            <div className="cover-editor-zoom">
              <span className="cover-editor-zoom-label">축소</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={editorTransform.scale}
                onChange={(e) => setEditorTransform((p) => ({ ...p, scale: parseFloat(e.target.value) }))}
                className="cover-editor-slider"
              />
              <span className="cover-editor-zoom-label">확대</span>
            </div>
            <div className="cover-editor-actions">
              <button className="cover-editor-cancel" onClick={() => { setShowCoverEditor(false); setEditingCoverIdx(-1); }}>취소</button>
              <button className="cover-editor-apply" onClick={applyCoverEdit}>적용</button>
            </div>
          </div>
        </div>
      )}

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
