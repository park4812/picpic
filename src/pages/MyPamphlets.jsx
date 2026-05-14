import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

export default function MyPamphlets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pamphlets, setPamphlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (user === null) { navigate('/login'); return; }
    if (user === undefined) return; // still loading auth
    loadPamphlets();
  }, [user]);

  const loadPamphlets = async () => {
    const { data, error } = await supabase
      .from('pamphlets')
      .select('id, form_data, is_draft, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (!error) setPamphlets(data || []);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (deleting) return;
    setDeleting(id);
    // Delete cover image from storage
    await supabase.storage.from('pamphlet-covers').remove([`${user.id}/${id}`]);
    const { error } = await supabase.from('pamphlets').delete().eq('id', id);
    if (!error) setPamphlets((prev) => prev.filter((p) => p.id !== id));
    setDeleting(null);
  };

  if (user === undefined || loading) {
    return (
      <div className="login-page">
        <div style={{ color: 'var(--text-dim)' }}>불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="recruit-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="post-title">내 팜플렛</div>
        <Link to="/recruit" className="pam-new-btn" aria-label="새로 만들기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </Link>
      </header>

      {pamphlets.length === 0 ? (
        <div className="pam-empty">
          <span style={{ fontSize: 40, marginBottom: 12 }}>📄</span>
          <p>아직 만든 팜플렛이 없어요</p>
          <Link to="/recruit" className="btn-primary" style={{ marginTop: 16, textDecoration: 'none', display: 'inline-block' }}>새로 만들기</Link>
        </div>
      ) : (
        <div className="pam-list">
          {pamphlets.map((p) => {
            const fd = p.form_data || {};
            const title = fd.concept || fd.author || '제목 없음';
            const sub = [fd.date, fd.location].filter(Boolean).join(' · ') || '내용 없음';
            const date = new Date(p.updated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return (
              <div key={p.id} className="pam-item">
                <Link to={`/recruit/${p.id}`} className="pam-item-body">
                  <div className="pam-item-title">
                    {p.is_draft && <span className="pam-draft-badge">임시</span>}
                    {title}
                  </div>
                  <div className="pam-item-sub">{sub}</div>
                  <div className="pam-item-date">{date}</div>
                </Link>
                <button
                  className="pam-item-delete"
                  onClick={() => handleDelete(p.id)}
                  disabled={deleting === p.id}
                  aria-label="삭제"
                >
                  {deleting === p.id ? '...' : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
