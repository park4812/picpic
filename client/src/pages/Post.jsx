import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPost, uploadImages, deleteImage, imageUrl } from '../api';
import socket from '../socket';

export default function Post() {
  const { postId } = useParams();
  const [post, setPost] = useState(null);
  const [images, setImages] = useState([]);
  const [selections, setSelections] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [dragState, setDragState] = useState({ dragging: null, over: null, insertBefore: null });
  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await getPost(postId);
      if (!mounted) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      setPost(data);
      setImages(data.images);
      setSelections(data.selections);
      setLoading(false);
    })();

    socket.connect();
    socket.emit('join-post', postId);

    socket.on('images-added', (newImages) => {
      setImages((prev) => [...prev, ...newImages]);
    });

    socket.on('image-deleted', ({ imageId }) => {
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
    });

    socket.on('selections-updated', (newSelections) => {
      setSelections(newSelections);
    });

    socket.on('online-count', (count) => {
      setOnlineCount(count);
    });

    return () => {
      mounted = false;
      socket.off('images-added');
      socket.off('image-deleted');
      socket.off('selections-updated');
      socket.off('online-count');
      socket.disconnect();
    };
  }, [postId]);

  const selectedImageIds = new Set(selections.map((s) => s.image_id));

  const getImageById = (id) => images.find((img) => img.id === id);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadImages(postId, files);
      showToast(`${files.length}장 업로드 완료`);
    } catch {
      showToast('업로드 실패');
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleSelect = (imageId) => {
    if (selectedImageIds.has(imageId)) {
      socket.emit('deselect-image', { postId, imageId });
    } else {
      socket.emit('select-image', { postId, imageId });
    }
  };

  const handleDeselect = (imageId) => {
    socket.emit('deselect-image', { postId, imageId });
  };

  const handleDelete = async (e, imageId) => {
    e.stopPropagation();
    await deleteImage(postId, imageId);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('링크 복사됨');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        showToast('링크 복사됨');
      } catch {
        showToast('공유 실패');
      }
    }
  };

  // --- Drag & Drop for reordering ---
  const handleDragStart = (e, imageId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', imageId);
    setDragState((s) => ({ ...s, dragging: imageId }));
  };

  const handleDragOver = (e, imageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (imageId !== dragState.dragging) {
      setDragState((s) => ({ ...s, over: imageId }));
    }
  };

  const handleDragEnd = () => {
    setDragState({ dragging: null, over: null, insertBefore: null });
  };

  const handleDrop = (e, targetImageId) => {
    e.preventDefault();
    const sourceImageId = e.dataTransfer.getData('text/plain');
    if (sourceImageId === targetImageId) return;

    const targetSel = selections.find((s) => s.image_id === targetImageId);
    if (targetSel) {
      socket.emit('reorder-selection', {
        postId,
        imageId: sourceImageId,
        newPosition: targetSel.position,
      });
    }
    handleDragEnd();
  };

  // --- Touch-based drag for mobile ---
  const touchState = useRef({ id: null, el: null, clone: null, startY: 0, startX: 0, moved: false });

  const handleTouchStart = (e, imageId) => {
    const touch = e.touches[0];
    touchState.current = {
      id: imageId,
      el: e.currentTarget,
      clone: null,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
    };
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
      clone.style.position = 'fixed';
      clone.style.zIndex = '300';
      clone.style.width = ts.el.offsetWidth + 'px';
      clone.style.height = ts.el.offsetHeight + 'px';
      clone.style.pointerEvents = 'none';
      clone.style.opacity = '0.85';
      clone.style.borderRadius = '8px';
      clone.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
      clone.style.transition = 'none';
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
      const thumbEl = target?.closest('.selected-thumb');
      const overId = thumbEl?.dataset.imageId;
      setDragState((s) => ({ ...s, dragging: ts.id, over: overId || null }));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const ts = touchState.current;
    if (ts.clone) {
      document.body.removeChild(ts.clone);
      ts.el.style.opacity = '';
    }

    if (ts.moved && dragState.over && dragState.over !== ts.id) {
      const targetSel = selections.find((s) => s.image_id === dragState.over);
      if (targetSel) {
        socket.emit('reorder-selection', {
          postId,
          imageId: ts.id,
          newPosition: targetSel.position,
        });
      }
    }

    touchState.current = { id: null, el: null, clone: null, startY: 0, startX: 0, moved: false };
    setDragState({ dragging: null, over: null, insertBefore: null });
  }, [dragState.over, selections, postId]);

  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchMove, handleTouchEnd]);

  // --- Pool drag to selection (add from pool to selection) ---
  const handlePoolDragStart = (e, imageId) => {
    if (selectedImageIds.has(imageId)) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', imageId);
    e.dataTransfer.setData('source', 'pool');
  };

  const handleSelectionAreaDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSelectionAreaDrop = (e) => {
    e.preventDefault();
    const imageId = e.dataTransfer.getData('text/plain');
    if (!selectedImageIds.has(imageId)) {
      socket.emit('select-image', { postId, imageId });
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        로딩 중...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="not-found">
        <h2>게시물을 찾을 수 없습니다</h2>
        <Link to="/">홈으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="post-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
        <div className="post-title">{post.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="online-badge">
            <span className="online-dot" />
            {onlineCount}
          </div>
          <button className="share-btn" onClick={handleShare}>공유</button>
        </div>
      </header>

      {/* Selected Images */}
      <div className="section-label">
        셀렉됨
        {selections.length > 0 && <span className="section-count">{selections.length}</span>}
      </div>
      <div
        className="selection-area"
        onDragOver={handleSelectionAreaDragOver}
        onDrop={handleSelectionAreaDrop}
      >
        {selections.length === 0 ? (
          <div className="selection-empty">
            아래에서 이미지를 탭하여 셀렉하세요
          </div>
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
                  onDragStart={(e) => handleDragStart(e, sel.image_id)}
                  onDragOver={(e) => handleDragOver(e, sel.image_id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, sel.image_id)}
                  onTouchStart={(e) => handleTouchStart(e, sel.image_id)}
                >
                  <img src={imageUrl(img.filename)} alt="" loading="lazy" />
                  <span className="selected-order">{idx + 1}</span>
                  <button
                    className="selected-remove"
                    onClick={(e) => { e.stopPropagation(); handleDeselect(sel.image_id); }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Images Pool */}
      <div className="section-label">
        전체 이미지
        {images.length > 0 && <span className="section-count">{images.length}</span>}
      </div>
      <div className="pool-area">
        {images.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '200px' }}>
            아래 버튼으로 이미지를 업로드하세요
          </div>
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
                <img src={imageUrl(img.filename)} alt="" loading="lazy" />
                <button className="delete-btn" onClick={(e) => handleDelete(e, img.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Upload Bar */}
      <div className="bottom-bar">
        <button
          className={`upload-btn${uploading ? ' uploading' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? '업로드 중...' : '📷 사진 추가'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
