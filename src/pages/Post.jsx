import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase, generateId, storageUrl } from '../supabase';
import { hashPassword } from '../crypto';
import { useAuth } from '../auth';

export default function Post() {
  const { postId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [images, setImages] = useState([]);
  const [selections, setSelections] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [toast, setToast] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [dragState, setDragState] = useState({ dragging: null, over: null });
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [showSnapshotSave, setShowSnapshotSave] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [justSelected, setJustSelected] = useState(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [myPicks, setMyPicks] = useState([]);
  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);
  const viewerTouchRef = useRef({ startX: 0, startY: 0 });
  const poolLongPress = useRef({ timer: null, triggered: false });

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
      setSelectionLocked(postData.selection_locked || false);
      // Ownership check: account-based first, then session-based
      const sessionAuth = sessionStorage.getItem(`picpic_auth_${postId}`);
      if (user && postData.user_id && postData.user_id === user.id) {
        setIsOwner(true);
      } else if (sessionAuth) {
        setIsOwner(true);
        // Auto-link: user is logged in + has password auth + post not linked yet
        if (user && !postData.user_id) {
          const { data: linked, error: linkErr } = await supabase
            .from('posts')
            .update({ user_id: user.id, creator_email: user.email })
            .eq('id', postId)
            .select('user_id')
            .maybeSingle();
          if (linkErr) {
            console.error('auto-link error:', linkErr.message, linkErr);
          } else if (!linked) {
            console.error('auto-link: update returned 0 rows (possible RLS block)');
          } else if (!cancelled) {
            setPost((prev) => prev ? { ...prev, user_id: user.id } : prev);
          }
        }
      }
      // Update last accessed timestamp (fire and forget)
      supabase.from('posts').update({ last_accessed_at: new Date().toISOString() }).eq('id', postId).then();
      const [imgRes, selRes, snapRes] = await Promise.all([
        supabase.from('images').select('*').eq('post_id', postId).order('created_at'),
        supabase.from('selections').select('*').eq('post_id', postId).order('position'),
        supabase.from('snapshots').select('*').eq('post_id', postId).order('created_at'),
      ]);
      if (cancelled) return;
      if (imgRes.error) console.error('images load error:', imgRes.error);
      if (selRes.error) console.error('selections load error:', selRes.error);
      if (snapRes.error) console.error('snapshots load error:', snapRes.error);
      setImages(imgRes.data || []);
      setSelections(selRes.data || []);
      setSnapshots(snapRes.data || []);
      setLoading(false);
      const savedPicks = sessionStorage.getItem(`picpic_mypicks_${postId}`);
      if (savedPicks) try { setMyPicks(JSON.parse(savedPicks)); } catch {}
    }
    load();
    return () => { cancelled = true; };
  }, [postId, user]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const hash = await hashPassword(passwordInput);
    const { data } = await supabase.rpc('verify_post_password', { p_post_id: postId, p_password_hash: hash });
    if (data) {
      setIsOwner(true);
      sessionStorage.setItem(`picpic_auth_${postId}`, '1');
      setShowPasswordModal(false);
      setPasswordInput('');
      showToast('관리자 모드 활성화');
    } else {
      showToast('비밀번호가 틀렸습니다');
    }
  };

  // Derived: show "계정 연결" when owner via password but post not linked to any account
  const canLinkAccount = isOwner && post && !post.user_id;

  const handleLinkAccount = () => {
    if (!post) return;
    if (user) {
      // Logged in → link directly
      (async () => {
        const { data: linked, error } = await supabase
          .from('posts')
          .update({ user_id: user.id, creator_email: user.email })
          .eq('id', postId)
          .select('user_id')
          .maybeSingle();
        if (error) {
          console.error('link failed:', error);
          showToast(`연결 실패: ${error.message}`);
          return;
        }
        if (!linked) {
          showToast('연결 실패: 권한 없음 (RLS)');
          return;
        }
        setPost((prev) => ({ ...prev, user_id: user.id }));
        showToast('내 계정에 연결됨');
      })();
    } else {
      // Not logged in → go to login, then come back
      navigate(`/login?redirect=/p/${postId}`);
    }
  };

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snapshots', filter: `post_id=eq.${postId}` },
        () => {
          supabase.from('snapshots').select('*').eq('post_id', postId).order('created_at')
            .then(({ data }) => { if (data) setSnapshots(data); });
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
  const canEditSelection = !selectionLocked || isOwner;
  const myPickSet = new Set(myPicks);

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
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`${i + 1}/${files.length}장`);
        const resized = await resizeImage(files[i]);
        const path = `${postId}/${generateId()}.jpg`;
        const { error: err } = await supabase.storage.from('post-images').upload(path, resized, { contentType: 'image/jpeg' });
        if (err) throw err;
        rows.push({ post_id: postId, storage_path: path, original_name: files[i].name });
      }
      const { error } = await supabase.from('images').insert(rows);
      if (error) throw error;
      showToast(`${files.length}장 업로드 완료`);
    } catch (err) {
      console.error(err);
      showToast('업로드 실패');
    }
    setUploading(false);
    setUploadProgress('');
    e.target.value = '';
  };

  const handleSelect = async (imageId) => {
    if (selectedImageIds.has(imageId)) {
      setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
      const { error } = await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
      if (error) { console.error('deselect error:', error); showToast('셀렉 해제 실패: ' + error.message); }
    } else {
      const maxPos = selections.length > 0 ? Math.max(...selections.map((s) => s.position)) + 1 : 0;
      setSelections((prev) => [...prev, { post_id: postId, image_id: imageId, position: maxPos }]);
      setJustSelected(imageId);
      setTimeout(() => setJustSelected(null), 300);
      const { error } = await supabase.from('selections').insert({ post_id: postId, image_id: imageId, position: maxPos });
      if (error) { console.error('select error:', error); showToast('셀렉 실패: ' + error.message); }
    }
  };

  const handleDeselect = async (imageId) => {
    setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
    await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
  };

  const handleDelete = async (e, imageId) => {
    e.stopPropagation();
    if (!confirm('이 이미지를 삭제할까요?')) return;
    const img = getImageById(imageId);
    if (!img) return;
    setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
    await supabase.storage.from('post-images').remove([img.storage_path]);
    await supabase.from('images').delete().eq('id', imageId);
  };

  // --- Snapshots ---
  const handleSaveSnapshot = async (e) => {
    e.preventDefault();
    const isMyPick = selectionLocked && !isOwner;
    const imageIds = isMyPick ? myPicks : selections.map((s) => s.image_id);
    if (!imageIds.length) { showToast('셀렉된 이미지가 없습니다'); return; }
    const name = snapshotName.trim() || (isMyPick ? `제안 ${snapshots.length + 1}` : `스냅샷 ${snapshots.length + 1}`);
    const { data } = await supabase.from('snapshots').insert({ post_id: postId, name, image_ids: imageIds }).select().single();
    if (data) setSnapshots((prev) => [...prev, data]);
    setSnapshotName('');
    setShowSnapshotSave(false);
    showToast(`"${name}" 저장됨`);
  };

  const handleLoadSnapshot = async (snapshot) => {
    if (selections.length > 0 && !confirm(`현재 셀렉을 "${snapshot.name}" 스냅샷으로 교체할까요?`)) return;
    await supabase.from('selections').delete().eq('post_id', postId);
    const rows = snapshot.image_ids.map((imageId, i) => ({
      post_id: postId, image_id: imageId, position: i,
    }));
    if (rows.length) await supabase.from('selections').insert(rows);
    setSelections(rows);
    setViewer(null);
    showToast(`"${snapshot.name}" 불러옴`);
  };

  const handleDeleteSnapshot = async (snapshot) => {
    if (!confirm(`"${snapshot.name}" 스냅샷을 삭제할까요?`)) return;
    setSnapshots((prev) => prev.filter((s) => s.id !== snapshot.id));
    await supabase.from('snapshots').delete().eq('id', snapshot.id);
  };

  // --- Selection Lock ---
  const toggleLock = async () => {
    const newLocked = !selectionLocked;
    setSelectionLocked(newLocked);
    await supabase.from('posts').update({ selection_locked: newLocked }).eq('id', postId);
    showToast(newLocked ? '셀렉이 잠겼습니다' : '셀렉이 열렸습니다');
  };

  const handleMyPick = (imageId) => {
    setMyPicks((prev) => {
      const next = prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId];
      sessionStorage.setItem(`picpic_mypicks_${postId}`, JSON.stringify(next));
      return next;
    });
  };

  const openMyPicksViewer = (startIndex = 0) => {
    if (!myPicks.length) return;
    setViewer({ mode: 'view', index: startIndex, imageIds: myPicks });
  };

  // --- Image Viewer ---
  const openSelectionViewer = (startIndex = 0) => {
    if (!selections.length) return;
    setViewer({ mode: 'view', index: startIndex, imageIds: selections.map((s) => s.image_id) });
  };

  const openCompareViewer = (snapshot) => {
    setViewer({
      mode: 'compare', index: 0,
      imageIds: selections.map((s) => s.image_id),
      compareImageIds: snapshot.image_ids,
      snapshotName: snapshot.name,
    });
  };

  const navigateViewer = useCallback((dir) => {
    setViewer((prev) => {
      if (!prev) return null;
      const total = prev.mode === 'compare'
        ? Math.max(prev.imageIds.length, prev.compareImageIds.length)
        : prev.imageIds.length;
      const next = prev.index + dir;
      if (next < 0 || next >= total) return prev;
      return { ...prev, index: next };
    });
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else { await navigator.clipboard.writeText(url); showToast('링크 복사됨'); }
    } catch {
      try { await navigator.clipboard.writeText(url); showToast('링크 복사됨'); } catch {}
    }
  };

  // --- Reorder: move source to target's position, shift others ---
  const doReorder = async (sourceImageId, targetImageId) => {
    const ordered = [...selections];
    const srcIdx = ordered.findIndex((s) => s.image_id === sourceImageId);
    const tgtIdx = ordered.findIndex((s) => s.image_id === targetImageId);
    if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return;

    const [moved] = ordered.splice(srcIdx, 1);
    ordered.splice(tgtIdx, 0, moved);
    const updated = ordered.map((s, i) => ({ ...s, position: i }));
    setSelections(updated);

    await Promise.all(updated.map((s) =>
      supabase.from('selections').update({ position: s.position }).eq('id', s.id)
    ));
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
    if (sourceImageId !== targetImageId) await doReorder(sourceImageId, targetImageId);
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
      await doReorder(ts.id, dragState.over);
    }
    touchState.current = { id: null, el: null, clone: null, startY: 0, startX: 0, moved: false };
    setDragState({ dragging: null, over: null });
  }, [dragState.over, selections, postId]);

  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => { document.removeEventListener('touchmove', handleTouchMove); document.removeEventListener('touchend', handleTouchEnd); };
  }, [handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (viewer) setViewer(null);
        else if (showSnapshotSave) setShowSnapshotSave(false);
        else if (showPasswordModal) setShowPasswordModal(false);
      }
      if (viewer) {
        if (e.key === 'ArrowLeft') navigateViewer(-1);
        if (e.key === 'ArrowRight') navigateViewer(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewer, showSnapshotSave, showPasswordModal, navigateViewer]);

  useEffect(() => {
    if (viewer) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [viewer]);

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
    <div className={`post-page${isOwner ? ' has-bottom-bar' : ''}`}>
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className="post-title">{post.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="online-badge"><span className="online-dot" />{onlineCount}</div>
          {canLinkAccount && (
            <button className="share-btn link-btn" onClick={handleLinkAccount}>계정 연결</button>
          )}
          <button className={`share-btn auth-btn${isOwner ? ' authed' : ''}`} onClick={isOwner
            ? () => { setIsOwner(false); sessionStorage.removeItem(`picpic_auth_${postId}`); showToast('관리자 해제'); }
            : () => setShowPasswordModal(true)
          }>{isOwner ? '관리자' : '인증'}</button>
          <button className="share-btn" onClick={handleShare} aria-label="공유">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
        </div>
      </header>

      <div className="section-label">
        셀렉됨 {selections.length > 0 && <span className="section-count">{selections.length}</span>}
        {!isOwner && selectionLocked && <span className="lock-badge">잠김</span>}
        {isOwner && (
          <button className={`lock-toggle-btn${selectionLocked ? ' active' : ''}`} onClick={toggleLock}>
            {selectionLocked ? '🔒 잠김' : '🔓 열림'}
          </button>
        )}
        {selections.length > 0 && <button className="viewer-open-btn" onClick={() => openSelectionViewer()}>보기</button>}
      </div>
      <div className="selection-area" onDragOver={canEditSelection ? handleSelectionAreaDragOver : undefined} onDrop={canEditSelection ? handleSelectionAreaDrop : undefined}>
        {selections.length === 0 ? (
          <div className="selection-empty">{canEditSelection ? '아래에서 이미지를 탭하여 셀렉하세요' : '아직 셀렉된 이미지가 없습니다'}</div>
        ) : (
          <div className="selection-grid">
            {selections.map((sel, idx) => {
              const img = getImageById(sel.image_id);
              if (!img) return null;
              return (
                <div
                  key={sel.image_id}
                  className={`selected-thumb${!canEditSelection ? ' read-only' : ''}${dragState.dragging === sel.image_id ? ' dragging' : ''}${dragState.over === sel.image_id && dragState.dragging !== sel.image_id ? ' drag-over' : ''}`}
                  data-image-id={sel.image_id}
                  draggable={canEditSelection}
                  onClick={canEditSelection ? () => handleDeselect(sel.image_id) : undefined}
                  onDragStart={canEditSelection ? (e) => handleDragStart(e, sel.image_id) : undefined}
                  onDragOver={canEditSelection ? (e) => handleDragOver(e, sel.image_id) : undefined}
                  onDragEnd={canEditSelection ? handleDragEnd : undefined}
                  onDrop={canEditSelection ? (e) => handleDrop(e, sel.image_id) : undefined}
                  onTouchStart={canEditSelection ? (e) => handleTouchStart(e, sel.image_id) : undefined}
                >
                  <img src={storageUrl(img.storage_path)} alt="" loading="lazy" />
                  <span className="selected-order">{idx + 1}</span>
                  {canEditSelection && <button className="selected-remove" aria-label="셀렉 해제">×</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Picks - when locked + non-owner */}
      {selectionLocked && !isOwner && (
        <>
          <div className="section-label">
            내 셀렉 {myPicks.length > 0 && <span className="section-count mypick-count">{myPicks.length}</span>}
            {myPicks.length > 0 && <button className="viewer-open-btn" onClick={() => openMyPicksViewer()}>보기</button>}
          </div>
          <div className="selection-area mypick-area">
            {myPicks.length === 0 ? (
              <div className="selection-empty">아래에서 이미지를 탭하여 내 셀렉을 만드세요</div>
            ) : (
              <div className="selection-grid">
                {myPicks.map((imageId, idx) => {
                  const img = getImageById(imageId);
                  if (!img) return null;
                  return (
                    <div key={imageId} className="selected-thumb" onClick={() => handleMyPick(imageId)}>
                      <img src={storageUrl(img.storage_path)} alt="" loading="lazy" />
                      <span className="selected-order mypick-order">{idx + 1}</span>
                      <button className="selected-remove" aria-label="셀렉 해제">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Snapshot controls */}
      {((selectionLocked && !isOwner) ? myPicks.length > 0 : selections.length > 0) && (
        <div className="snapshot-bar">
          <button className="snapshot-save-btn" onClick={() => setShowSnapshotSave(true)}>
            {(selectionLocked && !isOwner) ? '내 셀렉 저장' : '현재 셀렉 저장'}
          </button>
        </div>
      )}

      {/* Saved snapshots */}
      {snapshots.length > 0 && (
        <>
          <div className="section-label">
            스냅샷 {snapshots.length > 0 && <span className="section-count">{snapshots.length}</span>}
          </div>
          <div className="snapshot-list">
            {snapshots.map((snap) => (
              <div key={snap.id} className="snapshot-card">
                <div className="snapshot-card-header">
                  <span className="snapshot-card-name">{snap.name}</span>
                  <span className="snapshot-card-count">{snap.image_ids.length}장</span>
                </div>
                <div className="snapshot-card-thumbs">
                  {snap.image_ids.slice(0, 5).map((imgId) => {
                    const img = getImageById(imgId);
                    return img ? <img key={imgId} src={storageUrl(img.storage_path)} alt="" /> : null;
                  })}
                  {snap.image_ids.length > 5 && <span className="snapshot-more">+{snap.image_ids.length - 5}</span>}
                </div>
                <div className="snapshot-card-actions">
                  <button onClick={() => openCompareViewer(snap)}>비교</button>
                  {canEditSelection && <button onClick={() => handleLoadSnapshot(snap)}>불러오기</button>}
                  {isOwner && <button className="danger" onClick={() => handleDeleteSnapshot(snap)}>삭제</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">
        전체 이미지 {images.length > 0 && <span className="section-count">{images.length}</span>}
      </div>
      <div className="pool-area">
        {images.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '200px' }}>
            {isOwner ? '아래 버튼으로 이미지를 업로드하세요' : '아직 업로드된 이미지가 없습니다'}
          </div>
        ) : (
          <div className="pool-grid">
            {images.map((img, imgIdx) => (
              <div
                key={img.id}
                className={`pool-thumb${selectedImageIds.has(img.id) ? ' is-selected' : ''}${justSelected === img.id ? ' just-selected' : ''}${myPickSet.has(img.id) ? ' is-my-pick' : ''}`}
                onClick={() => {
                  if (poolLongPress.current.triggered) { poolLongPress.current.triggered = false; return; }
                  (selectionLocked && !isOwner) ? handleMyPick(img.id) : handleSelect(img.id);
                }}
                onPointerDown={() => {
                  poolLongPress.current.triggered = false;
                  poolLongPress.current.timer = setTimeout(() => {
                    poolLongPress.current.triggered = true;
                    setViewer({ mode: 'view', index: imgIdx, imageIds: images.map((i) => i.id) });
                  }, 400);
                }}
                onPointerUp={() => clearTimeout(poolLongPress.current.timer)}
                onPointerLeave={() => clearTimeout(poolLongPress.current.timer)}
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
            {uploading ? `업로드 중... ${uploadProgress}` : '+ 사진 추가'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handlePasswordSubmit}>
            <div className="modal-title">관리자 인증</div>
            <div className="modal-desc">
              {user && post?.user_id && post.user_id !== user.id
                ? '이 게시물은 다른 계정에 연결되어 있습니다.'
                : !user
                  ? '로그인하거나 비밀번호로 인증하세요'
                  : '비밀번호를 입력하면 관리할 수 있습니다'}
            </div>
            {!user && (
              <Link
                to={`/login?redirect=/p/${postId}`}
                className="btn-primary"
                style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                onClick={() => setShowPasswordModal(false)}
              >
                로그인으로 인증
              </Link>
            )}
            {post?.password_hash && (
              <>
                {!user && <div className="modal-divider"><span>또는</span></div>}
                <input
                  className="home-input"
                  type="password"
                  placeholder="관리 비밀번호"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>취소</button>
                  <button type="submit" className="btn-primary" disabled={!passwordInput.trim()}>확인</button>
                </div>
              </>
            )}
            {!post?.password_hash && (
              <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>취소</button>
              </div>
            )}
          </form>
        </div>
      )}

      {showSnapshotSave && (
        <div className="modal-overlay" onClick={() => setShowSnapshotSave(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveSnapshot}>
            <div className="modal-title">{(selectionLocked && !isOwner) ? '내 셀렉 저장' : '스냅샷 저장'}</div>
            <div className="modal-desc">
              {(selectionLocked && !isOwner)
                ? `내 셀렉 (${myPicks.length}장)을 스냅샷으로 저장합니다`
                : `현재 셀렉 (${selections.length}장)을 스냅샷으로 저장합니다`}
            </div>
            <input
              className="home-input"
              type="text"
              placeholder={(selectionLocked && !isOwner) ? `제안 ${snapshots.length + 1}` : `스냅샷 ${snapshots.length + 1}`}
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowSnapshotSave(false)}>취소</button>
              <button type="submit" className="btn-primary">저장</button>
            </div>
          </form>
        </div>
      )}

      {viewer && (() => {
        const total = viewer.mode === 'compare'
          ? Math.max(viewer.imageIds.length, viewer.compareImageIds.length)
          : viewer.imageIds.length;
        return (
          <div
            className="viewer-overlay"
            onTouchStart={(e) => {
              viewerTouchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - viewerTouchRef.current.startX;
              const dy = e.changedTouches[0].clientY - viewerTouchRef.current.startY;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                e.preventDefault();
                navigateViewer(dx > 0 ? -1 : 1);
              }
            }}
          >
            <div className="viewer-header">
              <div style={{ width: 44 }} />
              <div className="viewer-counter">
                {viewer.mode === 'compare' && <span className="viewer-mode-label">비교 · </span>}
                {viewer.index + 1} / {total}
              </div>
              <button className="viewer-close" onClick={() => setViewer(null)} aria-label="닫기">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="viewer-body">
              {viewer.mode === 'view' ? (() => {
                const img = getImageById(viewer.imageIds[viewer.index]);
                return img
                  ? <img src={storageUrl(img.storage_path)} alt="" />
                  : <div className="viewer-empty">이미지를 찾을 수 없습니다</div>;
              })() : (
                <div className="viewer-compare">
                  <div className="viewer-compare-panel">
                    <span className="viewer-compare-label">현재 셀렉</span>
                    {(() => {
                      const imgId = viewer.imageIds[viewer.index];
                      const img = imgId ? getImageById(imgId) : null;
                      return img
                        ? <img src={storageUrl(img.storage_path)} alt="" />
                        : <div className="viewer-empty">—</div>;
                    })()}
                  </div>
                  <div className="viewer-compare-divider" />
                  <div className="viewer-compare-panel">
                    <span className="viewer-compare-label">{viewer.snapshotName}</span>
                    {(() => {
                      const imgId = viewer.compareImageIds[viewer.index];
                      const img = imgId ? getImageById(imgId) : null;
                      return img
                        ? <img src={storageUrl(img.storage_path)} alt="" />
                        : <div className="viewer-empty">—</div>;
                    })()}
                  </div>
                </div>
              )}

              <button className="viewer-nav prev" disabled={viewer.index === 0} onClick={(e) => { e.stopPropagation(); navigateViewer(-1); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button className="viewer-nav next" disabled={viewer.index >= total - 1} onClick={(e) => { e.stopPropagation(); navigateViewer(1); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
