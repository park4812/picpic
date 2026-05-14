import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error: err } = await signUp(email, password);
        if (err) throw err;
        // Try auto-login (if email confirmation is disabled)
        const { error: loginErr } = await signIn(email, password);
        if (!loginErr) {
          navigate('/');
          return;
        }
        // If confirmation is required
        setSignupDone(true);
      } else {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
        navigate('/');
      }
    } catch (err) {
      const msg = err.message || '오류가 발생했습니다';
      if (msg.includes('Invalid login')) setError('이메일 또는 비밀번호가 잘못되었습니다');
      else if (msg.includes('already registered')) setError('이미 가입된 이메일입니다');
      else if (msg.includes('valid email')) setError('올바른 이메일을 입력해주세요');
      else if (msg.includes('at least')) setError('비밀번호는 6자 이상이어야 합니다');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (signupDone) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">PicPic</div>
          <div className="login-message">
            <strong>가입 완료!</strong>
            <p>이메일 인증 링크를 확인해주세요.<br />인증 후 로그인할 수 있습니다.</p>
          </div>
          <button className="btn-primary" onClick={() => { setSignupDone(false); setMode('login'); }}>
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-back" aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="login-logo">PicPic</div>
        <div className="login-tabs">
          <button className={`login-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>로그인</button>
          <button className={`login-tab${mode === 'signup' ? ' active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>회원가입</button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            className="login-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="login-input"
            type="password"
            placeholder={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
