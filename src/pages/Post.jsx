import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, generateId, storageUrl } from '../supabase';
import { getUid } from '../uid';

export default function Post() {
  const { postId } = useParams();
  const [post, setPost] = useState(null);
  const isOwner = post?.created_by === getUid();
  const [images, setImages] = useState([]);
  const [selections, setSelections] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: postData, error } = await supabase
        .from('posts').select('*').eq('id', postId).single();
      if (cancelled) return;
      if (error || !postData) { setNotFound(true); setLoading(false); return; }
      setPost(postData);
      const [imgRes, selRes] = await Promise.all([
        supabase.from('images').select('*').eq('post_id', postId).order('created_at'),
        supabase.from('selections').select('*').eq('post_id', postId).order('position'),
      ]);
      if (cancelled) return;
      setImages(imgRes.data || []);
      setSelections(selRes.data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    const channel = supabase.channel(`post-${postId}`, {
      config: { presence: { key: generateId(6) } },
    });

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'images', filter: `post_id=eq.${postId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setImages((prev) => prev.some((img) => img.id === payload.new.id) ? prev : [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setImages((prev) => prev.filter((img) => img.id !== payload.old.id));
            setSelections((prev) => prev.filter((s) => s.image_id !== payload.old.id));
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'selections', filter: `post_id=eq.${postId}` },
        () => {
          supabase.from('selections').select('*').eq('post_id', postId).order('position')
            .then(({ data }) => { if (data) setSelections(data); });
        }
      )
      .on('presence', { event: 'sync' }, () => {
        setOnlineCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ joined_at: Date.now() });
      });

    return () => { supabase.removeChannel(channel); };
  }, [postId]);

  const selectedImageIds = new Set(selections.map((s) => s.image_id));
  const getImageById = (id) => images.find((img) => img.id === id);

  const resizeImage = (file, maxSize = 960) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        resolve(file);
        return;
      }
      if (width > height) { height = Math.round(height * (maxSize / width)); width = maxSize; }
      else { width = Math.round(width * (maxSize / height)); height = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const rows = [];
      for (const file of files) {
        const resized = await resizeImage(file);
        const path = `${postId}/${generateId()}.jpg`;
        const { error: err } = await supabase.storage.from('post-images').upload(path, resized, { contentType: 'image/jpeg' });
        if (err) throw err;
        rows.push({ post_id: postId, storage_path: path, original_name: file.name });
      }
      const { error } = await supabase.from('images').insert(rows);
      if (error) throw error;
      showToast(`${files.length}장 업로드 완료`);
    } catch (err) {
      console.error(err);
      showToast('업로드 실패');
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleSelect = async (imageId) => {
    if (selectedImageIds.has(imageId)) {
      await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
    } else {
      const maxPos = selections.length > 0 ? Math.max(...selections.map((s) => s.position)) + 1 : 0;
      await supabase.from('selections').insert({ post_id: postId, image_id: imageId, position: maxPos });
    }
  };

  const handleDeselect = async (imageId) => {
    await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
  };

  const handleDelete = async (e, imageId) => {
    e.stopPropagation();
    const img = getImageById(imageId);
    if (!img) return;
    await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
    await supabase.storage.from('post-images').remove([img.storage_path]);
    await supabase.from('images').delete().eq('id', imageId);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else { await navigator.clipboard.writeText(url); showToast('링크 복사됨'); }
    } catch {
      try { await navigator.clipboard.writeText(url); showToast('링크 복사됨'); } catch {}
    }
  };

  // --- Desktop drag ---
  const handleDragStart = (e, imageId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', imageId);
    setDragState((s) => ({ ...s, dragging: imageId }));
  };
  const handleDragOver = (e, imageId) => {
    e.preventDefault();
    if (imageId !== dragState.dragging) setDragState((s) => ({ ...s, over: imageId }));
  };
  const handleDragEnd = () => setDragState({ dragging: null, over: null });
  const handleDrop = async (e, targetImageId) => {
    e.preventDefault();
    const sourceImageId = e.dataTransfer.getData('text/plain');
    if (sourceImageId === targetImageId) return;
    const targetSel = selections.find((s) => s.image_id === targetImageId);
    if (targetSel) {
      await supabase.rpc('reorder_selection', { p_post_id: postId, p_image_id: sourceImageId, p_new_position: targetSel.position });
    }
    handleDragEnd();
  };

  // --- Mobile touch drag ---
  const touchState = useRef({ id: null, el: null, clone: null, startY: 0, startX: 0, moved: false });

  const handleTouchStart = (e, imageId) => {
    const touch = e.touches[0];
    touchState.current = { id: imageId, el: e.currentTarget, clone: null, startX: touch.clientX, startY: touch.clientY, moved: false };
  };

  const handleTouchMove = useCallback((e) => {
    const ts = touchState.current;
    if (!ts.id) return;
    const touch = e.touches[0];
    const dx = touch.clientX - ts.startX;
    const dy = touch.clientY - ts.startY;

    if (!ts.moved && Math.abs(dy) > 8) {
      ts.moved = true;
      const clone = ts.el.cloneNode(true);
      Object.assign(clone.style, {
        position: 'fixed', zIndex: '300', width: ts.el.offsetWidth + 'px',
        height: ts.el.offsetHeight + 'px', pointerEvents: 'none', opacity: '0.85',
        borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', transition: 'none',
      });
      document.body.appendChild(clone);
      ts.clone = clone;
      ts.el.style.opacity = '0.3';
    }

    if (ts.clone) {
      e.preventDefault();
      const rect = ts.el.getBoundingClientRect();
      ts.clone.style.left = (rect.left + dx) + 'px';
      ts.clone.style.top = (rect.top + dy) + 'px';
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      setDragState((s) => ({ ...s, dragging: ts.id, over: target?.closest('.selected-thumb')?.dataset.imageId || null }));
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    const ts = touchState.current;
    if (ts.clone) { document.body.removeChild(ts.clone); ts.el.style.opacity = ''; }
    if (ts.moved && dragState.over && dragState.over !== ts.id) {
      const targetSel = selections.find((s) => s.image_id === dragState.over);
      if (targetSel) {
        await supabase.rpc('reorder_selection', { p_post_id: postId, p_image_id: ts.id, p_new_position: targetSel.position });
      }
    }
    touchState.current = { id: null, el: null, clone: null, startY: 0, startX: 0, moved: false };
    setDragState({ dragging: null, over: null });
  }, [dragState.over, selections, postId]);

  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => { document.removeEventListener('touchmove', handleTouchMove); document.removeEventListener('touchend', handleTouchEnd); };
  }, [handleTouchMove, handleTouchEnd]);

  // --- Pool drag to selection ---
  const handlePoolDragStart = (e, imageId) => {
    if (selectedImageIds.has(imageId)) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', imageId);
  };
  const handleSelectionAreaDragOver = (e) => { e.preventDefault(); };
  const handleSelectionAreaDrop = async (e) => {
    e.preventDefault();
    const imageId = e.dataTransfer.getData('text/plain');
    if (!selectedImageIds.has(imageId)) {
      const maxPos = selections.length > 0 ? Math.max(...selections.map((s) => s.position)) + 1 : 0;
      await supabase.from('selections').insert({ post_id: postId, image_id: imageId, position: maxPos });
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />로딩 중...</div>;
  if (notFound) return <div className="not-found"><h2>게시물을 찾을 수 없습니다</h2><Link to="/">홈으로 돌아가기</Link></div>;

  return (
    <div className="post-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
        <div className="post-title">{post.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="online-badge"><span className="online-dot" />{onlineCount}</div>
          <button className="share-btn" onClick={handleShare}>공유</button>
        </div>
      </header>

      <div className="section-label">
        셀렉됨 {selections.length > 0 && <span className="section-count">{selections.length}</span>}
      </div>
      <div className="selection-area" onDragOver={handleSelectionAreaDragOver} onDrop={handleSelectionAreaDrop}>
        {selections.length === 0 ? (
          <div className="selection-empty">아래에서 이미지를 탭하여 셀렉하세요</div>
        ) : (
          <div className="selection-grid">
            {selections.map((sel, idx) => {
              const img = getImageById(sel.image_id);
              if (!img) return null;
              return (
                <div
                  key={sel.image_id}
                  className={`selected-thumb${dragState.dragging === sel.image_id ? ' dragging' : ''}${dragState.over === sel.image_id && dragState.dragging !== sel.image_id ? ' drag-over' : ''}`}
                  data-image-id={sel.image_id}
                  draggable
                  onClick={() => handleDeselect(sel.image_id)}
                  onDragStart={(e) => handleDragStart(e, sel.image_id)}
                  onDragOver={(e) => handleDragOver(e, sel.image_id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, sel.image_id)}
                  onTouchStart={(e) => handleTouchStart(e, sel.image_id)}
                >
                  <img src={storageUrl(img.storage_path)} alt="" loading="lazy" />
                  <span className="selected-order">{idx + 1}</span>
                  <span className="selected-remove">×</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section-label">
        전체 이미지 {images.length > 0 && <span className="section-count">{images.length}</span>}
      </div>
      <div className="pool-area">
        {images.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '200px' }}>아래 버튼으로 이미지를 업로드하세요</div>
        ) : (
          <div className="pool-grid">
            {images.map((img) => (
              <div
                key={img.id}
                className={`pool-thumb${selectedImageIds.has(img.id) ? ' is-selected' : ''}`}
                onClick={() => handleSelect(img.id)}
                draggable={!selectedImageIds.has(img.id)}
                onDragStart={(e) => handlePoolDragStart(e, img.id)}
              >
                <img src={storageUrl(img.storage_path)} alt="" loading="lazy" />
                {isOwner && <button className="delete-btn" onClick={(e) => handleDelete(e, img.id)}>✕</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="bottom-bar">
          <button className={`upload-btn${uploading ? ' uploading' : ''}`} onClick={() => fileInputRef.current?.click()}>
            {uploading ? '업로드 중...' : '+ 사진 추가'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
