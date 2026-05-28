import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase, generateId, storageUrl } from '../supabase';
import { hashPassword } from '../crypto';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import QRCode from 'qrcode';
import JSZip from 'jszip';

export default function Post() {
  const { postId } = useParams();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang, t } = useI18n();
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
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [sortMode, setSortMode] = useState('date');
  const [filterMode, setFilterMode] = useState('all');
  const [reactions, setReactions] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showOnlinePanel, setShowOnlinePanel] = useState(false);
  const [selectionLog, setSelectionLog] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [gridCols, setGridCols] = useState(() => {
    const saved = sessionStorage.getItem('picpic_gridCols');
    return saved ? parseInt(saved) : 3;
  });
  const [showTitleEdit, setShowTitleEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [memos, setMemos] = useState({});
  const [editingMemo, setEditingMemo] = useState(null);
  const [showCollage, setShowCollage] = useState(false);
  const [viewerZoom, setViewerZoom] = useState({ scale: 1, x: 0, y: 0 });
  // --- NEW: Feature states ---
  const [comments, setComments] = useState({}); // { imageId: [{ author, text, created_at }] }
  const [commentInput, setCommentInput] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [tags, setTags] = useState({}); // { imageId: ['tag1', 'tag2'] }
  const [tagInput, setTagInput] = useState('');
  const [showTagEditor, setShowTagEditor] = useState(null); // imageId or null
  const [tagFilter, setTagFilter] = useState(null);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [activityFeed, setActivityFeed] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePhotos, setComparePhotos] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [zipProgress, setZipProgress] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [imgLoadState, setImgLoadState] = useState({}); // { imageId: true } when loaded
  const [viewingPhoto, setViewingPhoto] = useState(null); // for live cursor
  const [focalPoints, setFocalPoints] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`picpic_focal_${postId}`)) || {}; } catch { return {}; }
  });
  const [showFocalPicker, setShowFocalPicker] = useState(null);
  const [layoutMode, setLayoutMode] = useState('grid');
  const [dropActive, setDropActive] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState(new Set());
  const [showStats, setShowStats] = useState(false);
  const [loadMoreCount, setLoadMoreCount] = useState(60);

  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);
  const viewerTouchRef = useRef({ startX: 0, startY: 0 });
  const poolLongPress = useRef({ timer: null, triggered: false });
  const myPresenceKey = useRef(generateId(6));
  const pinchRef = useRef({ dist: 0, scale: 1 });
  const slideshowTimer = useRef(null);
  const channelRef = useRef(null);
  const poolObserver = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // ============ DATA LOADING ============
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: postData, error } = await supabase
        .from('posts').select('*').eq('id', postId).single();
      if (cancelled) return;
      if (error || !postData) { setNotFound(true); setLoading(false); return; }
      setPost(postData);
      setSelectionLocked(postData.selection_locked || false);
      const sessionAuth = sessionStorage.getItem(`picpic_auth_${postId}`);
      if (user && postData.user_id && postData.user_id === user.id) {
        setIsOwner(true);
      } else if (sessionAuth) {
        setIsOwner(true);
        if (user && !postData.user_id) {
          const { data: linked } = await supabase
            .from('posts')
            .update({ user_id: user.id, creator_email: user.email })
            .eq('id', postId).select('user_id').maybeSingle();
          if (linked && !cancelled) {
            setPost((prev) => prev ? { ...prev, user_id: user.id } : prev);
          }
        }
      }
      if (postData.expires_at && new Date(postData.expires_at) < new Date()) {
        setNotFound(true); setLoading(false); return;
      }
      supabase.from('posts').update({ last_accessed_at: new Date().toISOString() }).eq('id', postId).then();
      const safe = (q) => Promise.resolve(q).then((r) => r, () => ({ data: [] }));
      const [imgRes, selRes, snapRes, reactRes, logRes] = await Promise.all([
        supabase.from('images').select('*').eq('post_id', postId).order('created_at'),
        supabase.from('selections').select('*').eq('post_id', postId).order('position'),
        supabase.from('snapshots').select('*').eq('post_id', postId).order('created_at'),
        safe(supabase.from('reactions').select('*').eq('post_id', postId)),
        safe(supabase.from('selection_log').select('*').eq('post_id', postId).order('created_at', { ascending: false }).limit(50)),
      ]);
      if (cancelled) return;
      setImages(imgRes.data || []);
      setSelections(selRes.data || []);
      const rMap = {};
      (reactRes.data || []).forEach((r) => {
        if (!rMap[r.image_id]) rMap[r.image_id] = {};
        rMap[r.image_id][r.emoji] = (rMap[r.image_id][r.emoji] || 0) + 1;
      });
      setReactions(rMap);
      const savedReactions = sessionStorage.getItem(`picpic_reactions_${postId}`);
      if (savedReactions) try { setMyReactions(JSON.parse(savedReactions)); } catch {}
      setSelectionLog(logRes.data || []);
      setSnapshots(snapRes.data || []);
      setLoading(false);
      const savedPicks = sessionStorage.getItem(`picpic_mypicks_${postId}`);
      if (savedPicks) try { setMyPicks(JSON.parse(savedPicks)); } catch {}
      const savedMemos = sessionStorage.getItem(`picpic_memos_${postId}`);
      if (savedMemos) try { setMemos(JSON.parse(savedMemos)); } catch {}
      // Load tags & comments from sessionStorage (client-side for now)
      const savedTags = sessionStorage.getItem(`picpic_tags_${postId}`);
      if (savedTags) try { setTags(JSON.parse(savedTags)); } catch {}
      const savedComments = sessionStorage.getItem(`picpic_comments_${postId}`);
      if (savedComments) try { setComments(JSON.parse(savedComments)); } catch {}
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
      showToast(t('adminEnabled'));
    } else {
      showToast(t('wrongPassword'));
    }
  };

  const canLinkAccount = isOwner && post && !post.user_id;

  const handleLinkAccount = () => {
    if (!post) return;
    if (user) {
      (async () => {
        const { data: linked, error } = await supabase
          .from('posts').update({ user_id: user.id, creator_email: user.email })
          .eq('id', postId).select('user_id').maybeSingle();
        if (error) { showToast(`연결 실패: ${error.message}`); return; }
        if (!linked) { showToast('연결 실패: 권한 없음'); return; }
        setPost((prev) => ({ ...prev, user_id: user.id }));
        showToast(t('accountLinked'));
      })();
    } else {
      navigate(`/login?redirect=/p/${postId}`);
    }
  };

  const isUploadingRef = useRef(false);

  // ============ REALTIME + LIVE CURSORS ============
  useEffect(() => {
    const channel = supabase.channel(`post-${postId}`, {
      config: { presence: { key: myPresenceKey.current } },
    });
    channelRef.current = channel;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'images', filter: `post_id=eq.${postId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setImages((prev) => {
              if (prev.some((img) => img.id === payload.new.id)) return prev;
              if (!isUploadingRef.current) showToast(t('newImageAdded'));
              return [...prev, payload.new];
            });
            addActivity('upload', payload.new.original_name || 'image');
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `post_id=eq.${postId}` },
        () => {
          Promise.resolve(supabase.from('reactions').select('*').eq('post_id', postId))
            .then(({ data }) => {
              if (!data) return;
              const rMap = {};
              data.forEach((r) => {
                if (!rMap[r.image_id]) rMap[r.image_id] = {};
                rMap[r.image_id][r.emoji] = (rMap[r.image_id][r.emoji] || 0) + 1;
              });
              setReactions(rMap);
            }).catch(() => {});
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = [];
        Object.entries(state).forEach(([key, presences]) => {
          presences.forEach((p) => {
            users.push({
              key, name: p.name || `익명-${key.slice(0, 4)}`,
              joinedAt: p.joined_at,
              viewingPhoto: p.viewing_photo || null,
            });
          });
        });
        setOnlineUsers(users);
        setOnlineCount(users.length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            joined_at: Date.now(),
            name: user?.email?.split('@')[0] || `익명-${myPresenceKey.current.slice(0, 4)}`,
            viewing_photo: null,
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [postId, user]);

  // Live cursor: broadcast which photo I'm viewing
  useEffect(() => {
    if (!channelRef.current || !viewer) return;
    const imgId = viewer.imageIds?.[viewer.index] || null;
    setViewingPhoto(imgId);
    channelRef.current.track({
      joined_at: Date.now(),
      name: user?.email?.split('@')[0] || `익명-${myPresenceKey.current.slice(0, 4)}`,
      viewing_photo: imgId,
    });
  }, [viewer?.index, viewer?.imageIds]);

  // ============ DERIVED STATE ============
  const selectedImageIds = new Set(selections.map((s) => s.image_id));
  const getImageById = (id) => images.find((img) => img.id === id);
  const canEditSelection = !selectionLocked || isOwner;
  const myPickSet = new Set(myPicks);

  const selectionOrder = useMemo(() => {
    const map = new Map();
    selections.forEach((s, i) => map.set(s.image_id, i + 1));
    return map;
  }, [selections]);

  // Reaction score per image for ranking
  const reactionScores = useMemo(() => {
    const scores = {};
    Object.entries(reactions).forEach(([imgId, emojis]) => {
      scores[imgId] = Object.values(emojis).reduce((sum, c) => sum + c, 0);
    });
    // Also add selection frequency bonus
    selections.forEach((s) => {
      scores[s.image_id] = (scores[s.image_id] || 0) + 2;
    });
    return scores;
  }, [reactions, selections]);

  // Selection heatmap: how many times each image was selected/deselected
  const selectionHeat = useMemo(() => {
    const heat = {};
    selectionLog.forEach((log) => {
      heat[log.image_id] = (heat[log.image_id] || 0) + 1;
    });
    const max = Math.max(1, ...Object.values(heat));
    const normalized = {};
    Object.entries(heat).forEach(([id, count]) => {
      normalized[id] = count / max;
    });
    return normalized;
  }, [selectionLog]);

  // All unique tags across all images
  const allTags = useMemo(() => {
    const tagSet = new Set();
    Object.values(tags).forEach((arr) => arr.forEach((tag) => tagSet.add(tag)));
    return [...tagSet].sort();
  }, [tags]);

  // Live cursor viewers per photo
  const photoViewers = useMemo(() => {
    const map = {};
    onlineUsers.forEach((u) => {
      if (u.viewingPhoto && u.key !== myPresenceKey.current) {
        if (!map[u.viewingPhoto]) map[u.viewingPhoto] = [];
        map[u.viewingPhoto].push(u.name);
      }
    });
    return map;
  }, [onlineUsers]);

  // Filtered & sorted images for pool display
  const displayImages = useMemo(() => {
    let filtered = images;
    if (filterMode === 'selected') filtered = images.filter((img) => selectedImageIds.has(img.id));
    else if (filterMode === 'unselected') filtered = images.filter((img) => !selectedImageIds.has(img.id));
    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter((img) => tags[img.id]?.includes(tagFilter));
    }
    if (sortMode === 'name') return [...filtered].sort((a, b) => (a.original_name || '').localeCompare(b.original_name || ''));
    if (sortMode === 'popular') return [...filtered].sort((a, b) => (reactionScores[b.id] || 0) - (reactionScores[a.id] || 0));
    return filtered;
  }, [images, filterMode, sortMode, selectedImageIds, tagFilter, tags, reactionScores]);

  // ============ IMAGE UPLOAD WITH COMPRESSION + THUMBNAILS ============
  const compressImage = (file, maxSize, quality = 0.85, addWatermark = false) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const needsResize = width > maxSize || height > maxSize;
      if (!needsResize && !addWatermark && quality >= 0.9) { resolve(file); return; }
      if (width > height) { if (width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; } }
      else { if (height > maxSize) { width = Math.round(width * (maxSize / height)); height = maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      if (addWatermark) {
        const fontSize = Math.max(12, Math.round(width * 0.03));
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('PicPic', width - 8, height - 6);
      }
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    isUploadingRef.current = true;
    try {
      const rows = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`${i + 1}/${files.length}장`);
        // Compress original to max 2048px
        const original = await compressImage(files[i], 2048, 0.85, watermarkEnabled);
        const id = generateId();
        const origPath = `${postId}/${id}.jpg`;
        const { error: origErr } = await supabase.storage.from('post-images').upload(origPath, original, { contentType: 'image/jpeg' });
        if (origErr) throw origErr;
        // Thumbnail upload (best-effort, non-blocking)
        const thumbPath = `${postId}/thumb_${id}.jpg`;
        const thumbnail = await compressImage(files[i], 400, 0.7);
        supabase.storage.from('post-images').upload(thumbPath, thumbnail, { contentType: 'image/jpeg' }).catch(() => {});
        rows.push({
          post_id: postId,
          storage_path: origPath,
          original_name: files[i].name,
        });
      }
      // Try insert with thumbnail_path first, fallback without it
      let { error } = await supabase.from('images').insert(rows);
      if (error) throw error;
      showToast(t('uploadComplete', { n: files.length }));
    } catch (err) {
      console.error(err);
      showToast(t('uploadFailed'));
    }
    setUploading(false);
    isUploadingRef.current = false;
    setUploadProgress('');
    e.target.value = '';
  };

  // Helper: get thumbnail URL or fallback to original
  const thumbUrl = (img) => {
    if (img.thumbnail_path) return storageUrl(img.thumbnail_path);
    return storageUrl(img.storage_path);
  };

  // ============ ACTIVITY FEED ============
  const addActivity = useCallback((action, detail) => {
    const actor = user?.email?.split('@')[0] || `익명-${myPresenceKey.current.slice(0, 4)}`;
    setActivityFeed((prev) => [{
      action, detail, actor, time: new Date().toISOString(),
    }, ...prev].slice(0, 100));
  }, [user]);

  const logSelection = (imageId, action) => {
    const actor = user?.email?.split('@')[0] || `익명-${myPresenceKey.current.slice(0, 4)}`;
    Promise.resolve(supabase.from('selection_log').insert({ post_id: postId, image_id: imageId, action, actor })).catch(() => {});
    setSelectionLog((prev) => [{ post_id: postId, image_id: imageId, action, actor, created_at: new Date().toISOString() }, ...prev].slice(0, 50));
    addActivity(action, getImageById(imageId)?.original_name || imageId);
  };

  // ============ SELECTION ACTIONS ============
  const pushUndo = () => {
    setUndoStack((prev) => [...prev.slice(-19), selections.map((s) => ({ ...s }))]);
  };

  const handleSelect = async (imageId) => {
    pushUndo();
    if (selectedImageIds.has(imageId)) {
      setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
      const { error } = await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
      if (error) showToast('셀렉 해제 실패: ' + error.message);
      else logSelection(imageId, 'deselect');
    } else {
      const maxPos = selections.length > 0 ? Math.max(...selections.map((s) => s.position)) + 1 : 0;
      setSelections((prev) => [...prev, { post_id: postId, image_id: imageId, position: maxPos }]);
      setJustSelected(imageId);
      setTimeout(() => setJustSelected(null), 300);
      const { error } = await supabase.from('selections').insert({ post_id: postId, image_id: imageId, position: maxPos });
      if (error) showToast('셀렉 실패: ' + error.message);
      else logSelection(imageId, 'select');
    }
  };

  const handleDeselect = async (imageId) => {
    pushUndo();
    setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
    await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
    logSelection(imageId, 'deselect');
  };

  const handleDelete = (e, imageId) => {
    e.stopPropagation();
    setConfirmDialog({
      message: '이 이미지를 삭제할까요?',
      onConfirm: async () => {
        const img = getImageById(imageId);
        if (!img) return;
        setSelections((prev) => prev.filter((s) => s.image_id !== imageId));
        setImages((prev) => prev.filter((i) => i.id !== imageId));
        const paths = [img.storage_path];
        if (img.thumbnail_path) paths.push(img.thumbnail_path);
        await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', imageId);
        await supabase.storage.from('post-images').remove(paths);
        await supabase.from('images').delete().eq('id', imageId);
      },
    });
  };

  // ============ SNAPSHOTS ============
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
    addActivity('snapshot', name);
  };

  const handleLoadSnapshot = (snapshot) => {
    const doLoad = async () => {
      await supabase.from('selections').delete().eq('post_id', postId);
      const rows = snapshot.image_ids.map((imageId, i) => ({ post_id: postId, image_id: imageId, position: i }));
      if (rows.length) await supabase.from('selections').insert(rows);
      setSelections(rows);
      setViewer(null);
      showToast(`"${snapshot.name}" 불러옴`);
    };
    if (selections.length > 0) {
      setConfirmDialog({ message: `현재 셀렉을 "${snapshot.name}"(으)로 교체할까요?`, onConfirm: doLoad });
    } else doLoad();
  };

  const handleDeleteSnapshot = (snapshot) => {
    setConfirmDialog({
      message: `"${snapshot.name}" 스냅샷을 삭제할까요?`,
      onConfirm: async () => {
        setSnapshots((prev) => prev.filter((s) => s.id !== snapshot.id));
        await supabase.from('snapshots').delete().eq('id', snapshot.id);
      },
    });
  };

  // ============ SELECTION LOCK & MY PICKS ============
  const toggleLock = async () => {
    const newLocked = !selectionLocked;
    setSelectionLocked(newLocked);
    await supabase.from('posts').update({ selection_locked: newLocked }).eq('id', postId);
    showToast(newLocked ? t('selLocked') : t('selUnlocked'));
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

  // ============ VIEWER ============
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
    setViewerZoom({ scale: 1, x: 0, y: 0 });
    setEditingMemo(null);
    setShowComments(false);
    setViewer((prev) => {
      if (!prev) return null;
      const total = prev.mode === 'compare'
        ? Math.max(prev.imageIds.length, (prev.compareImageIds || []).length)
        : prev.imageIds.length;
      const next = prev.index + dir;
      if (next < 0 || next >= total) return prev;
      return { ...prev, index: next };
    });
  }, []);

  // ============ SHARE & QR ============
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else { await navigator.clipboard.writeText(url); showToast(t('linkCopied')); }
    } catch {
      try { await navigator.clipboard.writeText(url); showToast(t('linkCopied')); } catch {}
    }
  };

  const handleShowQR = async () => {
    const url = window.location.href;
    const isDark = theme === 'dark';
    const dataUrl = await QRCode.toDataURL(url, {
      width: 280, margin: 2, color: { dark: isDark ? '#ffffff' : '#111111', light: isDark ? '#111111' : '#ffffff' },
    });
    setQrDataUrl(dataUrl);
  };

  const handleClearSelections = async () => {
    setConfirmDialog({
      message: t('deselectAll', { n: selections.length }),
      onConfirm: async () => {
        setSelections([]);
        await supabase.from('selections').delete().eq('post_id', postId);
        showToast(t('clearAll'));
      },
    });
  };

  // ============ TITLE, PASSWORD, UNDO, GRID ============
  const handleTitleEdit = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === post.title) { setShowTitleEdit(false); return; }
    const { error } = await supabase.from('posts').update({ title: trimmed }).eq('id', postId);
    if (!error) { setPost((prev) => ({ ...prev, title: trimmed })); showToast(t('titleChanged')); }
    setShowTitleEdit(false);
  };

  const handlePasswordChange = async () => {
    const trimmed = newPassword.trim();
    if (!trimmed) return;
    const hash = await hashPassword(trimmed);
    const { error } = await supabase.from('posts').update({ password_hash: hash }).eq('id', postId);
    if (!error) showToast(t('passwordChanged'));
    setNewPassword('');
    setShowPasswordChange(false);
  };

  const handleUndo = async () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setSelections(prev);
    await supabase.from('selections').delete().eq('post_id', postId);
    if (prev.length) {
      await supabase.from('selections').insert(prev.map((s, i) => ({ post_id: postId, image_id: s.image_id, position: i })));
    }
    showToast(t('undoDone'));
  };

  const handleGridToggle = () => {
    const next = gridCols >= 5 ? 2 : gridCols + 1;
    setGridCols(next);
    sessionStorage.setItem('picpic_gridCols', String(next));
  };

  // ============ MEMO ============
  const handleMemoSave = (imageId, text) => {
    const next = { ...memos, [imageId]: text };
    if (!text.trim()) delete next[imageId];
    setMemos(next);
    sessionStorage.setItem(`picpic_memos_${postId}`, JSON.stringify(next));
    setEditingMemo(null);
  };

  // ============ COMMENTS (per-image threads) ============
  const handleCommentSubmit = (imageId) => {
    if (!commentInput.trim()) return;
    const author = user?.email?.split('@')[0] || `익명-${myPresenceKey.current.slice(0, 4)}`;
    const newComment = { author, text: commentInput.trim(), created_at: new Date().toISOString() };
    const next = { ...comments, [imageId]: [...(comments[imageId] || []), newComment] };
    setComments(next);
    sessionStorage.setItem(`picpic_comments_${postId}`, JSON.stringify(next));
    setCommentInput('');
    addActivity('comment', `${getImageById(imageId)?.original_name || 'photo'}`);
  };

  // ============ TAGS ============
  const handleAddTag = (imageId) => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const imgTags = tags[imageId] || [];
    if (imgTags.includes(tag)) { setTagInput(''); return; }
    const next = { ...tags, [imageId]: [...imgTags, tag] };
    setTags(next);
    sessionStorage.setItem(`picpic_tags_${postId}`, JSON.stringify(next));
    setTagInput('');
  };

  const handleRemoveTag = (imageId, tag) => {
    const next = { ...tags, [imageId]: (tags[imageId] || []).filter((t) => t !== tag) };
    if (!next[imageId].length) delete next[imageId];
    setTags(next);
    sessionStorage.setItem(`picpic_tags_${postId}`, JSON.stringify(next));
  };

  // ============ SAVE PHOTO (iOS → Photos, others → download) ============
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const saveBlob = async (blob, filename) => {
    if (isIOS && navigator.share) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled share sheet
      }
    }
    // Fallback: normal download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveCurrentPhoto = async () => {
    if (!viewer) return;
    const imgId = viewer.imageIds[viewer.index];
    const img = getImageById(imgId);
    if (!img) return;
    try {
      showToast(t('saving'));
      const resp = await fetch(storageUrl(img.storage_path));
      const blob = await resp.blob();
      const ext = img.original_name?.split('.').pop() || 'jpg';
      const filename = img.original_name || `photo_${imgId}.${ext}`;
      await saveBlob(blob, filename);
      showToast(t('photoSaved'));
    } catch (err) {
      console.error('Save photo error:', err);
      showToast(t('saveFailed'));
    }
  };

  // ============ COLLAGE EXPORT ============
  const generateCollage = async () => {
    const selImgs = selections.map((s) => getImageById(s.image_id)).filter(Boolean);
    if (!selImgs.length) return;
    setShowCollage(false);
    showToast(t('collageCreating'));
    const cols = Math.min(selImgs.length, 3);
    const rows = Math.ceil(selImgs.length / cols);
    const cellSize = 400;
    const gap = 4;
    const w = cols * cellSize + (cols - 1) * gap;
    const h = rows * cellSize + (rows - 1) * gap;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < selImgs.length; i++) {
      const imgEl = new Image();
      imgEl.crossOrigin = 'anonymous';
      await new Promise((resolve) => { imgEl.onload = resolve; imgEl.onerror = resolve; imgEl.src = storageUrl(selImgs[i].storage_path); });
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (cellSize + gap);
      const y = row * (cellSize + gap);
      const scale = Math.max(cellSize / imgEl.width, cellSize / imgEl.height);
      const sw = cellSize / scale; const sh = cellSize / scale;
      const sx = (imgEl.width - sw) / 2; const sy = (imgEl.height - sh) / 2;
      ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, cellSize, cellSize);
    }
    canvas.toBlob(async (blob) => {
      await saveBlob(blob, `${post.title || 'collage'}_collage.jpg`);
      showToast(t('collageSaved'));
    }, 'image/jpeg', 0.92);
  };

  // ============ ZIP DOWNLOAD ============
  const handleZipDownload = async () => {
    const selImgs = selections.map((s) => getImageById(s.image_id)).filter(Boolean);
    if (!selImgs.length) return;
    setZipProgress(0);
    try {
      const zip = new JSZip();
      const folder = zip.folder(post.title || 'picpic');
      for (let i = 0; i < selImgs.length; i++) {
        setZipProgress(Math.round((i / selImgs.length) * 80));
        const url = storageUrl(selImgs[i].storage_path);
        const resp = await fetch(url);
        const blob = await resp.blob();
        const ext = selImgs[i].original_name?.split('.').pop() || 'jpg';
        folder.file(`${String(i + 1).padStart(2, '0')}_${selImgs[i].original_name || `photo.${ext}`}`, blob);
      }
      setZipProgress(90);
      const content = await zip.generateAsync({ type: 'blob' });
      setZipProgress(100);
      await saveBlob(content, `${post.title || 'picpic'}_selection.zip`);
      showToast(t('zipComplete'));
    } catch (err) {
      console.error('ZIP error:', err);
      showToast('ZIP 생성 실패');
    }
    setZipProgress(null);
  };

  // ============ PHOTO COMPARE MODE ============
  const toggleCompareMode = () => {
    setCompareMode((p) => !p);
    setComparePhotos([]);
  };

  const handleCompareSelect = (imageId) => {
    setComparePhotos((prev) => {
      if (prev.includes(imageId)) return prev.filter((id) => id !== imageId);
      if (prev.length >= 2) return [prev[1], imageId];
      return [...prev, imageId];
    });
  };

  // ============ VIEWER GESTURES ============
  const handleViewerPinchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale: viewerZoom.scale };
    }
  };

  const handleViewerPinchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(4, Math.max(1, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      setViewerZoom((prev) => ({ ...prev, scale: newScale }));
    }
  };

  const handleViewerDoubleTap = (() => {
    let lastTap = 0;
    return () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        setViewerZoom((prev) => prev.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 });
      }
      lastTap = now;
    };
  })();

  const REACTION_EMOJIS = ['❤️', '🔥', '👍', '😍', '🤔'];

  const handleReact = async (imageId, emoji) => {
    const prevEmoji = myReactions[imageId];
    if (prevEmoji === emoji) {
      const next = { ...myReactions }; delete next[imageId];
      setMyReactions(next);
      sessionStorage.setItem(`picpic_reactions_${postId}`, JSON.stringify(next));
      setReactions((prev) => {
        const updated = { ...prev };
        if (updated[imageId]?.[emoji]) {
          updated[imageId] = { ...updated[imageId] };
          updated[imageId][emoji]--;
          if (updated[imageId][emoji] <= 0) delete updated[imageId][emoji];
          if (Object.keys(updated[imageId]).length === 0) delete updated[imageId];
        }
        return updated;
      });
      Promise.resolve(supabase.from('reactions').delete().eq('post_id', postId).eq('image_id', imageId).eq('session_id', myPresenceKey.current)).catch(() => {});
    } else {
      const next = { ...myReactions, [imageId]: emoji };
      setMyReactions(next);
      sessionStorage.setItem(`picpic_reactions_${postId}`, JSON.stringify(next));
      setReactions((prev) => {
        const updated = { ...prev };
        if (prevEmoji && updated[imageId]?.[prevEmoji]) {
          updated[imageId] = { ...updated[imageId] };
          updated[imageId][prevEmoji]--;
          if (updated[imageId][prevEmoji] <= 0) delete updated[imageId][prevEmoji];
        }
        if (!updated[imageId]) updated[imageId] = {};
        else updated[imageId] = { ...updated[imageId] };
        updated[imageId][emoji] = (updated[imageId][emoji] || 0) + 1;
        return updated;
      });
      if (prevEmoji) {
        Promise.resolve(supabase.from('reactions').delete().eq('post_id', postId).eq('image_id', imageId).eq('session_id', myPresenceKey.current)).catch(() => {});
      }
      Promise.resolve(supabase.from('reactions').insert({ post_id: postId, image_id: imageId, emoji, session_id: myPresenceKey.current })).catch(() => {});
    }
  };

  // ============ REORDER ============
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

  // Mobile touch drag
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

  // ============ KEYBOARD SHORTCUTS ============
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isInput) return;
      if (e.key === 'Escape') {
        if (confirmDialog) setConfirmDialog(null);
        else if (showCollage) setShowCollage(false);
        else if (showSettings) setShowSettings(false);
        else if (showActivityFeed) setShowActivityFeed(false);
        else if (compareMode) { setCompareMode(false); setComparePhotos([]); }
        else if (viewer) { setViewer(null); setSlideshowActive(false); setViewerZoom({ scale: 1, x: 0, y: 0 }); }
        else if (showHistory) setShowHistory(false);
        else if (showOnlinePanel) setShowOnlinePanel(false);
        else if (showTitleEdit) setShowTitleEdit(false);
        else if (showPasswordChange) setShowPasswordChange(false);
        else if (showSnapshotSave) setShowSnapshotSave(false);
        else if (showPasswordModal) setShowPasswordModal(false);
      }
      if (viewer) {
        if (e.key === 'ArrowLeft') navigateViewer(-1);
        if (e.key === 'ArrowRight') navigateViewer(1);
      }
      if (viewer && viewer.mode === 'view') {
        const imgId = viewer.imageIds[viewer.index];
        if (e.key === 's' || e.key === 'S') { if (canEditSelection) handleSelect(imgId); }
        if (e.key === 'd' || e.key === 'D') handleSaveCurrentPhoto();
        if (e.key === ' ') { e.preventDefault(); setSlideshowActive(p => !p); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && isOwner) {
          handleDelete(e, imgId);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewer, showSnapshotSave, showPasswordModal, navigateViewer, compareMode, showSettings, showActivityFeed]);

  useEffect(() => {
    if (viewer) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [viewer]);

  // Slideshow
  useEffect(() => {
    if (!slideshowActive || !viewer) return;
    slideshowTimer.current = setInterval(() => {
      setViewer((prev) => {
        if (!prev) return null;
        const total = prev.imageIds.length;
        const next = prev.index + 1;
        if (next >= total) { setSlideshowActive(false); return prev; }
        setViewerZoom({ scale: 1, x: 0, y: 0 });
        return { ...prev, index: next };
      });
    }, 3000);
    return () => clearInterval(slideshowTimer.current);
  }, [slideshowActive, viewer]);

  // Pool drag to selection
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

  // Skeleton: track loaded images
  const handleImgLoad = useCallback((imgId) => {
    setImgLoadState((prev) => ({ ...prev, [imgId]: true }));
  }, []);

  // ============ FOCAL POINT (CROP POSITION) ============
  const handleSetFocalPoint = (imageId, x, y) => {
    const next = { ...focalPoints, [imageId]: { x, y } };
    setFocalPoints(next);
    sessionStorage.setItem(`picpic_focal_${postId}`, JSON.stringify(next));
  };

  const getFocalStyle = (imageId) => {
    const fp = focalPoints[imageId];
    if (!fp) return { objectPosition: 'center center' };
    return { objectPosition: `${Math.round(fp.x * 100)}% ${Math.round(fp.y * 100)}%` };
  };

  // ============ DRAG & DROP UPLOAD ============
  const handleFileDrop = async (e) => {
    e.preventDefault();
    setDropActive(false);
    if (!isOwner) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    // Reuse upload logic
    const fakeEvent = { target: { files, value: '' } };
    fakeEvent.target.value = '';
    await handleUpload(fakeEvent);
  };

  const handleFileDragOver = (e) => {
    e.preventDefault();
    if (isOwner) setDropActive(true);
  };

  const handleFileDragLeave = () => setDropActive(false);

  // ============ BATCH OPERATIONS ============
  const toggleBatchMode = () => {
    setBatchMode(p => !p);
    setBatchSelected(new Set());
  };

  const handleBatchToggle = (imageId) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (!batchSelected.size) return;
    setConfirmDialog({
      message: `${batchSelected.size}${lang === 'ko' ? '장의 사진을 삭제할까요?' : ' photos will be deleted. Continue?'}`,
      onConfirm: async () => {
        const ids = [...batchSelected];
        const imgs = ids.map(id => getImageById(id)).filter(Boolean);
        setImages(prev => prev.filter(i => !batchSelected.has(i.id)));
        setSelections(prev => prev.filter(s => !batchSelected.has(s.image_id)));
        for (const img of imgs) {
          const paths = [img.storage_path];
          if (img.thumbnail_path) paths.push(img.thumbnail_path);
          await supabase.storage.from('post-images').remove(paths);
          await supabase.from('selections').delete().eq('post_id', postId).eq('image_id', img.id);
          await supabase.from('images').delete().eq('id', img.id);
        }
        setBatchMode(false);
        setBatchSelected(new Set());
        showToast(`${ids.length}${lang === 'ko' ? '장 삭제됨' : ' deleted'}`);
      },
    });
  };

  // ============ PULL TO REFRESH ============
  const pullRef = useRef({ startY: 0, pulling: false });
  const handlePullStart = (e) => {
    if (window.scrollY === 0) pullRef.current.startY = e.touches[0].clientY;
  };
  const handlePullMove = (e) => {
    const dy = e.touches[0].clientY - pullRef.current.startY;
    if (dy > 100 && window.scrollY === 0 && !pullRef.current.pulling) {
      pullRef.current.pulling = true;
    }
  };
  const handlePullEnd = () => {
    if (pullRef.current.pulling) {
      pullRef.current.pulling = false;
      window.location.reload();
    }
    pullRef.current.startY = 0;
  };

  // ============ LOAD MORE (PAGINATION) ============
  const paginatedImages = useMemo(() => {
    return displayImages.slice(0, loadMoreCount);
  }, [displayImages, loadMoreCount]);

  const hasMore = displayImages.length > loadMoreCount;

  // ============ RENDER ============
  if (loading) return (
    <div className="loading">
      <div className="spinner" />
      <span>{t('loading')}</span>
    </div>
  );
  if (notFound) return (
    <div className="not-found">
      <h2>{t('notFound')}</h2>
      <Link to="/">{t('goHome')}</Link>
    </div>
  );

  return (
    <div className={`post-page${isOwner ? ' has-bottom-bar' : ''}`}>
      {/* HEADER */}
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label={t('home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
        <div className={`post-title${isOwner ? ' editable' : ''}`} onClick={isOwner ? () => { setEditTitle(post.title); setShowTitleEdit(true); } : undefined}>
          {post.title}
        </div>
        {post.expires_at && (
          <div className="expiry-badge">
            {new Date(post.expires_at) > new Date()
              ? `${Math.ceil((new Date(post.expires_at) - new Date()) / 86400000)}${lang === 'ko' ? '일 남음' : 'd left'}`
              : lang === 'ko' ? '만료됨' : 'Expired'}
          </div>
        )}
        <div className="header-actions">
          <button className="online-badge" onClick={() => setShowOnlinePanel(true)}><span className="online-dot" />{onlineCount}</button>
          {canLinkAccount && (
            <button className="share-btn link-btn" onClick={handleLinkAccount}>{t('linkAccount')}</button>
          )}
          <button className={`share-btn auth-btn${isOwner ? ' authed' : ''}`} onClick={isOwner
            ? () => { setIsOwner(false); sessionStorage.removeItem(`picpic_auth_${postId}`); showToast(t('adminDisabled')); }
            : () => setShowPasswordModal(true)
          }>{isOwner ? t('admin') : t('auth')}</button>
          <button className="share-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
          <button className="share-btn" onClick={handleShowQR} aria-label="QR">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/></svg>
          </button>
          <button className="share-btn" onClick={handleShare} aria-label={t('share')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
        </div>
      </header>

      {/* SELECTION SECTION */}
      <div className="section-label">
        {t('selected')} {selections.length > 0 && <span className="section-count">{selections.length}</span>}
        {selections.length >= 10 && (
          <span className={`insta-warn${selections.length > 20 ? ' over' : ''}`}>
            {selections.length > 20 ? '⚠ 초과' : selections.length === 20 ? '📸 한도' : `📸 ${20 - selections.length}`}
          </span>
        )}
        {!isOwner && selectionLocked && <span className="lock-badge">{t('locked')}</span>}
        {isOwner && (
          <button className={`lock-toggle-btn${selectionLocked ? ' active' : ''}`} onClick={toggleLock}>
            {selectionLocked ? `🔒 ${t('locked')}` : `🔓 ${t('opened')}`}
          </button>
        )}
        {undoStack.length > 0 && canEditSelection && <button className="viewer-open-btn" onClick={handleUndo}>↩ {t('undo')}</button>}
        {selectionLog.length > 0 && <button className="viewer-open-btn" onClick={() => setShowHistory(true)}>{t('history')}</button>}
        {selections.length > 0 && <button className="viewer-open-btn" onClick={() => openSelectionViewer()}>{t('view')}</button>}
      </div>
      <div className="selection-area" onDragOver={canEditSelection ? handleSelectionAreaDragOver : undefined} onDrop={canEditSelection ? handleSelectionAreaDrop : undefined}>
        {selections.length === 0 ? (
          <div className="selection-empty">{canEditSelection ? t('selectHint') : t('noSelected')}</div>
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
                  <img src={thumbUrl(img)} alt="" loading="lazy" />
                  <span className="selected-order">{idx + 1}</span>
                  {canEditSelection && <button className="selected-remove" aria-label="해제">×</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MY PICKS */}
      {selectionLocked && !isOwner && (
        <>
          <div className="section-label">
            {t('myPicks')} {myPicks.length > 0 && <span className="section-count mypick-count">{myPicks.length}</span>}
            {myPicks.length > 0 && <button className="viewer-open-btn" onClick={() => openMyPicksViewer()}>{t('view')}</button>}
          </div>
          <div className="selection-area mypick-area">
            {myPicks.length === 0 ? (
              <div className="selection-empty">{t('myPickHint')}</div>
            ) : (
              <div className="selection-grid">
                {myPicks.map((imageId, idx) => {
                  const img = getImageById(imageId);
                  if (!img) return null;
                  return (
                    <div key={imageId} className="selected-thumb" onClick={() => handleMyPick(imageId)}>
                      <img src={thumbUrl(img)} alt="" loading="lazy" />
                      <span className="selected-order mypick-order">{idx + 1}</span>
                      <button className="selected-remove" aria-label="해제">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* SNAPSHOT CONTROLS */}
      {((selectionLocked && !isOwner) ? myPicks.length > 0 : selections.length > 0) && (
        <div className="snapshot-bar">
          <button className="snapshot-save-btn" onClick={() => setShowSnapshotSave(true)}>
            {(selectionLocked && !isOwner) ? t('saveMyPick') : t('saveSnapshot')}
          </button>
        </div>
      )}

      {snapshots.length > 0 && (
        <>
          <div className="section-label">
            {t('snapshots')} <span className="section-count">{snapshots.length}</span>
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
                    return img ? <img key={imgId} src={thumbUrl(img)} alt="" /> : null;
                  })}
                  {snap.image_ids.length > 5 && <span className="snapshot-more">+{snap.image_ids.length - 5}</span>}
                </div>
                <div className="snapshot-card-actions">
                  <button onClick={() => openCompareViewer(snap)}>{t('compare')}</button>
                  {canEditSelection && <button onClick={() => handleLoadSnapshot(snap)}>{t('loadSnapshot')}</button>}
                  {isOwner && <button className="danger" onClick={() => handleDeleteSnapshot(snap)}>{t('delete')}</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ALL IMAGES POOL */}
      <div className="section-label">
        {t('allImages')} {images.length > 0 && <span className="section-count">{images.length}</span>}
        {canEditSelection && selections.length > 0 && (
          <button className="viewer-open-btn danger-text" onClick={handleClearSelections}>{t('clearAll')}</button>
        )}
      </div>

      {/* TAG FILTER BAR */}
      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <button className={`pool-filter-btn${!tagFilter ? ' active' : ''}`} onClick={() => setTagFilter(null)}>{t('all')}</button>
          {allTags.map((tag) => (
            <button key={tag} className={`pool-filter-btn${tagFilter === tag ? ' active' : ''}`} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {images.length > 3 && (
        <div className="pool-toolbar">
          <div className="pool-filters">
            {['all', 'selected', 'unselected'].map((f) => (
              <button key={f} className={`pool-filter-btn${filterMode === f ? ' active' : ''}`} onClick={() => setFilterMode(f)}>
                {f === 'all' ? t('all') : f === 'selected' ? t('selectedFilter') : t('unselected')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button className={`pool-sort-btn${showHeatmap ? ' active' : ''}`} onClick={() => setShowHeatmap((p) => !p)} title={t('heatmap')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2c1 3 4 6 4 10a4 4 0 01-8 0c0-4 3-7 4-10z"/></svg>
            </button>
            <button className={`pool-sort-btn${compareMode ? ' active' : ''}`} onClick={toggleCompareMode} title={t('compare')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>
            </button>
            {isOwner && (
              <button className={`pool-sort-btn${batchMode ? ' active' : ''}`} onClick={toggleBatchMode} title="Batch">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </button>
            )}
            <button className="pool-sort-btn" onClick={() => setLayoutMode(l => l === 'grid' ? 'list' : 'grid')} title="Layout">
              {layoutMode === 'grid' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              )}
            </button>
            <button className="pool-sort-btn" onClick={handleGridToggle} title="Grid">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              {gridCols}
            </button>
            <button className="pool-sort-btn" onClick={() => setSortMode((s) => s === 'date' ? 'name' : s === 'name' ? 'popular' : 'date')}>
              {sortMode === 'date' ? t('byDate') : sortMode === 'name' ? t('byName') : t('byPopular')}
            </button>
          </div>
        </div>
      )}

      {/* COMPARE MODE BAR */}
      {compareMode && (
        <div className="compare-bar">
          <span>{t('compare')}: {comparePhotos.length}/2 {lang === 'ko' ? '선택됨' : 'selected'}</span>
          {comparePhotos.length === 2 && (
            <button className="btn-primary btn-sm" onClick={() => {
              setViewer({ mode: 'sideBySide', index: 0, imageIds: comparePhotos });
              setCompareMode(false);
            }}>{t('compare')} {t('view')}</button>
          )}
          <button className="btn-secondary btn-sm" onClick={toggleCompareMode}>{t('cancel')}</button>
        </div>
      )}
      {batchMode && batchSelected.size > 0 && (
        <div className="compare-bar" style={{ background: 'rgba(231,76,60,0.95)' }}>
          <span>{batchSelected.size}{lang === 'ko' ? '장 선택됨' : ' selected'}</span>
          <button className="btn-primary btn-sm" style={{ background: '#c0392b' }} onClick={handleBatchDelete}>
            {lang === 'ko' ? '삭제' : 'Delete'}
          </button>
          <button className="btn-secondary btn-sm" onClick={toggleBatchMode}>{t('cancel')}</button>
        </div>
      )}

      <div className={`pool-area${dropActive ? ' drop-active' : ''}`}
        onDrop={handleFileDrop} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave}
        onTouchStart={handlePullStart} onTouchMove={handlePullMove} onTouchEnd={handlePullEnd}>
        {images.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '200px' }}>
            {isOwner ? t('uploadHint') : t('noImagesYet')}
          </div>
        ) : displayImages.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '100px' }}>
            {filterMode === 'selected' ? t('noSelectedImages') : t('noUnselectedImages')}
          </div>
        ) : (
          <div className={`pool-grid${layoutMode === 'list' ? ' pool-list' : ''}`} style={layoutMode === 'grid' ? { columnCount: gridCols } : undefined}>
            {paginatedImages.map((img) => {
              const poolIdx = images.indexOf(img);
              const selOrder = selectionOrder.get(img.id);
              const heat = selectionHeat[img.id] || 0;
              const viewers = photoViewers[img.id];
              const isLoaded = imgLoadState[img.id];
              return (
                <div
                  key={img.id}
                  className={`pool-thumb${imgLoadState[img.id] ? ' img-loaded' : ''}${selectedImageIds.has(img.id) ? ' is-selected' : ''}${justSelected === img.id ? ' just-selected' : ''}${myPickSet.has(img.id) ? ' is-my-pick' : ''}${compareMode && comparePhotos.includes(img.id) ? ' compare-selected' : ''}`}
                  onClick={() => {
                    if (poolLongPress.current.triggered) { poolLongPress.current.triggered = false; return; }
                    if (batchMode) { handleBatchToggle(img.id); return; }
                    if (compareMode) { handleCompareSelect(img.id); return; }
                    (selectionLocked && !isOwner) ? handleMyPick(img.id) : handleSelect(img.id);
                  }}
                  onPointerDown={() => {
                    if (compareMode) return;
                    poolLongPress.current.triggered = false;
                    poolLongPress.current.timer = setTimeout(() => {
                      poolLongPress.current.triggered = true;
                      setViewer({ mode: 'view', index: poolIdx, imageIds: images.map((i) => i.id) });
                    }, 700);
                  }}
                  onPointerUp={() => clearTimeout(poolLongPress.current.timer)}
                  onPointerLeave={() => clearTimeout(poolLongPress.current.timer)}
                  onPointerCancel={() => clearTimeout(poolLongPress.current.timer)}
                  draggable={!selectedImageIds.has(img.id) && !compareMode}
                  onDragStart={(e) => handlePoolDragStart(e, img.id)}
                >
                  {/* Skeleton placeholder */}
                  {!isLoaded && <div className="skeleton-img" />}
                  <img
                    src={thumbUrl(img)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={{ pointerEvents: 'none', opacity: isLoaded ? 1 : 0, ...getFocalStyle(img.id) }}
                    onLoad={() => handleImgLoad(img.id)}
                  />
                  {/* Heatmap overlay */}
                  {showHeatmap && heat > 0 && (
                    <div className="heatmap-overlay" style={{ opacity: 0.15 + heat * 0.45 }} />
                  )}
                  {selOrder && <span className="pool-select-badge">{selOrder}</span>}
                  {/* Reaction badge */}
                  {reactions[img.id] && (
                    <span className="pool-react-badge">
                      {Object.entries(reactions[img.id]).slice(0, 2).map(([em, cnt]) => (
                        <span key={em}>{em}{cnt > 1 ? cnt : ''}</span>
                      ))}
                    </span>
                  )}
                  {/* Live cursor: who's viewing */}
                  {viewers && (
                    <span className="pool-viewer-badge">{viewers.length > 1 ? `👁 ${viewers.length}` : `👁 ${viewers[0]}`}</span>
                  )}
                  {/* Tags */}
                  {tags[img.id]?.length > 0 && (
                    <span className="pool-tag-badge">#{tags[img.id][0]}{tags[img.id].length > 1 ? `+${tags[img.id].length - 1}` : ''}</span>
                  )}
                  {/* Compare checkmark */}
                  {compareMode && comparePhotos.includes(img.id) && (
                    <span className="compare-check">✓</span>
                  )}
                  {batchMode && batchSelected.has(img.id) && (
                    <span className="compare-check" style={{ background: '#e74c3c' }}>✓</span>
                  )}
                  {isOwner && !compareMode && !batchMode && <button className="delete-btn" onClick={(e) => handleDelete(e, img.id)}>✕</button>}
                  {layoutMode === 'list' && (
                    <div className="pool-list-info">
                      <span className="pool-list-name">{img.original_name || 'Unnamed'}</span>
                      <span className="pool-list-date">{new Date(img.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          {hasMore && (
            <button className="btn-secondary" style={{ width: '100%', marginTop: 12 }}
              onClick={() => setLoadMoreCount(p => p + 60)}>
              {lang === 'ko' ? `더 보기 (${displayImages.length - loadMoreCount}장 남음)` : `Load more (${displayImages.length - loadMoreCount} remaining)`}
            </button>
          )}
      </div>

      {/* BOTTOM BAR */}
      {isOwner && (
        <div className="bottom-bar">
          <div className="bottom-bar-row">
            <button className={`upload-btn${uploading ? ' uploading' : ''}`} onClick={() => fileInputRef.current?.click()}>
              {uploading ? `${t('uploading')} ${uploadProgress}` : t('addPhotos')}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
          </div>
          <div className="bottom-bar-row" style={{ justifyContent: 'space-between' }}>
            <label className="watermark-toggle">
              <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
              <span>{t('watermark')}</span>
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {selections.length > 0 && (
                <button className="bottom-action-btn" onClick={handleZipDownload} disabled={zipProgress !== null}>
                  {zipProgress !== null ? `ZIP ${zipProgress}%` : t('zipDownload')}
                </button>
              )}
              {selections.length > 1 && (
                <button className="bottom-action-btn" onClick={() => setShowCollage(true)}>{t('collage')}</button>
              )}
              <button className="bottom-action-btn" onClick={() => setShowPasswordChange(true)}>{t('password')}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {/* ====== MODALS ====== */}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handlePasswordSubmit}>
            <div className="modal-title">{t('adminAuth')}</div>
            <div className="modal-desc">
              {user && post?.user_id && post.user_id !== user.id
                ? '이 게시물은 다른 계정에 연결되어 있습니다.'
                : !user ? '로그인하거나 비밀번호로 인증하세요' : '비밀번호를 입력하면 관리할 수 있습니다'}
            </div>
            {!user && (
              <Link to={`/login?redirect=/p/${postId}`} className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                onClick={() => setShowPasswordModal(false)}>로그인으로 인증</Link>
            )}
            {post?.password_hash && (
              <>
                {!user && <div className="modal-divider"><span>또는</span></div>}
                <input className="home-input" type="password" placeholder={t('adminPassword')} value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} autoFocus />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>{t('cancel')}</button>
                  <button type="submit" className="btn-primary" disabled={!passwordInput.trim()}>{t('confirm')}</button>
                </div>
              </>
            )}
            {!post?.password_hash && (
              <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>{t('cancel')}</button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Snapshot Save */}
      {showSnapshotSave && (
        <div className="modal-overlay" onClick={() => setShowSnapshotSave(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveSnapshot}>
            <div className="modal-title">{(selectionLocked && !isOwner) ? t('saveMyPick') : t('saveSnapshot')}</div>
            <input className="home-input" type="text" placeholder={`${t('snapshots')} ${snapshots.length + 1}`} value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowSnapshotSave(false)}>{t('cancel')}</button>
              <button type="submit" className="btn-primary">{t('save')}</button>
            </div>
          </form>
        </div>
      )}

      {/* QR Modal */}
      {qrDataUrl && (
        <div className="modal-overlay" onClick={() => setQrDataUrl(null)}>
          <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ textAlign: 'center' }}>{post.title}</div>
            <img src={qrDataUrl} alt="QR Code" className="qr-image" />
            <div className="qr-url">{window.location.href}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setQrDataUrl(null)}>{t('close')}</button>
              <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(window.location.href); showToast(t('linkCopied')); }}>{t('linkCopied')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{confirmDialog.message}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setConfirmDialog(null)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Online Panel */}
      {showOnlinePanel && (
        <div className="modal-overlay" onClick={() => setShowOnlinePanel(false)}>
          <div className="modal online-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('online')} ({onlineUsers.length})</div>
            <div className="online-list">
              {onlineUsers.map((u, i) => (
                <div key={i} className="online-user-row">
                  <span className="online-dot" />
                  <span className="online-user-name">{u.name}</span>
                  {u.viewingPhoto && <span className="online-viewing">👁</span>}
                  {u.key === myPresenceKey.current && <span className="online-me-badge">{t('me')}</span>}
                </div>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setShowOnlinePanel(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('history')}</div>
            {selectionLog.length === 0 ? (
              <div className="modal-desc">아직 기록이 없습니다</div>
            ) : (
              <div className="history-list">
                {selectionLog.map((log, i) => {
                  const img = getImageById(log.image_id);
                  const time = new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={i} className="history-row">
                      {img && <img src={thumbUrl(img)} alt="" className="history-thumb" />}
                      <div className="history-info">
                        <span className="history-actor">{log.actor}</span>
                        <span className={`history-action ${log.action}`}>{log.action === 'select' ? '셀렉' : '해제'}</span>
                      </div>
                      <span className="history-time">{time}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn-secondary" onClick={() => setShowHistory(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      {/* Title Edit */}
      {showTitleEdit && (
        <div className="modal-overlay" onClick={() => setShowTitleEdit(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); handleTitleEdit(); }}>
            <div className="modal-title">{t('changeTitle')}</div>
            <input className="home-input" type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowTitleEdit(false)}>{t('cancel')}</button>
              <button type="submit" className="btn-primary" disabled={!editTitle.trim()}>{t('confirm')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Password Change */}
      {showPasswordChange && (
        <div className="modal-overlay" onClick={() => setShowPasswordChange(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); handlePasswordChange(); }}>
            <div className="modal-title">{t('changePassword')}</div>
            <input className="home-input" type="password" placeholder={t('newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowPasswordChange(false)}>{t('cancel')}</button>
              <button type="submit" className="btn-primary" disabled={!newPassword.trim()}>{t('confirm')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Collage */}
      {showCollage && (
        <div className="modal-overlay" onClick={() => setShowCollage(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('collage')}</div>
            <div className="modal-desc">{selections.length}{lang === 'ko' ? '장의 사진으로 콜라주를 만듭니다' : ' photos will be collaged'}</div>
            <div className="collage-preview">
              {selections.slice(0, 9).map((sel) => {
                const img = getImageById(sel.image_id);
                return img ? <img key={sel.image_id} src={thumbUrl(img)} alt="" /> : null;
              })}
              {selections.length > 9 && <span className="collage-more">+{selections.length - 9}</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowCollage(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={generateCollage}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Settings</div>
            <div className="settings-list">
              <div className="settings-row" onClick={toggleTheme}>
                <span>{theme === 'dark' ? '🌙' : '☀️'} {theme === 'dark' ? t('darkMode') : t('lightMode')}</span>
                <span className="settings-value">{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </div>
              <div className="settings-row" onClick={toggleLang}>
                <span>🌐 Language</span>
                <span className="settings-value">{lang === 'ko' ? '한국어' : 'English'}</span>
              </div>
              <div className="settings-row" onClick={() => { setShowSettings(false); setShowStats(true); }}>
                <span>📊 {lang === 'ko' ? '통계' : 'Stats'}</span>
                <span className="settings-value">{images.length} / {selections.length}</span>
              </div>
              <div className="settings-row" onClick={() => { setShowSettings(false); setShowActivityFeed(true); }}>
                <span>📋 {t('activity')}</span>
                <span className="settings-value">{activityFeed.length}</span>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => setShowSettings(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {showActivityFeed && (
        <div className="modal-overlay" onClick={() => setShowActivityFeed(false)}>
          <div className="modal history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('activity')}</div>
            {activityFeed.length === 0 ? (
              <div className="modal-desc">{lang === 'ko' ? '아직 활동이 없습니다' : 'No activity yet'}</div>
            ) : (
              <div className="history-list">
                {activityFeed.map((act, i) => (
                  <div key={i} className="history-row">
                    <div className="history-info">
                      <span className="history-actor">{act.actor}</span>
                      <span className={`history-action ${act.action}`}>
                        {act.action === 'select' ? '셀렉' : act.action === 'deselect' ? '해제' : act.action === 'upload' ? '업로드' : act.action === 'comment' ? '댓글' : act.action === 'snapshot' ? '스냅샷' : act.action}
                      </span>
                      <span className="history-detail">{act.detail}</span>
                    </div>
                    <span className="history-time">{new Date(act.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-secondary" onClick={() => setShowActivityFeed(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{lang === 'ko' ? '통계' : 'Stats'}</div>
            <div className="settings-list">
              <div className="settings-row"><span>{lang === 'ko' ? '전체 사진' : 'Total Photos'}</span><span className="settings-value">{images.length}</span></div>
              <div className="settings-row"><span>{lang === 'ko' ? '셀렉됨' : 'Selected'}</span><span className="settings-value">{selections.length}</span></div>
              <div className="settings-row"><span>{lang === 'ko' ? '스냅샷' : 'Snapshots'}</span><span className="settings-value">{snapshots.length}</span></div>
              <div className="settings-row"><span>{lang === 'ko' ? '접속자' : 'Online'}</span><span className="settings-value">{onlineCount}</span></div>
              <div className="settings-row"><span>{lang === 'ko' ? '리액션' : 'Reactions'}</span><span className="settings-value">{Object.values(reactions).reduce((sum, r) => sum + Object.values(r).reduce((s, c) => s + c, 0), 0)}</span></div>
              <div className="settings-row"><span>{lang === 'ko' ? '태그' : 'Tags'}</span><span className="settings-value">{allTags.length}</span></div>
              {post.created_at && <div className="settings-row"><span>{lang === 'ko' ? '생성일' : 'Created'}</span><span className="settings-value">{new Date(post.created_at).toLocaleDateString()}</span></div>}
            </div>
            <button className="btn-secondary" onClick={() => setShowStats(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      {/* ====== VIEWER ====== */}
      {viewer && (() => {
        const isSideBySide = viewer.mode === 'sideBySide';
        const total = viewer.mode === 'compare'
          ? Math.max(viewer.imageIds.length, (viewer.compareImageIds || []).length)
          : isSideBySide ? 1
          : viewer.imageIds.length;
        return (
          <div
            className="viewer-overlay"
            onTouchStart={(e) => {
              viewerTouchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              if (viewerZoom.scale > 1 || isSideBySide) return;
              const dx = e.changedTouches[0].clientX - viewerTouchRef.current.startX;
              const dy = e.changedTouches[0].clientY - viewerTouchRef.current.startY;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                e.preventDefault();
                navigateViewer(dx > 0 ? -1 : 1);
              }
            }}
          >
            <div className="viewer-header">
              <div className="viewer-header-left">
                {viewer.mode === 'view' && (
                  <>
                    <button className={`viewer-tool-btn${slideshowActive ? ' active' : ''}`} onClick={() => setSlideshowActive((p) => !p)} aria-label={t('slideshow')}>
                      {slideshowActive ? '⏸' : '▶'}
                    </button>
                    <button className={`viewer-tool-btn${showImageInfo ? ' active' : ''}`} onClick={() => setShowImageInfo((p) => !p)} aria-label={t('info')}>ℹ</button>
                    <button className={`viewer-tool-btn${showComments ? ' active' : ''}`} onClick={() => setShowComments((p) => !p)} aria-label="Comments">💬</button>
                    <button className="viewer-tool-btn" onClick={handleSaveCurrentPhoto} aria-label={t('savePhoto')}>⬇</button>
                    {isOwner && <button className={`viewer-tool-btn${showFocalPicker ? ' active' : ''}`} onClick={() => setShowFocalPicker(p => p ? null : viewer.imageIds[viewer.index])} aria-label="Crop position">✂</button>}
                  </>
                )}
                {isSideBySide && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{t('compare')}</span>}
              </div>
              <div className="viewer-counter">
                {viewer.mode === 'compare' && <span className="viewer-mode-label">{t('compare')} · </span>}
                {!isSideBySide && <>{viewer.index + 1} / {total}</>}
              </div>
              <button className="viewer-close" onClick={() => { setViewer(null); setSlideshowActive(false); setViewerZoom({ scale: 1, x: 0, y: 0 }); setShowComments(false); }} aria-label={t('close')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="viewer-body" onClick={() => { if (!isSideBySide) setViewer(null); }}>
              {viewer.mode === 'view' ? (() => {
                const imgId = viewer.imageIds[viewer.index];
                const img = getImageById(imgId);
                const imgReactions = reactions[imgId] || {};
                const memo = memos[imgId] || '';
                const imgComments = comments[imgId] || [];
                const imgTags = tags[imgId] || [];
                return img ? (
                  <div className="viewer-img-wrap" onClick={(e) => e.stopPropagation()}
                    onTouchStart={handleViewerPinchStart} onTouchMove={handleViewerPinchMove}>
                    <div className="viewer-img-zoom" style={{ transform: `scale(${viewerZoom.scale})`, transformOrigin: 'center center' }}
                      onClick={(e) => {
                        if (showFocalPicker === imgId) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = (e.clientX - rect.left) / rect.width;
                          const y = (e.clientY - rect.top) / rect.height;
                          handleSetFocalPoint(imgId, x, y);
                          setShowFocalPicker(null);
                          showToast(lang === 'ko' ? '크롭 위치 설정됨' : 'Crop position set');
                        } else {
                          handleViewerDoubleTap();
                        }
                      }}>
                      <img src={storageUrl(img.storage_path)} alt="" />
                      {showImageInfo && (
                        <div className="viewer-info-overlay">
                          <span>{img.original_name || t('noName')}</span>
                          <span>{new Date(img.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {selectionOrder.get(imgId) && <span>{t('selectionN', { n: selectionOrder.get(imgId) })}</span>}
                          {imgTags.length > 0 && <span>{imgTags.map((tg) => `#${tg}`).join(' ')}</span>}
                        </div>
                      )}
                    </div>
                    {isOwner && showFocalPicker === imgId && (
                      <div className="focal-picker-hint">
                        {lang === 'ko' ? '이미지를 탭하여 중심점을 설정하세요' : 'Tap image to set focal point'}
                      </div>
                    )}
                    <div className="viewer-bottom-bar">
                      <div className="viewer-reactions">
                        {REACTION_EMOJIS.map((em) => (
                          <button key={em} className={`viewer-react-btn${myReactions[imgId] === em ? ' active' : ''}`} onClick={() => handleReact(imgId, em)}>
                            <span>{em}</span>
                            {imgReactions[em] > 0 && <span className="react-count">{imgReactions[em]}</span>}
                          </button>
                        ))}
                      </div>
                      {/* Tag row */}
                      <div className="viewer-tag-row">
                        {imgTags.map((tg) => (
                          <span key={tg} className="viewer-tag" onClick={() => handleRemoveTag(imgId, tg)}>#{tg} ×</span>
                        ))}
                        {isOwner && (
                          <form className="viewer-tag-form" onSubmit={(e) => { e.preventDefault(); handleAddTag(imgId); }}>
                            <input placeholder={t('addTag')} value={showTagEditor === imgId ? tagInput : ''} onFocus={() => setShowTagEditor(imgId)} onChange={(e) => setTagInput(e.target.value)} className="viewer-tag-input" />
                          </form>
                        )}
                      </div>
                      {/* Memo */}
                      <div className="viewer-memo-row">
                        {editingMemo === imgId ? (
                          <input className="viewer-memo-input" autoFocus placeholder="메모..." defaultValue={memo}
                            onBlur={(e) => handleMemoSave(imgId, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleMemoSave(imgId, e.target.value); }} />
                        ) : (
                          <button className="viewer-memo-btn" onClick={() => setEditingMemo(imgId)}>
                            {memo || t('addMemo')}
                          </button>
                        )}
                      </div>
                      {/* Comments thread */}
                      {showComments && (
                        <div className="viewer-comments">
                          <div className="comments-list">
                            {imgComments.map((c, i) => (
                              <div key={i} className="comment-row">
                                <span className="comment-author">{c.author}</span>
                                <span className="comment-text">{c.text}</span>
                                <span className="comment-time">{new Date(c.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ))}
                          </div>
                          <form className="comment-form" onSubmit={(e) => { e.preventDefault(); handleCommentSubmit(imgId); }}>
                            <input placeholder={lang === 'ko' ? '댓글 입력...' : 'Add comment...'} value={commentInput} onChange={(e) => setCommentInput(e.target.value)} className="comment-input" />
                            <button type="submit" className="comment-send" disabled={!commentInput.trim()}>↑</button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                ) : <div className="viewer-empty">이미지를 찾을 수 없습니다</div>;
              })() : isSideBySide ? (
                /* Side-by-side photo comparison */
                <div className="viewer-compare" onClick={(e) => e.stopPropagation()}>
                  {comparePhotos.map((imgId, i) => {
                    const img = getImageById(imgId);
                    return (
                      <div key={i} className="viewer-compare-panel">
                        <span className="viewer-compare-label">{img?.original_name || `Photo ${i + 1}`}</span>
                        {img ? <img src={storageUrl(img.storage_path)} alt="" /> : <div className="viewer-empty">—</div>}
                      </div>
                    );
                  })}
                  {comparePhotos.length === 2 && <div className="viewer-compare-divider" />}
                </div>
              ) : (
                /* Snapshot compare mode */
                <div className="viewer-compare">
                  <div className="viewer-compare-panel">
                    <span className="viewer-compare-label">{t('currentSelection')}</span>
                    {(() => {
                      const imgId = viewer.imageIds[viewer.index];
                      const img = imgId ? getImageById(imgId) : null;
                      return img ? <img src={storageUrl(img.storage_path)} alt="" /> : <div className="viewer-empty">—</div>;
                    })()}
                  </div>
                  <div className="viewer-compare-divider" />
                  <div className="viewer-compare-panel">
                    <span className="viewer-compare-label">{viewer.snapshotName}</span>
                    {(() => {
                      const imgId = viewer.compareImageIds[viewer.index];
                      const img = imgId ? getImageById(imgId) : null;
                      return img ? <img src={storageUrl(img.storage_path)} alt="" /> : <div className="viewer-empty">—</div>;
                    })()}
                  </div>
                </div>
              )}

              {!isSideBySide && (
                <>
                  <button className="viewer-nav prev" disabled={viewer.index === 0} onClick={(e) => { e.stopPropagation(); navigateViewer(-1); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button className="viewer-nav next" disabled={viewer.index >= total - 1} onClick={(e) => { e.stopPropagation(); navigateViewer(1); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
